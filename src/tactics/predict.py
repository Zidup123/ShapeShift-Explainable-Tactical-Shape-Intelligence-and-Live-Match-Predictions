"""
Live match prediction model for the ShapeShift tactical agent.

For each (match_id, minute) builds rolling features from data available
up to and including that minute, then predicts:
  - p_next_goal_home / away  — P(team scores in next 15 min)
  - xg_next_15_home / away   — expected xG in next 15 min
  - counter_risk             — P(counter-attack shot in next 15 min)

Hold-out is matchdays 13 and 14.  No future data leaks into features.
"""
import warnings

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

HOLDOUT_MATCHDAYS = [13, 14]
LOOKAHEAD = 15   # minutes ahead to predict
LOOKBACK = 15    # recent-window size for rolling features
SEED = 6

# Consistent integer encoding for all shape labels
_ALL_SHAPES = sorted([
    "4-3-3", "4-2-3-1", "3-4-3", "3-5-2", "4-4-2", "4-1-4-1",
    "3-2-5", "2-3-5", "4-5-1", "5-3-2", "5-4-1",
])
_SHAPE_ENC = {s: i for i, s in enumerate(_ALL_SHAPES)}

FEATURE_COLS = [
    "minute_norm", "score_diff",
    "xg_home_cum", "xg_away_cum", "xg_diff_cum",
    "xg_home_recent", "xg_away_recent",
    "shots_home_recent", "shots_away_recent", "ctr_recent",
    "home_best_ov", "away_best_ov",
    "home_rest", "away_rest",
    "home_poss_frac",
    "shape_h_in", "shape_h_out", "shape_a_in", "shape_a_out",
]


def _enc(s):
    return _SHAPE_ENC.get(s, -1)


def _shape_at(sp_match, team_id, minute, phase):
    """Last shape label from a shape_phase slice at or before `minute`."""
    w = sp_match[
        (sp_match["team_id"] == team_id) &
        (sp_match["phase"] == phase) &
        (sp_match["window_end"] <= minute)
    ]
    if w.empty:
        # Fall back to earliest available window
        w = sp_match[(sp_match["team_id"] == team_id) & (sp_match["phase"] == phase)]
    if w.empty:
        return "4-4-2"
    return w.sort_values("window_end").iloc[-1]["shape_label"]


def build_feature_matrix(
    matches: pd.DataFrame,
    events: pd.DataFrame,
    shape_phase: pd.DataFrame,
    overloads: pd.DataFrame,
    tracking: pd.DataFrame,
) -> pd.DataFrame:
    """
    Build one row per (match_id, minute) with features and forward targets.
    Features use only data at or before `minute`; targets look LOOKAHEAD minutes ahead.
    """
    shots = events[events["type"] == "shot"].copy()
    rows = []

    for _, m in matches.iterrows():
        mid = m["match_id"]
        md = int(m["matchday"])
        home = m["home_id"]
        away = m["away_id"]

        # Prefilter to this match
        m_shots = shots[shots["match_id"] == mid]
        m_ov = overloads[overloads["match_id"] == mid]
        m_tr = tracking[tracking["match_id"] == mid]
        m_sp = shape_phase[shape_phase["match_id"] == mid]

        # Score at each minute from tracking (home_goals, away_goals are cumulative)
        score_by_min = (
            m_tr.groupby("minute")[["home_goals", "away_goals"]]
            .first()
            .reindex(range(1, 91), method="ffill")
            .fillna(0)
        )

        for minute in range(1, 91):
            # --- Cumulative xG up to this minute ---
            past = m_shots[m_shots["minute"] <= minute]
            xg_h_cum = float(past[past["team_id"] == home]["xg"].sum())
            xg_a_cum = float(past[past["team_id"] == away]["xg"].sum())

            # --- Recent window (last LOOKBACK minutes) ---
            lo = max(1, minute - LOOKBACK + 1)
            recent_sh = m_shots[m_shots["minute"].between(lo, minute)]
            xg_h_rec = float(recent_sh[recent_sh["team_id"] == home]["xg"].sum())
            xg_a_rec = float(recent_sh[recent_sh["team_id"] == away]["xg"].sum())
            shots_h_rec = int((recent_sh["team_id"] == home).sum())
            shots_a_rec = int((recent_sh["team_id"] == away).sum())
            ctr_rec = int(recent_sh["is_counter"].sum())

            # --- Overloads (recent window) ---
            recent_ov = m_ov[m_ov["minute"].between(lo, minute)]
            h_ov = recent_ov[recent_ov["team_id"] == home]
            a_ov = recent_ov[recent_ov["team_id"] == away]
            home_best_ov = float(h_ov["overload"].max()) if not h_ov.empty else 0.0
            away_best_ov = float(a_ov["overload"].max()) if not a_ov.empty else 0.0
            home_rest = float(h_ov["rest_defence"].mean()) if not h_ov.empty else 4.0
            away_rest = float(a_ov["rest_defence"].mean()) if not a_ov.empty else 4.0

            # --- Possession fraction (recent window) ---
            recent_tr = m_tr[m_tr["minute"].between(lo, minute)]
            if not recent_tr.empty:
                home_poss = float(
                    (recent_tr[recent_tr["team_id"] == home]["phase"] == "in_possession").mean()
                )
            else:
                home_poss = 0.5

            # --- Score ---
            if minute in score_by_min.index:
                gh = int(score_by_min.loc[minute, "home_goals"])
                ga = int(score_by_min.loc[minute, "away_goals"])
            else:
                gh, ga = 0, 0

            # --- Shapes ---
            sh_in = _shape_at(m_sp, home, minute, "in_possession")
            sh_out = _shape_at(m_sp, home, minute, "out_of_possession")
            sa_in = _shape_at(m_sp, away, minute, "in_possession")
            sa_out = _shape_at(m_sp, away, minute, "out_of_possession")

            # --- Forward targets (training only, not used as features) ---
            hi = minute + 1
            he = minute + LOOKAHEAD
            future = m_shots[m_shots["minute"].between(hi, he)]
            scored_h = int(((future["team_id"] == home) & (future["outcome"] == "goal")).any())
            scored_a = int(((future["team_id"] == away) & (future["outcome"] == "goal")).any())
            xg_h_next = float(future[future["team_id"] == home]["xg"].sum())
            xg_a_next = float(future[future["team_id"] == away]["xg"].sum())
            ctr_next = int(future["is_counter"].sum() > 0)

            rows.append({
                "match_id": mid,
                "matchday": md,
                "minute": minute,
                "home_id": home,
                "away_id": away,
                # features
                "minute_norm": round(minute / 90.0, 4),
                "score_diff": gh - ga,
                "xg_home_cum": round(xg_h_cum, 4),
                "xg_away_cum": round(xg_a_cum, 4),
                "xg_diff_cum": round(xg_h_cum - xg_a_cum, 4),
                "xg_home_recent": round(xg_h_rec, 4),
                "xg_away_recent": round(xg_a_rec, 4),
                "shots_home_recent": shots_h_rec,
                "shots_away_recent": shots_a_rec,
                "ctr_recent": ctr_rec,
                "home_best_ov": round(home_best_ov, 2),
                "away_best_ov": round(away_best_ov, 2),
                "home_rest": round(home_rest, 2),
                "away_rest": round(away_rest, 2),
                "home_poss_frac": round(home_poss, 3),
                "shape_h_in": _enc(sh_in),
                "shape_h_out": _enc(sh_out),
                "shape_a_in": _enc(sa_in),
                "shape_a_out": _enc(sa_out),
                # targets
                "scored_home": scored_h,
                "scored_away": scored_a,
                "xg_home_next15": round(xg_h_next, 4),
                "xg_away_next15": round(xg_a_next, 4),
                "counter_next15": ctr_next,
            })

    return pd.DataFrame(rows)


