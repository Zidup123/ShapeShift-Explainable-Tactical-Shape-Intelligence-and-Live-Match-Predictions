"""
ShapeShift — Agent Orchestration Chain

Runs the three agents in sequence and collects a full trace:

    Analyst  →  Narrator  →  Verifier

Each agent returns a trace step dict:
    {agent, status, elapsed_ms, summary, mode, output}

The chain returns:
    {text, facts_used, trace}

This is the entry point used by the FastAPI narrative endpoint.
"""
from __future__ import annotations
import re
import time

from src.agent.analyst import analyse
from src.agent.narrator import narrate
from src.agent.verifier import verify


def run(
    state: dict,
    facts: dict,
    home_name: str,
    away_name: str,
) -> dict:
    """
    Orchestrate analyst → narrator → verifier and return the full result.

    Args:
        state:      Full match-state dict from the API.
        facts:      Facts dict from facts.json.
        home_name:  Display name for the home team.
        away_name:  Display name for the away team.

    Returns:
        {
            "text":       str            — final verified narrative,
            "facts_used": list[str]      — fact IDs whose numbers appear,
            "trace":      list[dict]     — one step per agent,
        }
    """
    trace: list[dict] = []

    # ── Step 1: Analyst ──────────────────────────────────────────────────────
    analyst_step = analyse(state, facts, home_name, away_name)
    trace.append(analyst_step)

    # ── Step 2: Narrator ─────────────────────────────────────────────────────
    narrator_step = narrate(state, analyst_step, facts)
    trace.append(narrator_step)
    text: str = narrator_step["output"]

    # ── Step 3: Verifier ─────────────────────────────────────────────────────
    # Pass analyst-computed numbers so the verifier accepts state-derived values
    t0 = time.perf_counter()
    verify_result = verify(text, facts, extra_numbers=analyst_step.get("numbers", {}))
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)

    verifier_step = {
        "agent": "verifier",
        "status": "pass" if verify_result["pass"] else "fail",
        "elapsed_ms": elapsed_ms,
        "summary": (
            f"{verify_result['checked']} numbers checked · "
            f"{len(verify_result['violations'])} violation{'s' if len(verify_result['violations']) != 1 else ''}"
        ),
        "mode": "local",
        "output": verify_result,
    }
    trace.append(verifier_step)

    # If verifier fails, narrator already fell back to stub; mark it
    if not verify_result["pass"]:
        # The stub was already used by narrator on the first failure;
        # this branch handles a rare case where stub also fails verification.
        trace[1]["status"] = "fallback"

    # ── Collect fact IDs whose numbers appear in the narrative ───────────────
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

    return {
        "text": text,
        "facts_used": fact_ids_used,
        "trace": trace,
    }
