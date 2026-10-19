#!/usr/bin/env python3
"""
ShapeShift synthetic season generator (Ardent League, fictional).

Produces a full double round robin season for 8 fictional clubs:
  teams.csv, players.csv, shape_schedule.csv, matches.csv, standings.csv,
  tracking.csv (player positions every minute), events.csv (passes and shots with xG),
  gt_team_minutes.csv (generator ground truth, for validation only),
  calibration_report.md

Coordinates: every team is shown in its OWN attacking frame.
  x: 0 = own goal line, 100 = opponent goal line.  y: 0..100 across the pitch.
  To compare two teams, map the opponent with (100 - x, 100 - y).

Columns prefixed gt_ are generator ground truth. Use them to validate your shape and
overload detection, not as model inputs.

All clubs, players and numbers are synthetic and invented.
"""
import argparse
import math
import os

import numpy as np
import pandas as pd

# ----------------------------------------------------------------------------------
# Tunable constants (set by calibration against real world league averages)
# ----------------------------------------------------------------------------------
RATE_OPEN = 0.207      # open play shots per possession minute (before multipliers)
RATE_COUNTER = 0.040   # counter attack shots per opposition possession minute
PASS_POSS = 6.9        # passes per minute for the team in possession
PASS_OUT = 4.3         # passes per minute for the team out of possession
PASS_LOGIT_BASE = 2.25
XG_B0 = -1.40
OVERLOAD_RATE_GAIN = 0.16   # shot rate gain per unit of best zone overload
OVERLOAD_XG_GAIN = 0.15     # xG logit gain per unit of overload in the shot's zone
COUNTER_REST_GAIN = 0.45    # counter risk gain per missing rest defender (below 4)

ZONES = ["L_wide", "L_half", "central", "R_half", "R_wide"]
ZONE_EDGES = [0, 20, 38, 62, 80, 100.0001]
ZONE_BASE_W = np.array([0.10, 0.25, 0.30, 0.25, 0.10])
FINAL_THIRD_X = 60.0
LINE_ORDER = {"DEF": 0, "MID": 1, "FWD": 2}


def sig(z):
    return 1.0 / (1.0 + np.exp(-z))


def zone_of(y):
    return int(min(max(np.searchsorted(ZONE_EDGES, y, side="right") - 1, 0), 4))


def line(x, ys, tag):
    return [(float(x), float(y), tag) for y in ys]


# ----------------------------------------------------------------------------------
# Shape templates (10 outfield players, own attacking frame)
# ----------------------------------------------------------------------------------
IN_SHAPES = {
    "4-3-3": line(28, [12, 37, 63, 88], "DEF") + line(50, [25, 50, 75], "MID") + line(75, [15, 50, 85], "FWD"),
    "4-2-3-1": line(28, [12, 37, 63, 88], "DEF") + line(42, [38, 62], "MID") + line(62, [20, 50, 80], "MID") + line(78, [50], "FWD"),
    "3-4-3": line(26, [25, 50, 75], "DEF") + line(50, [10, 37, 63, 90], "MID") + line(74, [18, 50, 82], "FWD"),
    "3-5-2": line(26, [25, 50, 75], "DEF") + line(50, [8, 30, 50, 70, 92], "MID") + line(74, [38, 62], "FWD"),
    "4-4-2": line(28, [12, 37, 63, 88], "DEF") + line(50, [12, 37, 63, 88], "MID") + line(74, [38, 62], "FWD"),
    "4-1-4-1": line(28, [12, 37, 63, 88], "DEF") + line(40, [50], "MID") + line(58, [12, 37, 63, 88], "MID") + line(78, [50], "FWD"),
    "3-2-5": line(26, [25, 50, 75], "DEF") + line(42, [38, 62], "MID") + line(74, [8, 30, 50, 70, 92], "FWD"),
    "2-3-5": line(28, [35, 65], "DEF") + line(45, [25, 50, 75], "MID") + line(74, [8, 30, 50, 70, 92], "FWD"),
}
OUT_SHAPES = {
    "4-4-2": line(26, [12, 37, 63, 88], "DEF") + line(44, [12, 37, 63, 88], "MID") + line(60, [38, 62], "FWD"),
    "4-5-1": line(26, [12, 37, 63, 88], "DEF") + line(44, [8, 30, 50, 70, 92], "MID") + line(60, [50], "FWD"),
    "5-3-2": line(24, [8, 28, 50, 72, 92], "DEF") + line(42, [25, 50, 75], "MID") + line(58, [38, 62], "FWD"),
    "5-4-1": line(24, [8, 28, 50, 72, 92], "DEF") + line(42, [12, 37, 63, 88], "MID") + line(58, [50], "FWD"),
    "4-1-4-1": line(26, [12, 37, 63, 88], "DEF") + line(36, [50], "MID") + line(46, [12, 37, 63, 88], "MID") + line(60, [50], "FWD"),
}
for _d in (IN_SHAPES, OUT_SHAPES):
    for _k, _v in _d.items():
        assert len(_v) == 10, _k
        _d[_k] = sorted(_v, key=lambda t: (LINE_ORDER[t[2]], t[1], t[0]))


