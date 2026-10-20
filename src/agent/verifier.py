"""
ShapeShift — Fact Verifier Agent

Every number that appears in a narrative must be traceable to facts.json.
This module extracts numbers from text and checks them against the facts dict.

Ground rule #2: the language model only describes numbers that code produced.
No number in a narrative may be absent from its input facts.
"""
import json
import re


def verify(text: str, facts: dict) -> dict:
    """
    Verify that every number in `text` appears in the provided facts.

    Args:
        text:  The narrative string to check.
        facts: Dict of fact_id → fact object. Each fact has a "numbers" key
               whose values are numeric.

    Returns:
        {
          "pass":       bool   — True if all numbers found in facts,
          "violations": list   — numbers from text not found in any fact,
          "checked":    int    — total numbers extracted from text,
        }
    """
    # Extract all integers and decimals from the text
    raw_numbers = re.findall(r"\b\d+(?:\.\d+)?\b", text)

    if not raw_numbers:
        return {"pass": True, "violations": [], "checked": 0}

    # Build a flat set of all fact-number values (as rounded strings for comparison)
    fact_values: set[str] = set()
    for fact in facts.values():
        numbers_dict = fact.get("numbers", {}) if isinstance(fact, dict) else {}
        for val in numbers_dict.values():
            try:
                fact_values.add(str(round(float(val), 3)))
            except (TypeError, ValueError):
                pass

    violations: list[str] = []
    for raw in raw_numbers:
        try:
            normalised = str(round(float(raw), 3))
        except ValueError:
            violations.append(raw)
            continue
        if normalised not in fact_values:
            violations.append(raw)

    return {
        "pass": len(violations) == 0,
        "violations": violations,
        "checked": len(raw_numbers),
    }


def verify_against_facts(text: str, facts_path: str) -> dict:
    """
    Convenience wrapper: load facts.json from disk, then call verify().

    Args:
        text:       The narrative string to check.
        facts_path: Filesystem path to facts.json.

    Returns:
        Same dict as verify().
    """
    with open(facts_path, "r", encoding="utf-8") as fh:
        facts = json.load(fh)
    return verify(text, facts)
