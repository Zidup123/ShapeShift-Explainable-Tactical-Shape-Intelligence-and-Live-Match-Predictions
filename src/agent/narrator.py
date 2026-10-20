"""
ShapeShift — Narrative Agent

Two modes:
  1. Local stub — always available, no credentials needed, used during development
     and as a fallback when Azure is unreachable.
  2. Azure mode — uses Azure OpenAI (Microsoft Foundry) when
     AZURE_OPENAI_ENDPOINT env var is set.

Every narrative string:
  - Starts with "SYNTHETIC DATA — " (ground rule #7 / #1).
  - Contains only numbers that appear in facts.json (ground rule #2).
  - Is ≤ 280 characters.

After generation the verifier is run; if numbers are not traceable the stub
is used instead so the UI always shows a safe, verified string.
"""
import os
import re

from src.agent.verifier import verify


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _truncate(text: str, max_len: int = 280) -> str:
    """Hard-truncate to max_len chars, preserving whole words where possible."""
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rsplit(" ", 1)[0] + "…"


def _relevant_facts(state: dict, facts: dict) -> list[tuple[str, dict]]:
    """
    Return (fact_id, fact) pairs that are relevant to the current match state.

    Priority:
      1. Facts whose claim text mentions either the home or away team id.
      2. Then any remaining facts ordered by confidence ("ok" before "tentative").
    """
    home_id = state.get("home_id", "")
    away_id = state.get("away_id", "")

    priority: list[tuple[str, dict]] = []
    rest: list[tuple[str, dict]] = []

    for fid, fact in facts.items():
        claim = fact.get("claim", "") if isinstance(fact, dict) else ""
        if home_id in claim or away_id in claim:
            priority.append((fid, fact))
        else:
            rest.append((fid, fact))

    # Sort each group: "ok" before "tentative"
    def _conf_key(item: tuple) -> int:
        conf = item[1].get("confidence", "") if isinstance(item[1], dict) else ""
        return 0 if conf == "ok" else 1

    priority.sort(key=_conf_key)
    rest.sort(key=_conf_key)
    return priority + rest


# ---------------------------------------------------------------------------
# Stub narrator (no Azure credentials required)
# ---------------------------------------------------------------------------

def _stub_narrative(state: dict, facts: dict) -> str:
    """
    Build a short, safe narrative string from the current match state.

    Rules:
      - Always prefix "SYNTHETIC DATA — ".
      - Use only numbers that appear in facts.
      - Keep to ≤ 280 chars.
      - No invented claims — only reflect what is in the state/facts.
    """
    minute: int = state.get("minute", 0)
    home_id: str = state.get("home_id", "home")
    away_id: str = state.get("away_id", "away")
    possession_team: str = state.get("possession_team", "")
    shapes: dict = state.get("shapes", {})
    overloads: list = state.get("overloads", [])
    prediction: dict = state.get("prediction", {})

    prefix = "SYNTHETIC DATA — "

    # Early game: focus on shape matchup
    if minute < 30:
        home_shape = shapes.get("home", {}).get("in_possession", "N/A")
        away_shape = shapes.get("away", {}).get("in_possession", "N/A")
        text = (
            f"{prefix}Both synthetic teams have settled into their shapes. "
            f"{home_id} line up {home_shape} in possession, "
            f"{away_id} use {away_shape}. Min {minute}."
        )
        return _truncate(text)

    # Mid/late game: try to use a storyline fact (F001–F010)
    storyline_fids = [f"F{str(i).zfill(3)}" for i in range(1, 11)]
    relevant = _relevant_facts(state, facts)
    for fid, fact in relevant:
        if fid in storyline_fids:
            claim_snippet = fact.get("claim", "")[:160]
            text = f"{prefix}{claim_snippet}"
            return _truncate(text)

    # Overload situation
    if overloads:
        # Find the zone with the highest absolute overload
        best = max(overloads, key=lambda o: abs(o.get("overload", 0)))
        zone = best.get("zone", "central")
        ov_val = best.get("overload", 0)
        direction = "overloading" if ov_val > 0 else "being overloaded in"
        text = (
            f"{prefix}Min {minute}: {possession_team} are {direction} "
            f"the {zone} zone (overload={ov_val}). "
            f"Counter risk: {round(prediction.get('counter_risk', 0), 2)}."
        )
        return _truncate(text)

    # Default: prediction summary
    p_home = round(prediction.get("p_next_goal_home", 0), 2)
    p_away = round(prediction.get("p_next_goal_away", 0), 2)
    text = (
        f"{prefix}Min {minute}: next-goal probabilities — "
        f"{home_id} {p_home}, {away_id} {p_away}. "
        f"Counter risk {round(prediction.get('counter_risk', 0), 2)}."
    )
    return _truncate(text)


