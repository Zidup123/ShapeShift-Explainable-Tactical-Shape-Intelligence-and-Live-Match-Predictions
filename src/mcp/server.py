"""
ShapeShift — MCP Server

Exposes match data, shapes, overloads, predictions and facts as MCP tools
so that agents (narrator, verifier, analyst) can query the data without
importing the FastAPI app.

Install note (do NOT run during build): pip install mcp

Run with:
  python3 src/mcp/server.py
"""
import json
import os
from pathlib import Path
from typing import Any

import pandas as pd

# ---------------------------------------------------------------------------
# Install note: pip install mcp
# ---------------------------------------------------------------------------
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("shapeshift")

# ---------------------------------------------------------------------------
# Lazy data loader — CSVs are read once and cached in module-level dicts
# ---------------------------------------------------------------------------

_cache: dict[str, Any] = {}


def _data_dir() -> Path:
    return Path(os.environ.get("DATA_DIR", "Data"))


def _load() -> dict[str, Any]:
    """Load all CSVs and facts.json on first call; return cached dict thereafter."""
    global _cache
    if _cache:
        return _cache

    p = _data_dir()
    _cache["matches"] = pd.read_csv(p / "matches.csv")
    _cache["teams"] = pd.read_csv(p / "teams.csv")
    _cache["players"] = pd.read_csv(p / "players.csv")
    _cache["tracking"] = pd.read_csv(p / "tracking.csv")
    _cache["shape_phase"] = pd.read_csv(p / "shape_phase.csv")
    _cache["overloads"] = pd.read_csv(p / "overloads.csv")
    _cache["predictions"] = pd.read_csv(p / "predictions.csv")
    _cache["shape_season"] = pd.read_csv(p / "shape_season.csv")

    with open(p / "facts.json", "r", encoding="utf-8") as fh:
        _cache["facts"] = json.load(fh)

    # Team name lookup
    _cache["team_names"] = {
        str(r["id"]): str(r["name"])
        for r in _cache["teams"].to_dict(orient="records")
    }

    # Tracking index: (match_id, minute) → list of row dicts
    index: dict[tuple[str, int], list[dict]] = {}
    for row in _cache["tracking"].to_dict(orient="records"):
        key = (str(row["match_id"]), int(row["minute"]))
        index.setdefault(key, []).append(row)
    _cache["tracking_index"] = index

    return _cache


# ---------------------------------------------------------------------------
# Internal helpers (mirror the FastAPI helpers, no shared import)
# ---------------------------------------------------------------------------

def _match_summary(row: dict, team_names: dict) -> dict:
    home_id = str(row["home_id"])
    away_id = str(row["away_id"])
    return {
        "match_id": str(row["match_id"]),
        "matchday": int(row["matchday"]),
        "home_id": home_id,
        "home_name": team_names.get(home_id, home_id),
        "away_id": away_id,
        "away_name": team_names.get(away_id, away_id),
        "home_goals": int(row["home_goals"]),
        "away_goals": int(row["away_goals"]),
        "home_xg": float(row.get("home_xg", 0)),
        "away_xg": float(row.get("away_xg", 0)),
    }


def _get_shape_for_team(shape_phase: pd.DataFrame, match_id: str, team_id: str, minute: int) -> dict:
    mask = (shape_phase["match_id"] == match_id) & (shape_phase["team_id"] == team_id)
    team_df = shape_phase[mask]

    if team_df.empty:
        return {"in_possession": "N/A", "out_of_possession": "N/A", "fit_score": 0.0}

    def _best(phase: str) -> tuple[str, float]:
        p_df = team_df[team_df["phase"] == phase].copy()
        if p_df.empty:
            return "N/A", 0.0
        eligible = p_df[p_df["window_end"] <= minute]
        if eligible.empty:
            r = p_df.sort_values("window_start").iloc[0]
        else:
            r = eligible.sort_values("window_end").iloc[-1]
        return str(r["shape_label"]), float(r["fit_score"])

    ip_label, ip_fit = _best("in_possession")
    oop_label, _ = _best("out_of_possession")
    return {"in_possession": ip_label, "out_of_possession": oop_label, "fit_score": ip_fit}


# ---------------------------------------------------------------------------
# MCP Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def get_match_list() -> list:
    """Return summary information for all matches in the dataset."""
    d = _load()
    return [
        _match_summary(r, d["team_names"])
        for r in d["matches"].to_dict(orient="records")
    ]