def control_factor(shape):
    n_mid = sum(1 for x, y, _ in IN_SHAPES[shape] if 35 <= x <= 65)
    return 1.0 + 0.035 * (n_mid - 3.5)


# ----------------------------------------------------------------------------------
# Fictional league
# ----------------------------------------------------------------------------------
TEAMS = [
    dict(id="THO", name="Thornfield Rovers", attack=1.08, defence=1.04, control=1.10, counter=0.90, passing=1.05, press=1.05, block=1.10, tempo=1.08,
         plan=[(1, "4-3-3", "4-4-2"), (7, "3-2-5", "4-4-2")]),
    dict(id="EAS", name="Eastmoor Athletic", attack=1.00, defence=1.00, control=1.00, counter=1.00, passing=1.00, press=1.00, block=1.00, tempo=1.00,
         plan=[(1, "4-4-2", "4-4-2"), (9, "4-2-3-1", "4-5-1"), (12, "4-2-3-1", "4-4-2")]),
    dict(id="RED", name="Redcliffe Town", attack=0.95, defence=1.02, control=0.95, counter=1.10, passing=0.95, press=1.05, block=0.95, tempo=0.98,
         plan=[(1, "3-5-2", "5-3-2"), (8, "4-4-2", "4-4-2")]),
    dict(id="MAR", name="Marlowe City", attack=1.12, defence=1.10, control=1.15, counter=0.85, passing=1.10, press=1.15, block=1.12, tempo=1.12,
         plan=[(1, "4-3-3", "4-1-4-1"), (6, "2-3-5", "4-1-4-1"), (11, "4-3-3", "4-1-4-1")]),
    dict(id="ASH", name="Ashgrove United", attack=0.98, defence=0.96, control=1.00, counter=1.05, passing=1.00, press=0.95, block=1.00, tempo=1.00,
         plan=[(1, "4-2-3-1", "4-5-1"), (10, "3-4-3", "5-4-1")]),
    dict(id="CAL", name="Calder Wanderers", attack=0.92, defence=0.92, control=0.88, counter=1.25, passing=0.92, press=0.90, block=0.88, tempo=0.92,
         plan=[(1, "4-4-2", "4-4-2"), (8, "4-3-3", "4-1-4-1")]),
    dict(id="SIL", name="Silverbrook FC", attack=1.02, defence=0.94, control=1.02, counter=1.00, passing=1.00, press=1.10, block=1.05, tempo=1.02,
         plan=[(1, "3-4-3", "5-4-1"), (7, "3-5-2", "5-3-2"), (12, "3-4-3", "5-4-1")]),
    dict(id="WES", name="Westhaven Albion", attack=0.90, defence=0.90, control=0.95, counter=1.00, passing=0.98, press=0.95, block=0.95, tempo=0.95,
         plan=[(1, "4-1-4-1", "4-1-4-1"), (9, "3-2-5", "4-5-1")]),
]
TEAM_BY_ID = {t["id"]: t for t in TEAMS}

