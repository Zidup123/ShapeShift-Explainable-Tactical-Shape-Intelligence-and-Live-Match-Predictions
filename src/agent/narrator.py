"""
ShapeShift — Narrator Agent

Receives the match state and the Analyst agent's observation packet, then
produces a short commentary string. Two modes:

  1. Local stub  — always available; builds from analyst observations.
  2. Azure mode  — uses Azure OpenAI (Microsoft Foundry) when
                   AZURE_OPENAI_ENDPOINT is set. The analyst output is
                   included in the prompt so the model stays grounded.

Every narrative:
  - Starts with "SYNTHETIC DATA — " (ground rules #1 / #7).
  - Contains only numbers that appear in the analyst's numbers dict.
  - Is ≤ 280 characters.

The verifier runs on the output; if it fails the stub is used as fallback.
"""
from __future__ import annotations
import os
import re
import time

from src.agent.verifier import verify


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _truncate(text: str, max_len: int = 280) -> str:
    if len(text) <= max_len:
        return text
    return text[:max_len - 1].rsplit(" ", 1)[0] + "…"


# ---------------------------------------------------------------------------
# Stub narrator — uses analyst observations, no LLM required
# ---------------------------------------------------------------------------

def _stub(state: dict, analyst: dict) -> str:
    obs = analyst.get("output", {})
    nums = analyst.get("numbers", {})
    angle = obs.get("narrative_angle", "prediction")
    pred = obs.get("prediction", {})
    shapes = obs.get("shapes", {})
    overload = obs.get("overload")
    minute = nums.get("minute", state.get("minute", 0))
    home_id = state.get("home_id", "home")
    away_id = state.get("away_id", "away")
    prefix = "SYNTHETIC DATA — "

    if angle == "zone_overload" and overload:
        zone = overload["zone"].replace("_", " ")
        adv = overload["advantage"]
        rest = overload["rest_defence"]
        team = overload["team"]
        return _truncate(
            f"{prefix}Min {minute}: {team} exploit the {zone} zone "
            f"(+{adv} overload). Only {rest} defenders in rest defence — "
            f"counter risk {nums.get('counter_risk_pct', 0)}%."
        )

    if angle == "shape_mismatch":
        h_fit = nums.get("home_fit_pct", 0)
        a_fit = nums.get("away_fit_pct", 0)
        h_f = shapes.get("home", {}).get("formation_ip", "?")
        a_f = shapes.get("away", {}).get("formation_ip", "?")
        return _truncate(
            f"{prefix}Min {minute}: shape contrast — {home_id} {h_f} "
            f"at {h_fit}% fit vs {away_id} {a_f} at {a_f}% fit. "
            f"{pred.get('favoured_team', home_id)} favoured for next goal "
            f"({pred.get('favoured_pct', 50)}%)."
        )

    if angle == "counter_danger":
        rest = nums.get("rest_defence", 0)
        cr = nums.get("counter_risk_pct", 0)
        return _truncate(
            f"{prefix}Min {minute}: counter-attack risk elevated ({cr}%). "
            f"Only {rest} defenders behind the ball. "
            f"xG next 15 — {home_id} {nums.get('xg_next_15_home', 0)}, "
            f"{away_id} {nums.get('xg_next_15_away', 0)}."
        )

    if angle == "late_pressure":
        fav = pred.get("favoured_team", home_id)
        pct = pred.get("favoured_pct", 50)
        return _truncate(
            f"{prefix}Min {minute}: late-game pressure building. "
            f"{fav} favoured to score next ({pct}%). "
            f"Counter risk {nums.get('counter_risk_pct', 0)}%."
        )

    # Default: prediction summary
    p_h = nums.get("p_next_goal_home", 0.5)
    p_a = nums.get("p_next_goal_away", 0.5)
    return _truncate(
        f"{prefix}Min {minute}: next-goal — "
        f"{home_id} {p_h:.3f}, {away_id} {p_a:.3f}. "
        f"Counter risk {nums.get('counter_risk_pct', 0)}%."
    )


# ---------------------------------------------------------------------------
# Azure / Foundry narrator
# ---------------------------------------------------------------------------