def train_and_predict(feature_df: pd.DataFrame) -> tuple:
    """
    Train on non-holdout matchdays, evaluate on holdout, return predictions for all minutes.

    Returns:
        predictions  DataFrame  (match_id, minute + 5 prediction columns)
        calibration  dict
    """
    df = feature_df.copy()
    train = df[~df["matchday"].isin(HOLDOUT_MATCHDAYS)]
    test = df[df["matchday"].isin(HOLDOUT_MATCHDAYS)]

    X_tr = train[FEATURE_COLS].values
    X_te = test[FEATURE_COLS].values
    X_all = df[FEATURE_COLS].values

    # p_next_goal — logistic regression with scaling (small dataset, avoids overfitting)
    clf_h = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=500,
                                                                random_state=SEED))
    clf_a = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=500,
                                                                random_state=SEED))
    clf_c = make_pipeline(StandardScaler(), LogisticRegression(C=0.5, max_iter=500,
                                                                random_state=SEED))

    clf_h.fit(X_tr, train["scored_home"].values)
    clf_a.fit(X_tr, train["scored_away"].values)
    clf_c.fit(X_tr, train["counter_next15"].values)

    # xG regressors
    reg_h = GradientBoostingRegressor(n_estimators=150, max_depth=3,
                                       learning_rate=0.05, random_state=SEED)
    reg_a = GradientBoostingRegressor(n_estimators=150, max_depth=3,
                                       learning_rate=0.05, random_state=SEED)
    reg_h.fit(X_tr, train["xg_home_next15"].values)
    reg_a.fit(X_tr, train["xg_away_next15"].values)

    preds = df[["match_id", "minute"]].copy()
    preds["p_next_goal_home"] = clf_h.predict_proba(X_all)[:, 1].round(4)
    preds["p_next_goal_away"] = clf_a.predict_proba(X_all)[:, 1].round(4)
    preds["xg_next_15_home"] = np.clip(reg_h.predict(X_all), 0, None).round(4)
    preds["xg_next_15_away"] = np.clip(reg_a.predict(X_all), 0, None).round(4)
    preds["counter_risk"] = clf_c.predict_proba(X_all)[:, 1].round(4)

    # Baseline: predict the training mean for every row
    baseline_h = float(train["scored_home"].mean())
    baseline_a = float(train["scored_away"].mean())

    calibration = {
        "holdout_matchdays": HOLDOUT_MATCHDAYS,
        "n_test_minutes": int(len(test)),
        "brier_p_home": round(float(brier_score_loss(
            test["scored_home"], clf_h.predict_proba(X_te)[:, 1])), 4),
        "brier_p_away": round(float(brier_score_loss(
            test["scored_away"], clf_a.predict_proba(X_te)[:, 1])), 4),
        "brier_counter": round(float(brier_score_loss(
            test["counter_next15"], clf_c.predict_proba(X_te)[:, 1])), 4),
        "baseline_brier_home": round(float(brier_score_loss(
            test["scored_home"], np.full(len(test), baseline_h))), 4),
        "baseline_brier_away": round(float(brier_score_loss(
            test["scored_away"], np.full(len(test), baseline_a))), 4),
    }

    return preds, calibration