FIRST = ["Aldous", "Bram", "Cael", "Davor", "Emeric", "Faolan", "Gideon", "Hollis", "Ivor", "Jasper", "Kellan", "Lucan",
         "Marek", "Nikolai", "Osric", "Perrin", "Quill", "Rafferty", "Soren", "Tobias", "Ulric", "Viktor", "Wendell",
         "Xander", "Yannick", "Zane", "Anselm", "Callum", "Dorian", "Evander"]
LAST = ["Ashdown", "Brannock", "Carrow", "Dunmore", "Eskridge", "Fenwick", "Garrick", "Halloran", "Ingram", "Jessop",
        "Kestrel", "Lockhart", "Marden", "Northcott", "Oakhurst", "Pellam", "Quarrie", "Ravensworth", "Selwyn",
        "Tarrant", "Underhill", "Vandeleur", "Whitlock", "Yarrow", "Ainsley", "Blythe", "Corwin", "Draycott",
        "Elmhurst", "Fairbairn", "Gresham", "Hartigan", "Iverson", "Kingsley", "Lindqvist", "Merrick"]


def make_players(rng):
    used = set()
    rows = []
    for t in TEAMS:
        for k in range(11):
            while True:
                nm = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
                if nm not in used:
                    used.add(nm)
                    break
            rows.append(dict(player_id=f"{t['id']}{k:02d}", team_id=t["id"], slot=k, name=nm,
                             line="GK" if k == 0 else None))
    return pd.DataFrame(rows)


def shapes_for(team, matchday):
    cur = team["plan"][0]
    for p in team["plan"]:
        if matchday >= p[0]:
            cur = p
    return cur[1], cur[2]


