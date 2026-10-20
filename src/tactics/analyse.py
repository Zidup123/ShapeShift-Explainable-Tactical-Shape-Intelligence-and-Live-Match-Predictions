"""
Season-level shape analysis for the ShapeShift tactical agent.

Produces:
  - match_shapes DataFrame  (dominant shape per match/team/phase)
  - shape_season DataFrame  → Data/shape_season.csv
  - storylines list         → consumed by facts.py
  - overload_stats dict     → consumed by facts.py
"""
import numpy as np
import pandas as pd

TENTATIVE_THRESHOLD = 5  # matches below this → confidence "tentative"


def dominant_shape_per_match(shape_phase: pd.DataFrame) -> pd.DataFrame:
    """
    For each (match_id, team_id, phase) find the plurality shape label,
    weighting high-confidence windows more heavily.
    """
    df = shape_phase.copy()
    df["weight"] = df["confidence"].map({"high": 2.0, "medium": 1.0, "low": 0.5})

    rows = []
    for (match_id, team_id, phase), grp in df.groupby(["match_id", "team_id", "phase"]):
        votes = grp.groupby("shape_label")["weight"].sum()
        label = votes.idxmax()
        rows.append({
            "match_id": match_id,
            "team_id": team_id,
            "phase": phase,
            "shape": label,
            "vote_share": round(float(votes[label] / votes.sum()), 3),
            "mean_fit": round(float(grp[grp["shape_label"] == label]["fit_score"].mean()), 4),
        })
    return pd.DataFrame(rows)


def season_shape_stats(match_shapes: pd.DataFrame, matches: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate xG for/against per team per (shape_in, shape_out) combination.
    Returns the shape_season contract DataFrame.
    """
    pivot = (
        match_shapes
        .pivot(index=["match_id", "team_id"], columns="phase", values="shape")
        .reset_index()
    )
    pivot.columns.name = None
    pivot = pivot.rename(columns={
        "in_possession": "shape_in",
        "out_of_possession": "shape_out",
    })

    home = matches[["match_id", "home_id", "home_xg", "away_xg"]].rename(
        columns={"home_id": "team_id", "home_xg": "xg_for", "away_xg": "xg_against"}
    )
    away = matches[["match_id", "away_id", "away_xg", "home_xg"]].rename(
        columns={"away_id": "team_id", "away_xg": "xg_for", "home_xg": "xg_against"}
    )
    outcomes = pd.concat([home, away], ignore_index=True)

    merged = pivot.merge(outcomes, on=["match_id", "team_id"])

    rows = []
    for (team_id, shape_in, shape_out), grp in merged.groupby(["team_id", "shape_in", "shape_out"]):
        n = len(grp)
        rows.append({
            "team_id": team_id,
            "shape_in": shape_in,
            "shape_out": shape_out,
            "matches": n,
            "xg_for_per_match": round(float(grp["xg_for"].mean()), 3),
            "xg_against_per_match": round(float(grp["xg_against"].mean()), 3),
            "n": n,
            "confidence": "tentative" if n < TENTATIVE_THRESHOLD else "ok",
        })

    return (
        pd.DataFrame(rows)
        .sort_values(["team_id", "matches"], ascending=[True, False])
        .reset_index(drop=True)
    )


def find_storylines(match_shapes: pd.DataFrame, matches: pd.DataFrame) -> list:
    """
    Find clubs with a mid-season shape change (in possession) and compute
    before/after xG deltas.  Requires at least 3 matches on each side.
    """
    ms = match_shapes[match_shapes["phase"] == "in_possession"].copy()
    ms = ms.merge(matches[["match_id", "matchday"]], on="match_id")

    home_xg = matches[["match_id", "home_id", "home_xg", "away_xg"]].rename(
        columns={"home_id": "team_id", "home_xg": "xg_for", "away_xg": "xg_against"}
    )
    away_xg = matches[["match_id", "away_id", "away_xg", "home_xg"]].rename(
        columns={"away_id": "team_id", "away_xg": "xg_for", "home_xg": "xg_against"}
    )
    outcomes = pd.concat([home_xg, away_xg], ignore_index=True)

    storylines = []

    for team_id, grp in ms.sort_values("matchday").groupby("team_id"):
        by_md = grp.sort_values("matchday").drop_duplicates("matchday")
        # Identify runs of the same shape
        by_md = by_md.copy()
        by_md["run"] = (by_md["shape"] != by_md["shape"].shift()).cumsum()
        runs = by_md.groupby("run").agg(
            shape=("shape", "first"),
            from_md=("matchday", "min"),
            to_md=("matchday", "max"),
            n=("matchday", "count"),
        ).reset_index(drop=True)

        if len(runs) < 2:
            continue

        for i in range(1, len(runs)):
            old_run = runs.iloc[i - 1]
            new_run = runs.iloc[i]
            change_md = int(new_run["from_md"])

            before_mids = grp[grp["matchday"] < change_md]["match_id"]
            after_mids = grp[grp["matchday"] >= change_md]["match_id"]

            if len(before_mids) < 3 or len(after_mids) < 3:
                continue

            b = outcomes[(outcomes["team_id"] == team_id) & (outcomes["match_id"].isin(before_mids))]
            a = outcomes[(outcomes["team_id"] == team_id) & (outcomes["match_id"].isin(after_mids))]

            storylines.append({
                "team_id": team_id,
                "from_shape": old_run["shape"],
                "to_shape": new_run["shape"],
                "change_matchday": change_md,
                "before_matches": int(len(b)),
                "after_matches": int(len(a)),
                "xg_for_before": round(float(b["xg_for"].mean()), 3),
                "xg_for_after": round(float(a["xg_for"].mean()), 3),
                "xg_against_before": round(float(b["xg_against"].mean()), 3),
                "xg_against_after": round(float(a["xg_against"].mean()), 3),
                "confidence": "tentative" if len(b) < 5 or len(a) < 5 else "ok",
            })

    return storylines


def overload_shot_stats(events: pd.DataFrame, overloads: pd.DataFrame,
                        tracking: pd.DataFrame) -> dict:
    """
    Shots per possession minute by best zone overload bucket.
    Uses only open-play shots and avoids gt_ columns.
    """
    open_shots = events[(events["type"] == "shot") & (events["is_counter"] == 0)]

    # Best overload per (match_id, minute, team_id) — max across zones
    best_ov = (
        overloads
        .groupby(["match_id", "minute", "team_id"])["overload"]
        .max()
        .reset_index()
        .rename(columns={"overload": "best_overload"})
    )

    # One possession-minute row per (match_id, minute, team_id)
    poss = (
        tracking[tracking["phase"] == "in_possession"][["match_id", "minute", "team_id"]]
        .drop_duplicates()
    )
    poss = poss.merge(best_ov, on=["match_id", "minute", "team_id"], how="left").fillna({"best_overload": 0})

    shot_counts = (
        open_shots
        .groupby(["match_id", "minute", "team_id"])
        .size()
        .reset_index(name="shots")
    )
    poss = poss.merge(shot_counts, on=["match_id", "minute", "team_id"], how="left").fillna({"shots": 0})
    poss["bucket"] = poss["best_overload"].clip(-1, 3).astype(int)

    stats = {}
    for bucket, grp in poss.groupby("bucket"):
        stats[int(bucket)] = {
            "shots_per_min": round(float(grp["shots"].mean()), 4),
            "minutes": int(len(grp)),
        }
    return stats