def _azure(state: dict, analyst: dict) -> str:
    import openai  # lazy import — missing package won't break local mode

    endpoint = os.environ["AZURE_OPENAI_ENDPOINT"]
    api_key = os.environ.get("AZURE_OPENAI_KEY", "")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-05-01-preview")
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

    client = openai.AzureOpenAI(
        azure_endpoint=endpoint,
        api_key=api_key,
        api_version=api_version,
    )

    obs = analyst.get("output", {})
    nums = analyst.get("numbers", {})
    relevant_facts = obs.get("relevant_facts", [])

    system_prompt = (
        "You are a football commentary AI generating analysis for SYNTHETIC data only. "
        "You MUST use only the numbers provided in the analyst packet — never invent numbers. "
        "Always begin your response with 'SYNTHETIC DATA — '. "
        "Maximum 280 characters. One or two sentences only."
    )

    user_message = (
        f"Analyst observations (minute {nums.get('minute')}):\n"
        f"- Narrative angle: {obs.get('narrative_angle')}\n"
        f"- Home shape: {obs.get('shapes', {}).get('home', {})}\n"
        f"- Away shape: {obs.get('shapes', {}).get('away', {})}\n"
        f"- Overload: {obs.get('overload')}\n"
        f"- Prediction: {obs.get('prediction')}\n"
        f"- Allowed numbers: {nums}\n"
        f"- Relevant storyline facts: {relevant_facts[:2]}\n\n"
        "Write one commentary sentence using ONLY numbers from the allowed list above. "
        "Start with 'SYNTHETIC DATA — '."
    )

    resp = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        max_tokens=120,
        temperature=0.35,
    )
    return resp.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# Public — returns a trace step dict
# ---------------------------------------------------------------------------

def narrate(state: dict, analyst: dict, facts: dict) -> dict:
    """
    Generate a commentary string and return a narrator trace step.

    Returns:
        {agent, status, elapsed_ms, summary, mode, output}
        where output is the narrative text string.
    """
    t0 = time.perf_counter()
    azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "").strip()
    mode = "azure" if azure_endpoint else "stub"
    text = ""
    fallback_used = False

    if azure_endpoint:
        try:
            candidate = _azure(state, analyst)
            result = verify(candidate, facts)
            if result["pass"]:
                text = _truncate(candidate)
            else:
                text = _stub(state, analyst)
                fallback_used = True
                mode = "stub_fallback"
        except Exception:
            text = _stub(state, analyst)
            fallback_used = True
            mode = "stub_fallback"
    else:
        text = _stub(state, analyst)

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
    char_count = len(text)

    return {
        "agent": "narrator",
        "status": "pass",
        "elapsed_ms": elapsed_ms,
        "summary": f"{mode} · {char_count} chars",
        "mode": mode,
        "fallback_used": fallback_used,
        "output": text,
    }


# ---------------------------------------------------------------------------
# Legacy shim — keeps old callers working during transition
# ---------------------------------------------------------------------------

def generate_narrative(state: dict, facts: dict) -> tuple[str, list[str]]:
    """Backward-compatible wrapper used by any code not yet on the chain."""
    from src.agent.analyst import analyse
    home_id = state.get("home_id", "home")
    away_id = state.get("away_id", "away")
    analyst_step = analyse(state, facts, home_id, away_id)
    narrator_step = narrate(state, analyst_step, facts)
    text: str = narrator_step["output"]

    narrative_numbers: set[str] = set()
    for raw in re.findall(r"\b\d+(?:\.\d+)?\b", text):
        try:
            narrative_numbers.add(str(round(float(raw), 3)))
        except ValueError:
            pass

    fact_ids_used: list[str] = []
    for fid, fact in facts.items():
        numbers_dict = fact.get("numbers", {}) if isinstance(fact, dict) else {}
        for val in numbers_dict.values():
            try:
                if str(round(float(val), 3)) in narrative_numbers:
                    fact_ids_used.append(fid)
                    break
            except (TypeError, ValueError):
                pass

    return text, fact_ids_used
