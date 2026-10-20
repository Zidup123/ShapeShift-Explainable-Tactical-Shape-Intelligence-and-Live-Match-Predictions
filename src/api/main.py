"""
ShapeShift — FastAPI Backend

Serves match replay, shapes, overloads, predictions, narrative and evidence
drawn from the pre-generated CSV files in DATA_DIR.

Run with:
  uvicorn src.api.main:app --reload
"""
import json
import os
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from src.agent.narrator import generate_narrative
from src.agent.verifier import verify

# ---------------------------------------------------------------------------
# DataStore singleton — loaded once at startup
# ---------------------------------------------------------------------------

class DataStore:
    """Holds all CSV data in memory and provides O(1) lookup structures."""

    def __init__(self, data_dir: str):
        p = Path(data_dir)

        self.matches = pd.read_csv(p / "matches.csv")
        self.teams = pd.read_csv(p / "teams.csv")
        self.players = pd.read_csv(p / "players.csv")
        self.tracking = pd.read_csv(p / "tracking.csv")
        self.events = pd.read_csv(p / "events.csv")
        self.shape_phase = pd.read_csv(p / "shape_phase.csv")
        self.overloads = pd.read_csv(p / "overloads.csv")
        self.predictions = pd.read_csv(p / "predictions.csv")
        self.shape_season = pd.read_csv(p / "shape_season.csv")

        with open(p / "facts.json", "r", encoding="utf-8") as fh:
            self.facts: dict = json.load(fh)

        # Pre-index tracking by (match_id, minute) → list of rows as dicts
        self.tracking_index: dict[tuple[str, int], list[dict]] = {}
        for row in self.tracking.to_dict(orient="records"):
            key = (str(row["match_id"]), int(row["minute"]))
            self.tracking_index.setdefault(key, []).append(row)

        # Player name lookup: player_id → name
        self.player_names: dict[str, str] = {
            str(r["player_id"]): str(r["name"])
            for r in self.players.to_dict(orient="records")
        }

        # Team name lookup: team_id → name
        self.team_names: dict[str, str] = {
            str(r["id"]): str(r["name"]) for r in self.teams.to_dict(orient="records")
        }


_store: DataStore | None = None


def get_store() -> DataStore:
    if _store is None:
        raise RuntimeError("DataStore not initialised")
    return _store


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

