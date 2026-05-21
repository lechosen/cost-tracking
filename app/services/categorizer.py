"""
Categorizes transactions via local Ollama (qwen2.5:latest).
Sends transactions in batches and includes recent confirmed examples for few-shot learning.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:latest")
BATCH_SIZE = 8  # 7.6B model: ~20s for 3 txns, keep batches small to stay under timeout
OLLAMA_TIMEOUT = 300.0  # seconds; 7.6B needs time for larger batches + long system prompt

CATEGORIES = [
    "Food & Groceries",
    "Dining & Takeout",
    "Transport",
    "Utilities",
    "Rent & Mortgage",
    "Health & Medical",
    "Insurance",
    "Entertainment & Subscriptions",
    "Shopping",
    "House Supplies",
    "Travel",
    "Phone & Internet",
    "Property Tax",
    "Income",
    "Transfer In",
    "Transfer for Saving",
    "Investment",
    "Other"
]

# Excluded from expense totals/pie chart — these are not real spending
NON_EXPENSE_CATEGORIES = {"Transfer for Saving", "Investment", "Transfer In"}

logger = logging.getLogger(__name__)


def build_system_prompt(examples: List[Dict] = None) -> str:
    base = f"""You are a financial transaction categorizer for a Canadian household.
Given a list of bank transactions, return a JSON array where each element is:
{{"id": <original_id>, "category": "<one of the allowed categories>"}}

Allowed categories: {", ".join(CATEGORIES)}

Rules:
- PAY ROCHE PHARMA / PAY THE MANUFACTURERS LIFE → Income
- Interac e-transfer received from a person (positive amount) → Transfer In
- Transfers to savings account → Transfer for Saving
- RRSP / TFSA / brokerage deposits → Investment
- Mortgage payments → Rent & Mortgage
- Property tax payments → Property Tax
- Abode Financial Corporation, Enbridge, ALECTRA, ENERCARE → Utilities
- Bell, Rogers, Freedonm, Fido → Phone & Internet
- Netflix, Spotify, gym memberships → Entertainment & Subscriptions
- Grocery stores (T&T, Loblaws, Longo's, Walmart) → Food & Groceries
- ARAMARK MANULIFE FIN, EUREST-ROCHE, Restaurants, Food Delivery,  → Dining & Takeout
- Uber, TTC, Presto, 407ETR → Transport
- Insurance premiums (Manulife, Sun Life, Cooperators) → Insurance
- Amazon, Canadian Tire, Home Depot → House Supplies
- Cleaning supplies, household items → House Supplies
- Hotels, flights, Airbnb → Travel
- Return ONLY the JSON array, no extra text."""

    if examples:
        example_lines = "\n".join(
            f'- "{e["description"]}" → {e["category"]}'
            for e in examples[:15]
        )
        base += f"\n\nPast confirmed examples from this household:\n{example_lines}"

    return base


async def categorize_transactions(
    transactions: List[Dict[str, Any]],
    examples: List[Dict] = None,
) -> Dict[int, str]:
    """
    Returns {transaction_index: category_string}.
    Falls back to "Other" on any failure.
    """
    results: Dict[int, str] = {}
    system_prompt = build_system_prompt(examples or [])
    total_batches = (len(transactions) + BATCH_SIZE - 1) // BATCH_SIZE
    logger.info("Categorizing %d transactions in %d batch(es) via %s", len(transactions), total_batches, OLLAMA_MODEL)

    for batch_start in range(0, len(transactions), BATCH_SIZE):
        batch = transactions[batch_start: batch_start + BATCH_SIZE]
        batch_num = batch_start // BATCH_SIZE + 1
        payload = [
            {"id": i + batch_start, "description": t["description"], "amount": t["amount"]}
            for i, t in enumerate(batch)
        ]
        prompt = f"Categorize these transactions:\n{json.dumps(payload, indent=2)}"

        logger.info("  Batch %d/%d (%d txns, timeout=%.0fs) …", batch_num, total_batches, len(batch), OLLAMA_TIMEOUT)
        try:
            async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
                resp = await client.post(
                    f"{OLLAMA_URL}/api/chat",
                    json={
                        "model": OLLAMA_MODEL,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": prompt},
                        ],
                        "stream": False,
                    },
                )
                resp.raise_for_status()
                content = resp.json()["message"]["content"]
                parsed = _extract_json(content)
                if not parsed:
                    logger.warning("  Batch %d: LLM returned no parseable JSON. Raw: %.200s", batch_num, content)
                for item in parsed:
                    cat = item.get("category", "Other")
                    if cat not in CATEGORIES:
                        logger.debug("  Unknown category %r → Other", cat)
                        cat = "Other"
                    results[item["id"]] = cat
                logger.info("  Batch %d done (%d results)", batch_num, len(parsed))
        except Exception as exc:
            logger.warning(
                "Ollama categorization failed for batch %d (%s: %s); falling back to Other",
                batch_start, type(exc).__name__, exc,
            )
            for i in range(len(batch)):
                results.setdefault(i + batch_start, "Other")

    return results


def _extract_json(text: str) -> List[dict]:
    start = text.find("[")
    end = text.rfind("]") + 1
    if start == -1 or end == 0:
        return []
    try:
        return json.loads(text[start:end])
    except json.JSONDecodeError:
        return []
