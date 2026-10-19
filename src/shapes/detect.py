#!/usr/bin/env python3
"""
ShapeShift shape agent — shape detection and overload computation.

Reads Data/tracking.csv and writes:
  Data/shape_phase.csv   — one row per 10-minute window per team per phase
  Data/overloads.csv     — one row per minute per zone for the possessing team

Rules:
  - Never reads shape_schedule.csv or any gt_ column.
  - Uses Hungarian assignment (scipy) for template matching.
  - Reports a fit_score and confidence label so ambiguous windows are visible.
"""
import argparse
import os

import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment

# ---------------------------------------------------------------------------
# Shape templates — 10 outfield players, (x, y) in own attacking frame.
# Copied from generate_season.py so detection never needs ground truth.
# ---------------------------------------------------------------------------
def _line(x, ys):
    return [(float(x), float(y)) for y in ys]

IN_SHAPES = {
    "4-3-3":   _line(28, [12, 37, 63, 88]) + _line(50, [25, 50, 75])          + _line(75, [15, 50, 85]),
    "4-2-3-1": _line(28, [12, 37, 63, 88]) + _line(42, [38, 62])              + _line(62, [20, 50, 80]) + _line(78, [50]),
    "3-4-3":   _line(26, [25, 50, 75])     + _line(50, [10, 37, 63, 90])      + _line(74, [18, 50, 82]),
    "3-5-2":   _line(26, [25, 50, 75])     + _line(50, [8, 30, 50, 70, 92])   + _line(74, [38, 62]),
    "4-4-2":   _line(28, [12, 37, 63, 88]) + _line(50, [12, 37, 63, 88])      + _line(74, [38, 62]),
    "4-1-4-1": _line(28, [12, 37, 63, 88]) + _line(40, [50])                  + _line(58, [12, 37, 63, 88]) + _line(78, [50]),
    "3-2-5":   _line(26, [25, 50, 75])     + _line(42, [38, 62])              + _line(74, [8, 30, 50, 70, 92]),
    "2-3-5":   _line(28, [35, 65])         + _line(45, [25, 50, 75])          + _line(74, [8, 30, 50, 70, 92]),
}
OUT_SHAPES = {
    "4-4-2":   _line(26, [12, 37, 63, 88]) + _line(44, [12, 37, 63, 88]) + _line(60, [38, 62]),
    "4-5-1":   _line(26, [12, 37, 63, 88]) + _line(44, [8, 30, 50, 70, 92]) + _line(60, [50]),
    "5-3-2":   _line(24, [8, 28, 50, 72, 92]) + _line(42, [25, 50, 75])   + _line(58, [38, 62]),
    "5-4-1":   _line(24, [8, 28, 50, 72, 92]) + _line(42, [12, 37, 63, 88]) + _line(58, [50]),
    "4-1-4-1": _line(26, [12, 37, 63, 88]) + _line(36, [50])              + _line(46, [12, 37, 63, 88]) + _line(60, [50]),
}

for _name, _pts in {**IN_SHAPES, **OUT_SHAPES}.items():
    assert len(_pts) == 10, f"Template {_name} has {len(_pts)} points"

ZONES = ["L_wide", "L_half", "central", "R_half", "R_wide"]
ZONE_EDGES = np.array([0, 20, 38, 62, 80, 100.0001])
FINAL_THIRD_X = 60.0
REST_DEFENCE_X = 45.0
WINDOW_SIZE = 10  # minutes


# ---------------------------------------------------------------------------
# Template matching
# ---------------------------------------------------------------------------
def _assignment_cost(positions, template):
    """Mean assignment distance (pitch units scaled to metres) using Hungarian algorithm."""
    pts = np.array(positions) * np.array([1.05, 0.68])   # x * 1.05m, y * 0.68m
    tpl = np.array(template)  * np.array([1.05, 0.68])
    diff = pts[:, np.newaxis, :] - tpl[np.newaxis, :, :]  # (10, 10, 2)
    dist = np.sqrt((diff ** 2).sum(axis=2))               # (10, 10)
    row_idx, col_idx = linear_sum_assignment(dist)
    return float(dist[row_idx, col_idx].mean())


def best_fit(positions, templates):
    """
    Match 10 (x, y) positions against all templates.

    Returns:
        label      — name of the closest template
        fit_score  — 1 / (1 + mean_cost), higher is better, range (0, 1]
        confidence — 'high' / 'medium' / 'low' based on gap to second-best
    """
    costs = {label: _assignment_cost(positions, tpl) for label, tpl in templates.items()}
    ranked = sorted(costs, key=costs.__getitem__)
    best = ranked[0]
    fit_score = round(1.0 / (1.0 + costs[best]), 4)

    gap = (costs[ranked[1]] - costs[best]) if len(ranked) > 1 else 99.0
    confidence = "high" if gap >= 3.0 else ("medium" if gap >= 1.5 else "low")

    return best, fit_score, confidence