app = FastAPI(title="ShapeShift API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    global _store
    data_dir = os.environ.get("DATA_DIR", "Data")
    _store = DataStore(data_dir)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _match_summary(row: dict) -> dict:
    """Convert a matches.csv row to the standard summary dict."""
    store = get_store()
    mid = str(row["match_id"])
    home_id = str(row["home_id"])
    away_id = str(row["away_id"])
    return {
        "match_id": mid,
        "matchday": int(row["matchday"]),
        "home_id": home_id,
        "home_name": store.team_names.get(home_id, home_id),
        "away_id": away_id,
        "away_name": store.team_names.get(away_id, away_id),
        "home_goals": int(row["home_goals"]),
        "away_goals": int(row["away_goals"]),
        "home_xg": float(row.get("home_xg", 0)),
        "away_xg": float(row.get("away_xg", 0)),
    }


def _get_shape_for_team(store: DataStore, match_id: str, team_id: str, minute: int) -> dict:
    """
    Find the shape window whose window_end <= minute for the given team/match.
    Returns in_possession and out_of_possession shapes with fit_score.
    Falls back to the first available window if nothing matches.
    """
    df = store.shape_phase
    mask = (df["match_id"] == match_id) & (df["team_id"] == team_id)
    team_df = df[mask]

    if team_df.empty:
        return {"in_possession": "N/A", "out_of_possession": "N/A", "fit_score": 0.0}

    def _best_label(phase: str) -> tuple[str, float]:
        phase_df = team_df[team_df["phase"] == phase].copy()
        if phase_df.empty:
            return "N/A", 0.0
        # Windows whose end is at or before the current minute
        eligible = phase_df[phase_df["window_end"] <= minute]
        if eligible.empty:
            # Fall back to first window
            row = phase_df.sort_values("window_start").iloc[0]
        else:
            row = eligible.sort_values("window_end").iloc[-1]
        return str(row["shape_label"]), float(row["fit_score"])

    ip_label, ip_fit = _best_label("in_possession")
    oop_label, _oop_fit = _best_label("out_of_possession")

    return {
        "in_possession": ip_label,
        "out_of_possession": oop_label,
        "fit_score": ip_fit,
    }


def _build_state(store: DataStore, match_id: str, minute: int) -> dict:
    """Build the full match-state dict for the given match and minute."""
    # Match info
    match_rows = store.matches[store.matches["match_id"] == match_id]
    if match_rows.empty:
        raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
    match_row = match_rows.iloc[0].to_dict()

    home_id = str(match_row["home_id"])
    away_id = str(match_row["away_id"])

    # Tracking rows at this minute
    tracking_rows = store.tracking_index.get((match_id, minute), [])

    # Determine possession team at this minute
    possession_team = home_id  # default
    for tr in tracking_rows:
        if str(tr.get("phase", "")) == "in_possession":
            possession_team = str(tr["team_id"])
            break

    # Ball coordinates — from possessing team's rows; away team flipped
    ball_x, ball_y = 50.0, 50.0
    for tr in tracking_rows:
        if str(tr["team_id"]) == possession_team:
            bx = float(tr.get("ball_x", 50) or 50)
            by = float(tr.get("ball_y", 50) or 50)
            if possession_team == away_id:
                # Flip to home-attacking frame
                ball_x = 100.0 - bx
                ball_y = 100.0 - by
            else:
                ball_x = bx
                ball_y = by
            break

    # Player positions (home as-is, away flipped)
    # Use players.csv to know who is GK (slot 0 / line == GK)
    gk_ids: set[str] = set(
        store.players[store.players["line"] == "GK"]["player_id"].astype(str).tolist()
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
        players.append({
            "team_id": tid,
            "player_id": pid,
            "name": store.player_names.get(pid, pid),
            "x": px,
            "y": py,
            "is_gk": pid in gk_ids,
        })

    # Goals at this minute (use tracking row value — already cumulative)
    home_goals = 0
    away_goals = 0
    if tracking_rows:
        home_goals = int(tracking_rows[0].get("home_goals", 0) or 0)
        away_goals = int(tracking_rows[0].get("away_goals", 0) or 0)

    # Shapes
    home_shape = _get_shape_for_team(store, match_id, home_id, minute)
    away_shape = _get_shape_for_team(store, match_id, away_id, minute)

    # Overloads for possessing team at this minute
    ov_df = store.overloads
    ov_mask = (
        (ov_df["match_id"] == match_id)
        & (ov_df["minute"] == minute)
        & (ov_df["team_id"] == possession_team)
    )
    overload_rows = ov_df[ov_mask].to_dict(orient="records")
    overloads_out: list[dict] = [
        {
            "zone": str(r["zone"]),
            "attackers": int(r["attackers"]),
            "defenders": int(r["defenders"]),
            "overload": int(r["overload"]),
            "rest_defence": int(r["rest_defence"]),
        }
        for r in overload_rows
    ]

    # Predictions at this minute
    pred_df = store.predictions
    pred_mask = (pred_df["match_id"] == match_id) & (pred_df["minute"] == minute)
    pred_rows = pred_df[pred_mask]
    if pred_rows.empty:
        prediction = {
            "p_next_goal_home": 0.5,
            "p_next_goal_away": 0.5,
            "xg_next_15_home": 0.2,
            "xg_next_15_away": 0.2,
            "counter_risk": 0.3,
        }
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


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def health() -> dict:
    return {"status": "ok", "service": "ShapeShift API"}


@app.get("/matches")
def list_matches() -> list[dict]:
    store = get_store()
    return [_match_summary(r) for r in store.matches.to_dict(orient="records")]


@app.get("/matches/{match_id}")
def get_match(match_id: str) -> dict:
    store = get_store()
    rows = store.matches[store.matches["match_id"] == match_id]
    if rows.empty:
        raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
    row = rows.iloc[0].to_dict()
    summary = _match_summary(row)
    summary["home_in_shape"] = str(row.get("home_in_shape", ""))
    summary["away_in_shape"] = str(row.get("away_in_shape", ""))
    return summary


@app.get("/matches/{match_id}/state/{minute}")
def get_match_state(match_id: str, minute: int) -> dict:
    store = get_store()
    return _build_state(store, match_id, minute)


@app.get("/matches/{match_id}/predictions")
def get_predictions(match_id: str) -> list[dict]:
    store = get_store()
    df = store.predictions[store.predictions["match_id"] == match_id]
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No predictions for {match_id}")
    cols = [
        "minute",
        "p_next_goal_home",
        "p_next_goal_away",
        "xg_next_15_home",
        "xg_next_15_away",
        "counter_risk",
    ]
    available = [c for c in cols if c in df.columns]
    return df[available].sort_values("minute").to_dict(orient="records")


@app.get("/matches/{match_id}/livestats")
def get_livestats(match_id: str) -> list[dict]:
    """
    Per-minute cumulative xG, shot count, and possession % for both teams.
    Possession % = fraction of minutes 1..m where the home team held the ball.
    """
    store = get_store()

    match_rows = store.matches[store.matches["match_id"] == match_id]
    if match_rows.empty:
        raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
    match_row = match_rows.iloc[0]
    home_id = str(match_row["home_id"])

    ev = store.events[store.events["match_id"] == match_id].copy()
    shots = ev[ev["type"] == "shot"]

    # Possession per minute from tracking: 1 = home possesses, 0 = away
    tr = store.tracking[store.tracking["match_id"] == match_id].copy()
    # One row per (minute, team) in in_possession phase
    poss_minutes = set(
        tr[(tr["phase"] == "in_possession") & (tr["team_id"] == home_id)]["minute"].unique()
    )

    result: list[dict] = []
    cum_xg_home = 0.0
    cum_xg_away = 0.0
    cum_shots_home = 0
    cum_shots_away = 0
    poss_home_count = 0
    max_minute = int(tr["minute"].max()) if not tr.empty else 90

    for m in range(1, max_minute + 1):
        min_shots = shots[shots["minute"] == m]
        for _, s in min_shots.iterrows():
            xg_val = float(s["xg"]) if pd.notna(s["xg"]) else 0.0
            if str(s["team_id"]) == home_id:
                cum_xg_home += xg_val
                cum_shots_home += 1
            else:
                cum_xg_away += xg_val
                cum_shots_away += 1

        if m in poss_minutes:
            poss_home_count += 1

        result.append({
            "minute": m,
            "xg_home": round(cum_xg_home, 3),
            "xg_away": round(cum_xg_away, 3),
            "shots_home": cum_shots_home,
            "shots_away": cum_shots_away,
            "poss_pct_home": round(poss_home_count / m, 3),
        })

    return result


@app.get("/matches/{match_id}/narrative/{minute}")
def get_narrative(match_id: str, minute: int) -> dict:
    store = get_store()
    try:
        state = _build_state(store, match_id, minute)
        text, facts_used = generate_narrative(state, store.facts)
    except HTTPException:
        raise
    except Exception as exc:
        # Safe fallback — never expose internal errors to the client
        text = f"SYNTHETIC DATA — Minute {minute}: match commentary unavailable."
        facts_used = []
    return {"text": text, "facts_used": facts_used}


@app.get("/teams")
def list_teams() -> list[dict]:
    store = get_store()
    return [
        {"id": str(r["id"]), "name": str(r["name"])}
        for r in store.teams.to_dict(orient="records")
    ]


@app.get("/teams/{team_id}/season")
def get_team_season(team_id: str) -> dict:
    store = get_store()
    team_rows = store.teams[store.teams["id"] == team_id]
    if team_rows.empty:
        raise HTTPException(status_code=404, detail=f"Team {team_id} not found")
    team_name = str(team_rows.iloc[0]["name"])

    # Season shape stats
    ss_rows = store.shape_season[store.shape_season["team_id"] == team_id]
    shapes = ss_rows.to_dict(orient="records")

    # Storylines: facts that mention this team (F001–F010 range)
    storylines: list[dict] = []
    for fid, fact in store.facts.items():
        if not isinstance(fact, dict):
            continue
        if team_id in fact.get("claim", ""):
            storylines.append({"fact_id": fid, **fact})

    return {
        "team_id": team_id,
        "name": team_name,
        "storylines": storylines,
        "shapes": shapes,
    }


@app.get("/facts")
def get_facts() -> dict:
    return get_store().facts


@app.get("/facts/{fact_id}")
def get_fact(fact_id: str) -> dict:
    store = get_store()
    if fact_id not in store.facts:
        raise HTTPException(status_code=404, detail=f"Fact {fact_id} not found")
    return store.facts[fact_id]


# ---------------------------------------------------------------------------
# Serve built frontend (Docker / production)
# ---------------------------------------------------------------------------

_static_dir = Path(__file__).parent.parent.parent / "static"
if _static_dir.exists():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