@mcp.tool()
def get_match_state(match_id: str, minute: int) -> dict:
    """
    Return the full match state at the given minute.

    Includes player positions (both teams normalised to home-attacks-right frame),
    ball position, current shapes, overloads for the possessing team, and
    goal-probability predictions.
    """
    d = _load()
    matches = d["matches"]
    match_rows = matches[matches["match_id"] == match_id]
    if match_rows.empty:
        return {"error": f"Match {match_id} not found"}

    match_row = match_rows.iloc[0].to_dict()
    home_id = str(match_row["home_id"])
    away_id = str(match_row["away_id"])

    tracking_rows = d["tracking_index"].get((match_id, minute), [])

    possession_team = home_id
    for tr in tracking_rows:
        if str(tr.get("phase", "")) == "in_possession":
            possession_team = str(tr["team_id"])
            break

    # Ball coords (possessing team frame; flip if away team)
    ball_x, ball_y = 50.0, 50.0
    for tr in tracking_rows:
        if str(tr["team_id"]) == possession_team:
            bx = float(tr.get("ball_x", 50) or 50)
            by = float(tr.get("ball_y", 50) or 50)
            if possession_team == away_id:
                ball_x = 100.0 - bx
                ball_y = 100.0 - by
            else:
                ball_x = bx
                ball_y = by
            break

    # GK player IDs
    gk_ids: set[str] = set(
        d["players"][d["players"]["line"] == "GK"]["player_id"].astype(str).tolist()
    )

    players: list[dict] = []
    seen: set[str] = set()
    for tr in tracking_rows:
        pid = str(tr["player_id"])
        if pid in seen:
            continue
        seen.add(pid)
        tid = str(tr["team_id"])
        raw_x = float(tr.get("x", 50) or 50)
        raw_y = float(tr.get("y", 50) or 50)
        if tid == away_id:
            px = max(0.0, min(100.0, 100.0 - raw_x))
            py = max(0.0, min(100.0, 100.0 - raw_y))
        else:
            px = max(0.0, min(100.0, raw_x))
            py = max(0.0, min(100.0, raw_y))
        players.append({"team_id": tid, "player_id": pid, "x": px, "y": py, "is_gk": pid in gk_ids})

    home_goals = away_goals = 0
    if tracking_rows:
        home_goals = int(tracking_rows[0].get("home_goals", 0) or 0)
        away_goals = int(tracking_rows[0].get("away_goals", 0) or 0)

    home_shape = _get_shape_for_team(d["shape_phase"], match_id, home_id, minute)
    away_shape = _get_shape_for_team(d["shape_phase"], match_id, away_id, minute)

    ov_df = d["overloads"]
    ov_mask = (
        (ov_df["match_id"] == match_id)
        & (ov_df["minute"] == minute)
        & (ov_df["team_id"] == possession_team)
    )
    overloads_out = [
        {
            "zone": str(r["zone"]),
            "attackers": int(r["attackers"]),
            "defenders": int(r["defenders"]),
            "overload": int(r["overload"]),
            "rest_defence": int(r["rest_defence"]),
        }
        for r in ov_df[ov_mask].to_dict(orient="records")
    ]

    pred_df = d["predictions"]
    pred_mask = (pred_df["match_id"] == match_id) & (pred_df["minute"] == minute)
    pred_rows = pred_df[pred_mask]
    if pred_rows.empty:
        prediction = {"p_next_goal_home": 0.5, "p_next_goal_away": 0.5,
                      "xg_next_15_home": 0.2, "xg_next_15_away": 0.2, "counter_risk": 0.3}
    else:
        pr = pred_rows.iloc[0].to_dict()
        prediction = {
            "p_next_goal_home": float(pr.get("p_next_goal_home", 0.5)),
            "p_next_goal_away": float(pr.get("p_next_goal_away", 0.5)),
            "xg_next_15_home": float(pr.get("xg_next_15_home", 0.2)),
            "xg_next_15_away": float(pr.get("xg_next_15_away", 0.2)),
            "counter_risk": float(pr.get("counter_risk", 0.3)),
        }

    return {
        "match_id": match_id,
        "minute": minute,
        "home_id": home_id,
        "away_id": away_id,
        "home_goals": home_goals,
        "away_goals": away_goals,
        "possession_team": possession_team,
        "ball_x": ball_x,
        "ball_y": ball_y,
        "players": players,
        "shapes": {"home": home_shape, "away": away_shape},
        "overloads": overloads_out,
        "prediction": prediction,
    }


@mcp.tool()
def get_shape_history(match_id: str, team_id: str) -> list:
    """Return all shape windows for a team in a given match."""
    d = _load()
    df = d["shape_phase"]
    mask = (df["match_id"] == match_id) & (df["team_id"] == team_id)
    return df[mask].sort_values(["phase", "window_start"]).to_dict(orient="records")


@mcp.tool()
def get_team_season(team_id: str) -> dict:
    """Return season-level shape statistics and storyline facts for a team."""
    d = _load()
    teams_df = d["teams"]
    team_rows = teams_df[teams_df["id"] == team_id]
    if team_rows.empty:
        return {"error": f"Team {team_id} not found"}

    team_name = str(team_rows.iloc[0]["name"])

    ss = d["shape_season"]
    shapes = ss[ss["team_id"] == team_id].to_dict(orient="records")

    storylines: list[dict] = []
    for fid, fact in d["facts"].items():
        if isinstance(fact, dict) and team_id in fact.get("claim", ""):
            storylines.append({"fact_id": fid, **fact})

    return {
        "team_id": team_id,
        "name": team_name,
        "storylines": storylines,
        "shapes": shapes,
    }


@mcp.tool()
def get_facts(team_id: str = "") -> dict:
    """
    Return all facts, or only those whose claim mentions the given team_id.

    Args:
        team_id: Optional team ID filter. Pass empty string for all facts.
    """
    d = _load()
    facts = d["facts"]
    if not team_id:
        return facts
    return {
        fid: fact
        for fid, fact in facts.items()
        if isinstance(fact, dict) and team_id in fact.get("claim", "")
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    mcp.run()