# ---------------------------------------------------------------------------
# Shape detection — rolling 10-minute windows
# ---------------------------------------------------------------------------
def detect_shapes(tracking_df, window_size=WINDOW_SIZE):
    """
    Detect team shape in non-overlapping windows of `window_size` minutes.

    Returns shape_phase DataFrame with columns:
        match_id, team_id, phase, window_start, window_end,
        shape_label, fit_score, confidence
    """
    rows = []

    for (match_id, team_id, phase), grp in tracking_df.groupby(["match_id", "team_id", "phase"]):
        templates = IN_SHAPES if phase == "in_possession" else OUT_SHAPES
        minutes = sorted(grp["minute"].unique())
        if not minutes:
            continue

        w_start = minutes[0]
        max_min = minutes[-1]

        while w_start <= max_min:
            w_end = min(w_start + window_size - 1, max_min)
            window = grp[grp["minute"].between(w_start, w_end)]

            # Outfield only — GK player_id ends with "00"
            outfield = window[~window["player_id"].str.endswith("00")]
            avg = outfield.groupby("player_id")[["x", "y"]].median()

            if len(avg) < 10:
                w_start += window_size
                continue

            # If a team has more than 10 outfield slots recorded (shouldn't happen),
            # take the 10 with the most data points across the window.
            if len(avg) > 10:
                counts = outfield.groupby("player_id").size().nlargest(10).index
                avg = avg.loc[counts]

            positions = avg[["x", "y"]].values.tolist()
            label, fit_score, confidence = best_fit(positions, templates)

            rows.append({
                "match_id": match_id,
                "team_id": team_id,
                "phase": phase,
                "window_start": int(w_start),
                "window_end": int(w_end),
                "shape_label": label,
                "fit_score": fit_score,
                "confidence": confidence,
            })
            w_start += window_size

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Overload computation — per minute, for the possessing team
# ---------------------------------------------------------------------------
def _zone_of(y):
    return int(min(max(int(np.searchsorted(ZONE_EDGES, y, side="right")) - 1, 0), 4))


def compute_overloads(tracking_df):
    """
    Compute zone overloads for the team in possession each minute.

    Overload = (attackers in zone) - (defenders in zone) for the final third
    (x >= 60), where defenders are mapped into the attacking team's frame
    via (100 - x, 100 - y).

    rest_defence = outfield players of the possessing team with x < 45.

    Returns overloads DataFrame with columns:
        match_id, minute, team_id, zone,
        attackers, defenders, overload, rest_defence
    """
    rows = []

    for (match_id, minute), grp in tracking_df.groupby(["match_id", "minute"]):
        poss = grp[grp["phase"] == "in_possession"]
        dfnd = grp[grp["phase"] == "out_of_possession"]

        if poss.empty or dfnd.empty:
            continue

        team_id = poss["team_id"].iloc[0]

        att_out = poss[~poss["player_id"].str.endswith("00")][["x", "y"]].values
        def_out = dfnd[~dfnd["player_id"].str.endswith("00")][["x", "y"]].values

        # Flip defending team into the attacking frame
        def_flipped = np.column_stack([100.0 - def_out[:, 0], 100.0 - def_out[:, 1]])

        att_counts = np.zeros(5, dtype=int)
        def_counts = np.zeros(5, dtype=int)

        for x, y in att_out:
            if x >= FINAL_THIRD_X:
                att_counts[_zone_of(y)] += 1
        for x, y in def_flipped:
            if x >= FINAL_THIRD_X:
                def_counts[_zone_of(y)] += 1

        rest_defence = int(np.sum(att_out[:, 0] < REST_DEFENCE_X))

        for i, zone in enumerate(ZONES):
            rows.append({
                "match_id": match_id,
                "minute": int(minute),
                "team_id": team_id,
                "zone": zone,
                "attackers": int(att_counts[i]),
                "defenders": int(def_counts[i]),
                "overload": int(att_counts[i] - def_counts[i]),
                "rest_defence": rest_defence,
            })

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def run(tracking_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)

    print(f"Loading {tracking_path} ...")
    tracking = pd.read_csv(tracking_path)
    print(f"  {len(tracking):,} rows | {tracking['match_id'].nunique()} matches | "
          f"{tracking['team_id'].nunique()} teams")

    print("Detecting shapes ...")
    shapes = detect_shapes(tracking)
    shapes_path = os.path.join(out_dir, "shape_phase.csv")
    shapes.to_csv(shapes_path, index=False)
    print(f"  {len(shapes):,} windows → {shapes_path}")

    print("Computing overloads ...")
    overloads = compute_overloads(tracking)
    ov_path = os.path.join(out_dir, "overloads.csv")
    overloads.to_csv(ov_path, index=False)
    print(f"  {len(overloads):,} rows → {ov_path}")

    return shapes, overloads


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="ShapeShift shape agent")
    ap.add_argument("--tracking", default="Data/tracking.csv", help="Path to tracking.csv")
    ap.add_argument("--out", default="Data", help="Output directory for CSV files")
    args = ap.parse_args()
    run(args.tracking, args.out)