# ---------------------------------------------------------------------------
# Azure / Foundry narrator
# ---------------------------------------------------------------------------

def _azure_narrative(state: dict, facts: dict) -> str:
    """
    Call Azure OpenAI to generate a narrative. Returns the LLM text on success
    or raises an exception so the caller can fall back to the stub.
    """
    import openai  # imported lazily so missing package doesn't break local mode

    endpoint = os.environ["AZURE_OPENAI_ENDPOINT"]
    api_key = os.environ.get("AZURE_OPENAI_KEY", "")
    api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-05-01-preview")
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")

    client = openai.AzureOpenAI(
        azure_endpoint=endpoint,
        api_key=api_key,
        api_version=api_version,
    )

    # Gather the most relevant facts to include in the prompt
    relevant = _relevant_facts(state, facts)[:5]
    facts_snippet = {fid: f for fid, f in relevant}

    system_prompt = (
        "You are a football commentary AI for synthetic data only. "
        "Every number you use MUST appear in the provided facts. "
        "Always start with 'SYNTHETIC DATA — '. "
        "Respond in ≤ 280 characters."
    )

    user_message = (
        f"Current match state (minute {state.get('minute')}, "
        f"home={state.get('home_id')}, away={state.get('away_id')}, "
        f"score={state.get('home_goals')}-{state.get('away_goals')}, "
        f"possession={state.get('possession_team')}).\n"
        f"Shapes: {state.get('shapes')}.\n"
        f"Prediction: {state.get('prediction')}.\n"
        f"Relevant facts: {facts_snippet}\n"
        "Write one commentary sentence (≤ 280 chars, start 'SYNTHETIC DATA — ')."
    )

    response = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        max_tokens=100,
        temperature=0.4,
    )

    return response.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_narrative(state: dict, facts: dict) -> tuple[str, list[str]]:
    """
    Generate a commentary narrative for the given match state.

    Args:
        state: Full match-state dict (as returned by the API state endpoint).
        facts: The complete facts dict (from facts.json).

    Returns:
        (narrative_text, fact_ids_used)
        - narrative_text: A ≤ 280-char string prefixed "SYNTHETIC DATA — ".
        - fact_ids_used:  List of fact IDs whose numbers appear in the text.
    """
    azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "").strip()

    narrative: str = ""

    # Try Azure if configured
    if azure_endpoint:
        try:
            candidate = _azure_narrative(state, facts)
            # Verify: every number must trace to facts
            result = verify(candidate, facts)
            if result["pass"]:
                narrative = _truncate(candidate)
            else:
                # Fall back to stub — LLM hallucinated a number
                narrative = _stub_narrative(state, facts)
        except Exception:
            narrative = _stub_narrative(state, facts)
    else:
        narrative = _stub_narrative(state, facts)

    # Determine which fact IDs contributed numbers to the narrative
    narrative_numbers: set[str] = set()
    for raw in re.findall(r"\b\d+(?:\.\d+)?\b", narrative):
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

    return narrative, fact_ids_used
