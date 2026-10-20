#!/usr/bin/env python3
"""
ShapeShift tactical agent — CLI runner.

Usage:
  python3 src/tactics/run.py --data Data

Reads:  tracking.csv, events.csv, matches.csv, teams.csv,
        shape_phase.csv, overloads.csv
Writes: shape_season.csv, predictions.csv, facts.json
"""
import argparse
import json
import os
import sys

import numpy as np
import pandas as pd

# Allow running from project root without installing the package
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from src.tactics.analyse import (
    dominant_shape_per_match,
    season_shape_stats,
    find_storylines,
    overload_shot_stats,
)
from src.tactics.predict import build_feature_matrix, train_and_predict
from src.tactics.facts import build_facts


class _NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


def run(data_dir: str):
    print("Loading data...")
    tracking = pd.read_csv(f"{data_dir}/tracking.csv")
    events = pd.read_csv(f"{data_dir}/events.csv")
    matches = pd.read_csv(f"{data_dir}/matches.csv")
    teams = pd.read_csv(f"{data_dir}/teams.csv")
    shape_phase = pd.read_csv(f"{data_dir}/shape_phase.csv")
    overloads = pd.read_csv(f"{data_dir}/overloads.csv")
    print(f"  {len(matches)} matches | {len(events):,} events | "
          f"{len(tracking):,} tracking rows")

    # -----------------------------------------------------------------------
    # Season analysis
    # -----------------------------------------------------------------------
    print("\nRunning season analysis...")
    match_shapes = dominant_shape_per_match(shape_phase)
    shape_season = season_shape_stats(match_shapes, matches)
    shape_season.to_csv(f"{data_dir}/shape_season.csv", index=False)
    print(f"  shape_season.csv: {len(shape_season)} rows")

    storylines = find_storylines(match_shapes, matches)
    print(f"  Storylines found: {len(storylines)}")
    for s in storylines:
        delta = round(s["xg_for_after"] - s["xg_for_before"], 3)
        print(f"    {s['team_id']}: {s['from_shape']} → {s['to_shape']} "
              f"at matchday {s['change_matchday']} | "
              f"xG for delta {delta:+.3f} | {s['confidence']}")

    ov_stats = overload_shot_stats(events, overloads, tracking)
    print(f"  Overload buckets: {sorted(ov_stats)}")

    # -----------------------------------------------------------------------
    # Prediction model
    # -----------------------------------------------------------------------
    print("\nBuilding feature matrix (56 matches × 90 minutes)...")
    feature_df = build_feature_matrix(matches, events, shape_phase, overloads, tracking)
    print(f"  {len(feature_df):,} rows")

    print("Training prediction models...")
    preds, calibration = train_and_predict(feature_df)
    preds.to_csv(f"{data_dir}/predictions.csv", index=False)
    print(f"  predictions.csv: {len(preds):,} rows")
    skill_h = round(calibration["baseline_brier_home"] - calibration["brier_p_home"], 4)
    skill_a = round(calibration["baseline_brier_away"] - calibration["brier_p_away"], 4)
    print(f"  Brier p_home={calibration['brier_p_home']} "
          f"(baseline={calibration['baseline_brier_home']}, skill={skill_h:+.4f})")
    print(f"  Brier p_away={calibration['brier_p_away']} "
          f"(baseline={calibration['baseline_brier_away']}, skill={skill_a:+.4f})")
    print(f"  Brier counter_risk={calibration['brier_counter']}")

    # -----------------------------------------------------------------------
    # Facts
    # -----------------------------------------------------------------------
    print("\nBuilding facts.json...")
    facts = build_facts(shape_season, storylines, ov_stats, calibration, matches, teams)
    with open(f"{data_dir}/facts.json", "w") as f:
        json.dump(facts, f, indent=2, cls=_NpEncoder)
    print(f"  facts.json: {len(facts)} facts")

    return shape_season, preds, facts, calibration


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="ShapeShift tactical agent")
    ap.add_argument("--data", default="Data", help="Data directory")
    args = ap.parse_args()
    run(args.data)
