"""
ShapeShift — Analyst Agent

Runs entirely locally (no LLM). Reads the match state and facts, then
produces a structured observation packet that the Narrator agent can quote
safely without hallucinating numbers.

Ground rule #2: every number the narrator uses must come from here.
"""
from __future__ import annotations
import time


def _top_overload(overloads: list[dict]) -> dict | None:
    if not overloads:
        return None
    return max(overloads, key=lambda o: abs(o.get("overload", 0)))


def _shape_mismatch(shapes: dict) -> bool:
    home_fit = shapes.get("home", {}).get("fit_score", 0)
    away_fit = shapes.get("away", {}).get("fit_score", 0)
    return abs(home_fit - away_fit) > 0.15


def analyse(
    state: dict,
    facts: dict,
    home_name: str,
    away_name: str,
) -> dict:
    """
    Extract structured tactical observations from match state.

    Returns a trace step dict with:
      - agent, status, elapsed_ms, summary
      - observations: keyed tactical facts
      - numbers: every number the narrator is allowed to quote
      - relevant_facts: subset of facts.json relevant to this match
    """
    t0 = time.perf_counter()

    minute: int = state.get("minute", 0)
    home_id: str = state.get("home_id", "")
    away_id: str = state.get("away_id", "")
    pred: dict = state.get("prediction", {})
    shapes: dict = state.get("shapes", {})
    overloads: list = state.get("overloads", [])

    # ---- Overload observation ----
    top_ov = _top_overload(overloads)
    overload_obs: dict | None = None
    if top_ov and top_ov.get("overload", 0) != 0:
        ov_team = home_name if top_ov["overload"] > 0 else away_name
        overload_obs = {
            "team": ov_team,
            "zone": top_ov["zone"],
            "advantage": int(top_ov["overload"]),
            "rest_defence": int(top_ov.get("rest_defence", 0)),
        }

    # ---- Shape observation ----
    home_ip = shapes.get("home", {}).get("in_possession", "N/A")
    away_ip = shapes.get("away", {}).get("in_possession", "N/A")
    home_fit = float(shapes.get("home", {}).get("fit_score", 0))
    away_fit = float(shapes.get("away", {}).get("fit_score", 0))
    home_oop = shapes.get("home", {}).get("out_of_possession", "N/A")
    away_oop = shapes.get("away", {}).get("out_of_possession", "N/A")

    # ---- Prediction observation ----
    p_home = float(pred.get("p_next_goal_home", 0.5))
    p_away = float(pred.get("p_next_goal_away", 0.5))
    total = p_home + p_away or 1.0
    favoured = home_name if p_home >= p_away else away_name
    favoured_pct = round(max(p_home, p_away) / total * 100)
    counter_risk = float(pred.get("counter_risk", 0.3))
    xg_h15 = float(pred.get("xg_next_15_home", 0.2))
    xg_a15 = float(pred.get("xg_next_15_away", 0.2))

    counter_level = (
        "high" if counter_risk > 0.6
        else "moderate" if counter_risk > 0.35
        else "low"
    )
    score_diff = int(state.get("home_goals", 0)) - int(state.get("away_goals", 0))

    # ---- Narrative angle selection ----
    if overload_obs and abs(overload_obs["advantage"]) >= 2:
        angle = "zone_overload"
    elif _shape_mismatch(shapes):
        angle = "shape_mismatch"
    elif counter_risk > 0.55:
        angle = "counter_danger"
    elif abs(score_diff) == 1 and minute >= 70:
        angle = "late_pressure"
    else:
        angle = "prediction"

    # ---- Relevant facts ----
    relevant_facts: list[dict] = []
    for fid, fact in facts.items():
        if not isinstance(fact, dict):
            continue
        claim = fact.get("claim", "")
        if home_id in claim or away_id in claim:
            relevant_facts.append({
                "fact_id": fid,
                "claim": claim[:120],
                "confidence": fact.get("confidence", ""),
            })
        if len(relevant_facts) >= 3:
            break

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
    n_obs = sum([
        overload_obs is not None,
        home_fit != away_fit,
        True,  # prediction always an observation
    ])

    return {
        "agent": "analyst",
        "status": "pass",
        "elapsed_ms": elapsed_ms,
        "summary": f"{n_obs} observations · angle: {angle}",
        "mode": "local",
        "output": {
            "narrative_angle": angle,
            "shapes": {
                "home": {"formation_ip": home_ip, "formation_oop": home_oop, "fit": round(home_fit, 3)},
                "away": {"formation_ip": away_ip, "formation_oop": away_oop, "fit": round(away_fit, 3)},
            },
            "overload": overload_obs,
            "prediction": {
                "favoured_team": favoured,
                "favoured_pct": favoured_pct,
                "counter_risk_level": counter_level,
                "counter_risk_pct": round(counter_risk * 100),
                "xg_next_15_home": round(xg_h15, 3),
                "xg_next_15_away": round(xg_a15, 3),
            },
            "score_diff": score_diff,
            "relevant_facts": relevant_facts,
        },
        # Numbers the narrator is allowed to quote
        "numbers": {
            "minute": minute,
            "p_next_goal_home": round(p_home, 3),
            "p_next_goal_away": round(p_away, 3),
            "favoured_pct": favoured_pct,
            "counter_risk": round(counter_risk, 3),
            "counter_risk_pct": round(counter_risk * 100),
            "xg_next_15_home": round(xg_h15, 3),
            "xg_next_15_away": round(xg_a15, 3),
            "home_fit_pct": round(home_fit * 100),
            "away_fit_pct": round(away_fit * 100),
            "overload_advantage": overload_obs["advantage"] if overload_obs else 0,
            "rest_defence": overload_obs["rest_defence"] if overload_obs else 0,
        },
    }
