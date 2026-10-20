"""
Build facts.json for the ShapeShift narrative agent.

Every number the narrative may use must appear in this file.
The verifier rejects any sentence whose numbers are absent from facts.json.

Structure per fact:
  {
    "claim":       str   — the specific claim the narrative may make,
    "numbers":     dict  — every numeric value in the claim,
    "evidence_ids": []   — match_ids supporting this claim,
    "sample_size": int,
    "confidence":  str   — ok / tentative
  }
"""
import numpy as np
import pandas as pd


class _NpSafe:
    """Mix-in to coerce numpy scalars to plain Python types."""
    @staticmethod
    def _clean(v):
        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, (np.floating,)):
            return float(v)
        return v

    @classmethod
    def clean_dict(cls, d):
        return {k: cls._clean(v) for k, v in d.items()}


def build_facts(
    shape_season: pd.DataFrame,
    storylines: list,
    overload_stats: dict,
    calibration: dict,
    matches: pd.DataFrame,
    teams: pd.DataFrame,
) -> dict:
    facts = {}
    fid = [1]

    def add(claim, numbers, evidence_ids, sample_size, confidence):
        key = f"F{fid[0]:03d}"
        facts[key] = {
            "claim": claim,
            "numbers": _NpSafe.clean_dict(numbers),
            "evidence_ids": list(evidence_ids),
            "sample_size": int(sample_size),
            "confidence": confidence,
        }
        fid[0] += 1

    team_name = teams.set_index("id")["name"].to_dict()

    # --- Shape-change storylines ---
    for s in storylines:
        name = team_name.get(s["team_id"], s["team_id"])
        delta = round(s["xg_for_after"] - s["xg_for_before"], 3)
        direction = "improved" if delta > 0 else "declined"
        add(
            claim=(
                f"{name} (synthetic) switched from {s['from_shape']} to {s['to_shape']} "
                f"at matchday {s['change_matchday']}. xG for {direction} from "
                f"{s['xg_for_before']} to {s['xg_for_after']} per match "
                f"(delta {delta:+.3f}, n={s['before_matches']}+{s['after_matches']} matches)."
            ),
            numbers={
                "xg_for_before": s["xg_for_before"],
                "xg_for_after": s["xg_for_after"],
                "xg_for_delta": delta,
                "xg_against_before": s["xg_against_before"],
                "xg_against_after": s["xg_against_after"],
                "change_matchday": s["change_matchday"],
                "before_matches": s["before_matches"],
                "after_matches": s["after_matches"],
            },
            evidence_ids=matches[
                (matches["home_id"] == s["team_id"]) | (matches["away_id"] == s["team_id"])
            ]["match_id"].tolist(),
            sample_size=s["before_matches"] + s["after_matches"],
            confidence=s["confidence"],
        )

    # --- Shape xG stats per team ---
    for _, row in shape_season.iterrows():
        name = team_name.get(row["team_id"], row["team_id"])
        add(
            claim=(
                f"{name} (synthetic) with {row['shape_in']} in possession / "
                f"{row['shape_out']} out of possession: "
                f"{row['xg_for_per_match']} xG for and {row['xg_against_per_match']} "
                f"xG against per match across {row['n']} matches."
            ),
            numbers={
                "xg_for_per_match": row["xg_for_per_match"],
                "xg_against_per_match": row["xg_against_per_match"],
                "matches": int(row["n"]),
            },
            evidence_ids=[],
            sample_size=int(row["n"]),
            confidence=str(row["confidence"]),
        )

    # --- Overload effect on shot rate ---
    for bucket in sorted(overload_stats):
        s = overload_stats[bucket]
        add(
            claim=(
                f"Synthetic data: best zone overload = {bucket:+d} → "
                f"{s['shots_per_min']:.4f} open-play shots per possession minute "
                f"across {s['minutes']} possession minutes."
            ),
            numbers={
                "overload_bucket": int(bucket),
                "shots_per_min": s["shots_per_min"],
                "possession_minutes": s["minutes"],
            },
            evidence_ids=[],
            sample_size=s["minutes"],
            confidence="tentative" if s["minutes"] < 100 else "ok",
        )

    # --- Prediction model calibration ---
    add(
        claim=(
            f"Prediction model (logistic regression + gradient boosting, holdout matchdays "
            f"{calibration['holdout_matchdays']}, n={calibration['n_test_minutes']} minutes): "
            f"Brier score p_home={calibration['brier_p_home']} "
            f"(baseline {calibration['baseline_brier_home']}), "
            f"p_away={calibration['brier_p_away']} "
            f"(baseline {calibration['baseline_brier_away']})."
        ),
        numbers={
            "brier_p_home": calibration["brier_p_home"],
            "brier_p_away": calibration["brier_p_away"],
            "brier_counter": calibration["brier_counter"],
            "baseline_brier_home": calibration["baseline_brier_home"],
            "baseline_brier_away": calibration["baseline_brier_away"],
            "n_test_minutes": calibration["n_test_minutes"],
        },
        evidence_ids=[],
        sample_size=calibration["n_test_minutes"],
        confidence="ok",
    )

    return facts