def fixtures():
    ids = [t["id"] for t in TEAMS]
    n = len(ids)
    rot = ids[:]
    rounds = []
    for r in range(n - 1):
        pairs = []
        for i in range(n // 2):
            a, b = rot[i], rot[n - 1 - i]
            pairs.append((a, b) if (r + i) % 2 == 0 else (b, a))
        rounds.append(pairs)
        rot = [rot[0]] + [rot[-1]] + rot[1:-1]
    first = rounds
    second = [[(b, a) for a, b in rd] for rd in rounds]
    out = []
    md = 1
    for rd in first + second:
        for a, b in rd:
            out.append((md, a, b))
        md += 1
    return out


# ----------------------------------------------------------------------------------
# Snapshot and overload geometry
# ----------------------------------------------------------------------------------
def snapshot(template, ball_x, ball_y, block, rng):
    """Positions of 11 players (GK first) for one team in its own frame."""
    shift_x = (ball_x - 50.0) * 0.30
    pos = [(float(np.clip(4 + shift_x * 0.2 + rng.normal(0, 1.0), 1, 12)),
            float(np.clip(50 + (ball_y - 50) * 0.10 + rng.normal(0, 2.0), 30, 70)))]
    for tx, ty, _ in template:
        x = np.clip(tx * block + shift_x + rng.normal(0, 3.2), 2, 98)
        y = np.clip(ty + 0.15 * (ball_y - ty) + rng.normal(0, 3.2), 1, 99)
        pos.append((float(x), float(y)))
    return pos


def zone_counts(points, thr=FINAL_THIRD_X):
    c = np.zeros(5, dtype=int)
    for x, y in points:
        if x >= thr:
            c[zone_of(y)] += 1
    return c


def overload_and_rest(att_pos, def_pos):
    """Overload per zone for the attacking team, plus its rest defence count."""
    att_out = att_pos[1:]
    def_out = [(100 - x, 100 - y) for x, y in def_pos[1:]]
    ov = zone_counts(att_out) - zone_counts(def_out)
    rest = sum(1 for x, _ in att_out if x < 45)
    return ov, rest


def xg_model(d_m, dy_m, is_counter, ov_zone, near):
    dx = max(d_m * d_m - dy_m * dy_m, 1.0) ** 0.5
    ang = math.atan2(7.32 * dx, dx * dx + dy_m * dy_m - 3.66 ** 2)
    if ang < 0:
        ang += math.pi
    logit = (XG_B0 - 0.075 * d_m + 1.5 * ang + 0.25 * is_counter
             + OVERLOAD_XG_GAIN * float(np.clip(ov_zone, -1, 3)) - 0.22 * (near - 1.5))
    return float(sig(logit))


# ----------------------------------------------------------------------------------
# Match simulation
# ----------------------------------------------------------------------------------
def simulate_match(match_id, md, home, away, rng, events, tracking, gtm):
    teams = {"H": TEAM_BY_ID[home], "A": TEAM_BY_ID[away]}
    ids = {"H": home, "A": away}
    in_sh, out_sh, blocks = {}, {}, {}
    for s in "HA":
        a, b = shapes_for(teams[s], md)
        in_sh[s], out_sh[s] = a, b
        blocks[s] = teams[s]["block"]
    goals = {"H": 0, "A": 0}
    other = {"H": "A", "A": "H"}
    ev_local = []

    for minute in range(1, 91):
        # possession for the minute, with a small effect of the score
        ctrl = {}
        for s in "HA":
            c = teams[s]["control"] * control_factor(in_sh[s]) * (1.07 if s == "H" else 1.0)
            diff = goals[s] - goals[other[s]]
            if diff < 0:
                c *= 1 + 0.03 * min(-diff, 2)
            ctrl[s] = c
        p_home = ctrl["H"] / (ctrl["H"] + ctrl["A"])
        poss = "H" if rng.random() < p_home else "A"
        dfd = other[poss]

        ball_x = float(np.clip(rng.beta(4.2, 3.4) * 100, 8, 96))
        ball_y = float(np.clip(rng.beta(3.0, 3.0) * 100, 4, 96))

        pos = {
            poss: snapshot([(x, y, t) for x, y, t in IN_SHAPES[in_sh[poss]]], ball_x, ball_y, 1.0, rng),
            dfd: snapshot([(x, y, t) for x, y, t in OUT_SHAPES[out_sh[dfd]]], 100 - ball_x, 100 - ball_y, blocks[dfd], rng),
        }
        ov, rest = overload_and_rest(pos[poss], pos[dfd])
        best_ov = int(ov.max())
        # also compute the overload the defending team could create on the counter (for ground truth only)
        for s in "HA":
            for k, (x, y) in enumerate(pos[s]):
                tracking.append((match_id, minute, ids[s], f"{ids[s]}{k:02d}", round(x, 2), round(y, 2),
                                 "in_possession" if s == poss else "out_of_possession",
                                 round(ball_x if s == poss else 100 - ball_x, 2),
                                 round(ball_y if s == poss else 100 - ball_y, 2),
                                 goals["H"], goals["A"]))

        shots_this_minute = {"H": 0, "A": 0}
        diff = goals[poss] - goals[dfd]
        chase = 1 + 0.06 * min(max(-diff, 0), 2)

        # open play shots for the possessing team
        lam_open = (RATE_OPEN * teams[poss]["attack"] / teams[dfd]["defence"]
                    * (1 + OVERLOAD_RATE_GAIN * float(np.clip(best_ov, -1, 3)))
                    * (0.6 + 0.8 * ball_x / 100) * chase * (1.10 if poss == "H" else 0.93))
        # counter shots for the other team
        lam_ctr = (RATE_COUNTER * teams[dfd]["counter"] / teams[poss]["defence"]
                   * (1 + COUNTER_REST_GAIN * max(0, 4 - rest)))
        n_open = rng.poisson(lam_open)
        n_ctr = rng.poisson(lam_ctr)

        def make_shot(side, counter):
            att = side
            opp = other[side]
            if counter:
                ov_z = np.zeros(5)
                zw = ZONE_BASE_W.copy()
            else:
                ov_z = ov.astype(float)
                zw = ZONE_BASE_W * np.exp(0.8 * np.clip(ov_z, -2, 3))
            zw = zw / zw.sum()
            z = int(rng.choice(5, p=zw))
            y = float(rng.uniform(ZONE_EDGES[z], min(ZONE_EDGES[z + 1], 100)))
            d_m = float(np.clip(5 + rng.gamma(3.0, 4.3), 6, 34))
            dy_m = abs(y - 50) * 0.68
            dx_m = max(d_m * d_m - dy_m * dy_m, 4.0) ** 0.5
            x = float(np.clip(100 - dx_m / 1.05, 60, 99.5))
            near = int(rng.poisson(max(0.3, 1.6 - 0.25 * (ov_z[z] if not counter else -1.0))))
            xg = xg_model(d_m, dy_m, 1 if counter else 0, ov_z[z], near)
            r = rng.random()
            if r < xg:
                outcome = "goal"
            else:
                u = rng.random()
                outcome = "saved" if u < 0.267 else ("blocked" if u < 0.267 + 0.28 else "off_target")
            # shooter: weighted toward advanced players
            pp = pos[att][1:]
            w = np.array([max(px - 30, 1.0) ** 1.5 for px, _ in pp])
            w = w / w.sum()
            k = int(rng.choice(10, p=w)) + 1
            return dict(match_id=match_id, matchday=md, minute=minute, second=int(rng.integers(0, 60)),
                        team_id=ids[att], opp_id=ids[opp], player_id=f"{ids[att]}{k:02d}", type="shot",
                        x=round(x, 2), y=round(y, 2), end_x=np.nan, end_y=np.nan, outcome=outcome,
                        xg=round(xg, 4), is_counter=int(counter), shot_zone=ZONES[z],
                        gt_zone_overload=int(ov_z[z]) if not counter else np.nan,
                        gt_best_overload=best_ov if not counter else np.nan,
                        gt_defenders_near=near), outcome == "goal"

        shot_list = [(poss, False)] * n_open + [(dfd, True)] * n_ctr
        for side, ctr in shot_list:
            e, g = make_shot(side, ctr)
            ev_local.append(e)
            shots_this_minute[side] += 1
            if g:
                goals[side] += 1

        # passes
        for s in "HA":
            lam = (PASS_POSS * teams[s]["tempo"]) if s == poss else PASS_OUT
            n = rng.poisson(lam)
            if n == 0:
                continue
            opp = other[s]
            for _ in range(n):
                k = int(rng.integers(0, 11))
                px, py = pos[s][k]
                dx = rng.normal(7, 14)
                dy = rng.normal(0, 13)
                ex = float(np.clip(px + dx, 1, 99))
                ey = float(np.clip(py + dy, 1, 99))
                ln = math.hypot((ex - px) * 1.05, (ey - py) * 0.68)
                z = (PASS_LOGIT_BASE - 0.045 * ln + 0.6 * (teams[s]["passing"] - 1)
                     - 1.5 * (teams[opp]["press"] - 1) - (0.35 if ex > 70 else 0.0))
                comp = rng.random() < sig(z)
                ev_local.append(dict(match_id=match_id, matchday=md, minute=minute, second=int(rng.integers(0, 60)),
                                     team_id=ids[s], opp_id=ids[opp], player_id=f"{ids[s]}{k:02d}", type="pass",
                                     x=round(px, 2), y=round(py, 2), end_x=round(ex, 2), end_y=round(ey, 2),
                                     outcome="complete" if comp else "incomplete", xg=np.nan, is_counter=0,
                                     shot_zone=None, gt_zone_overload=np.nan, gt_best_overload=np.nan,
                                     gt_defenders_near=np.nan))

        for s in "HA":
            gtm.append((match_id, md, minute, ids[s], int(s == poss), best_ov if s == poss else np.nan,
                        rest if s == poss else np.nan, shots_this_minute[s]))

    ev_local.sort(key=lambda e: (e["minute"], e["second"]))
    events.extend(ev_local)
    return goals["H"], goals["A"], in_sh, out_sh


def run(seed, outdir):
    rng = np.random.default_rng(seed)
    os.makedirs(outdir, exist_ok=True)
    players = make_players(rng)
    events, tracking, gtm, match_rows = [], [], [], []
    for i, (md, h, a) in enumerate(fixtures(), start=1):
        mid = f"M{i:03d}"
        gh, ga, ish, osh = simulate_match(mid, md, h, a, rng, events, tracking, gtm)
        match_rows.append(dict(match_id=mid, matchday=md, home_id=h, away_id=a, home_goals=gh, away_goals=ga,
                               home_in_shape=ish["H"], home_out_shape=osh["H"],
                               away_in_shape=ish["A"], away_out_shape=osh["A"]))
    matches = pd.DataFrame(match_rows)
    ev = pd.DataFrame(events)
    ev.insert(0, "event_id", np.arange(1, len(ev) + 1))
    tr = pd.DataFrame(tracking, columns=["match_id", "minute", "team_id", "player_id", "x", "y", "phase",
                                         "ball_x", "ball_y", "home_goals", "away_goals"])
    gt = pd.DataFrame(gtm, columns=["match_id", "matchday", "minute", "team_id", "in_possession",
                                    "gt_best_overload", "gt_rest_defence", "shots"])

    # player lines (for the default 4-3-3 slot order, informational)
    players["line"] = players["slot"].map(lambda k: "GK" if k == 0 else ("DEF" if k <= 4 else ("MID" if k <= 7 else "FWD")))

    # match level stats
    shots = ev[ev["type"] == "shot"]
    passes = ev[ev["type"] == "pass"]
    for s, tid in (("home", "home_id"), ("away", "away_id")):
        sh = shots.groupby(["match_id", "team_id"]).agg(shots=("xg", "size"), xg=("xg", "sum"),
                                                          on_target=("outcome", lambda o: int(o.isin(["goal", "saved"]).sum())))
        matches = matches.merge(sh.reset_index().rename(columns={"team_id": tid, "shots": f"{s}_shots", "xg": f"{s}_xg",
                                                                  "on_target": f"{s}_on_target"}), on=["match_id", tid], how="left")
        ps = passes.groupby(["match_id", "team_id"]).agg(passes=("xg", "size"),
                                                          comp=("outcome", lambda o: int((o == "complete").sum())))
        matches = matches.merge(ps.reset_index().rename(columns={"team_id": tid, "passes": f"{s}_passes",
                                                                  "comp": f"{s}_pass_completed"}), on=["match_id", tid], how="left")
        pm = gt[gt["in_possession"] == 1].groupby(["match_id", "team_id"]).size().rename(f"{s}_poss_minutes").reset_index()
        matches = matches.merge(pm.rename(columns={"team_id": tid}), on=["match_id", tid], how="left")
    matches["home_xg"] = matches["home_xg"].round(3)
    matches["away_xg"] = matches["away_xg"].round(3)

    # standings
    rows = []
    for t in TEAMS:
        h = matches[matches["home_id"] == t["id"]]
        a = matches[matches["away_id"] == t["id"]]
        gf = h["home_goals"].sum() + a["away_goals"].sum()
        ga = h["away_goals"].sum() + a["home_goals"].sum()
        w = (h["home_goals"] > h["away_goals"]).sum() + (a["away_goals"] > a["home_goals"]).sum()
        d = (h["home_goals"] == h["away_goals"]).sum() + (a["away_goals"] == a["home_goals"]).sum()
        rows.append(dict(team_id=t["id"], team=t["name"], played=len(h) + len(a), won=int(w), drawn=int(d),
                         lost=len(h) + len(a) - int(w) - int(d), gf=int(gf), ga=int(ga), gd=int(gf - ga),
                         points=int(3 * w + d), xg_for=round(h["home_xg"].sum() + a["away_xg"].sum(), 1),
                         xg_against=round(h["away_xg"].sum() + a["home_xg"].sum(), 1)))
    standings = pd.DataFrame(rows).sort_values(["points", "gd", "gf"], ascending=False).reset_index(drop=True)
    standings.insert(0, "pos", np.arange(1, len(standings) + 1))

    teams_df = pd.DataFrame([{k: v for k, v in t.items() if k != "plan"} for t in TEAMS])
    sched = []
    for t in TEAMS:
        for k, (md0, i_s, o_s) in enumerate(t["plan"]):
            end = t["plan"][k + 1][0] - 1 if k + 1 < len(t["plan"]) else 14
            sched.append(dict(team_id=t["id"], from_matchday=md0, to_matchday=end, in_possession_shape=i_s,
                              out_of_possession_shape=o_s))
    sched = pd.DataFrame(sched)

    teams_df.to_csv(f"{outdir}/teams.csv", index=False)
    players.to_csv(f"{outdir}/players.csv", index=False)
    sched.to_csv(f"{outdir}/shape_schedule.csv", index=False)
    matches.to_csv(f"{outdir}/matches.csv", index=False)
    standings.to_csv(f"{outdir}/standings.csv", index=False)
    tr.to_csv(f"{outdir}/tracking.csv", index=False)
    ev.to_csv(f"{outdir}/events.csv", index=False)
    gt.to_csv(f"{outdir}/gt_team_minutes.csv", index=False)
    return dict(matches=matches, events=ev, tracking=tr, gt=gt, standings=standings, sched=sched)


# ----------------------------------------------------------------------------------
# Calibration report
# ----------------------------------------------------------------------------------
def report(d, outdir, seed):
    m, ev, gt, st = d["matches"], d["events"], d["gt"], d["standings"]
    n = len(m)
    shots = ev[ev["type"] == "shot"]
    passes = ev[ev["type"] == "pass"]
    goals_pm = (m["home_goals"] + m["away_goals"]).mean()
    shots_pm = shots.shape[0] / n
    sot_pm = shots["outcome"].isin(["goal", "saved"]).sum() / n
    pass_pm = passes.shape[0] / n
    comp = (passes["outcome"] == "complete").mean()
    xg_shot = shots["xg"].mean()
    xg_pm = shots["xg"].sum() / n
    conv = (shots["outcome"] == "goal").mean()
    hw = (m["home_goals"] > m["away_goals"]).mean()
    dr = (m["home_goals"] == m["away_goals"]).mean()
    aw = (m["home_goals"] < m["away_goals"]).mean()
    hg = m["home_goals"].mean()
    ag = m["away_goals"].mean()
    ctr_share = shots["is_counter"].mean()
    zero_goal = ((m["home_goals"] + m["away_goals"]) == 0).mean()
    rows = [
        ("Goals per match", goals_pm, "2.4 to 3.0", 2.4 <= goals_pm <= 3.0, "about 2.6"),
        ("Shots per match", shots_pm, "24 to 28", 24 <= shots_pm <= 28, "about 26"),
        ("Shots on target per match", sot_pm, "8 to 10", 8 <= sot_pm <= 10, "about 9"),
        ("Goals per shot", conv, "0.09 to 0.11", 0.09 <= conv <= 0.11, "about 0.10"),
        ("xG per shot", xg_shot, "0.09 to 0.11", 0.09 <= xg_shot <= 0.11, "about 0.10"),
        ("Total xG per match", xg_pm, "2.4 to 3.0", 2.4 <= xg_pm <= 3.0, "close to goals"),
        ("Passes per match", pass_pm, "850 to 1100", 850 <= pass_pm <= 1100, "about 950 to 1050"),
        ("Pass completion", comp, "0.77 to 0.83", 0.77 <= comp <= 0.83, "about 0.80"),
        ("Home win share", hw, "0.40 to 0.50", 0.40 <= hw <= 0.50, "about 0.45"),
        ("Draw share", dr, "0.20 to 0.30", 0.20 <= dr <= 0.30, "about 0.25"),
        ("Away win share", aw, "0.25 to 0.35", 0.25 <= aw <= 0.35, "about 0.30"),
        ("Home goals minus away goals", hg - ag, "0.1 to 0.5", 0.1 <= hg - ag <= 0.5, "about 0.3"),
        ("Counter attack share of shots", ctr_share, "0.10 to 0.22", 0.10 <= ctr_share <= 0.22, "about 0.15"),
    ]
    L = []
    L.append("# Calibration report: Ardent League synthetic season\n")
    L.append(f"Seed {seed}. {n} matches, 8 fictional clubs, 14 matchdays. {len(ev):,} events, {len(d['tracking']):,} tracking rows.\n")
    L.append("## League averages versus real world targets\n")
    L.append("| Metric | Synthetic | Target band | Pass |\n|---|---|---|---|")
    for name, v, band, ok, _ in rows:
        L.append(f"| {name} | {v:.3f} | {band} | {'yes' if ok else 'NO'} |")
    L.append(f"\nGoalless matches: {zero_goal:.1%}.\n")
    L.append("## Standings\n")
    L.append("| Pos | Club | P | W | D | L | GF | GA | GD | Pts | xG for | xG against |\n|---|---|---|---|---|---|---|---|---|---|---|---|")
    for _, r in st.iterrows():
        L.append(f"| {r['pos']} | {r['team']} | {r['played']} | {r['won']} | {r['drawn']} | {r['lost']} | {r['gf']} | {r['ga']} | {r['gd']} | {r['points']} | {r['xg_for']} | {r['xg_against']} |")
    # planted relationships
    pm = gt[gt["in_possession"] == 1].copy()
    pm["bucket"] = pm["gt_best_overload"].clip(-1, 3).astype(int)
    eff = pm.groupby("bucket").agg(minutes=("shots", "size"), shots_per_min=("shots", "mean")).reset_index()
    L.append("\n## Planted relationships (what your analysis should rediscover)\n")
    L.append("Open play shots per possession minute by best zone overload (attackers minus defenders in the final third):\n")
    L.append("| Best overload | Minutes | Shots per minute |\n|---|---|---|")
    for _, r in eff.iterrows():
        L.append(f"| {int(r['bucket']):+d} | {int(r['minutes'])} | {r['shots_per_min']:.3f} |")
    op = shots[shots["is_counter"] == 0].copy()
    op["b"] = op["gt_zone_overload"].clip(-1, 3).astype(int)
    xe = op.groupby("b").agg(n=("xg", "size"), xg=("xg", "mean")).reset_index()
    L.append("\nMean xG per open play shot by overload in the shot's zone:\n")
    L.append("| Zone overload | Shots | Mean xG |\n|---|---|---|")
    for _, r in xe.iterrows():
        L.append(f"| {int(r['b']):+d} | {int(r['n'])} | {r['xg']:.3f} |")
    rd = pm.copy()
    rd["rb"] = rd["gt_rest_defence"].clip(1, 6).astype(int)
    # counter shots conceded per possession minute by rest defence
    cs = shots[shots["is_counter"] == 1].groupby(["match_id", "minute", "opp_id"]).size().rename("c").reset_index()
    cs = cs.rename(columns={"opp_id": "team_id"})
    rd = rd.merge(cs, on=["match_id", "minute", "team_id"], how="left").fillna({"c": 0})
    re = rd.groupby("rb").agg(minutes=("c", "size"), conceded=("c", "mean")).reset_index()
    L.append("\nCounter attack shots conceded per possession minute by rest defence (outfield players behind the ball):\n")
    L.append("| Rest defenders | Minutes | Counter shots conceded per minute |\n|---|---|---|")
    for _, r in re.iterrows():
        L.append(f"| {int(r['rb'])} | {int(r['minutes'])} | {r['conceded']:.3f} |")
    L.append("\nThese effects are built into the simulator, so recovering them proves the pipeline works. "
             "Do not present them as discoveries about real football. In the demo, label all findings as synthetic.\n")
    L.append("## Simplifications\n")
    L.append("- No substitutions, fouls, cards, set pieces or injuries. Eleven starters play 90 minutes.\n"
             "- Positions are snapshots once per minute, with the team's possession phase for that minute.\n"
             "- Players keep a fixed slot, so a defender can become a midfielder when a team changes shape.\n"
             "- Possession is decided per minute, not per sequence.\n")
    with open(f"{outdir}/calibration_report.md", "w") as f:
        f.write("\n".join(L))
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=6)
    ap.add_argument("--out", default="data")
    a = ap.parse_args()
    res = run(a.seed, a.out)
    rws = report(res, a.out, a.seed)
    for name, v, band, ok, _ in rws:
        print(f"{name:34s} {v:8.3f}   {band:14s} {'ok' if ok else 'OUT'}")
