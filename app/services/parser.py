"""
Parses CIBC chequing (no-header) and CIBC Visa (with-header) CSV/XLSX exports
into a normalized list of transaction dicts.
"""
from __future__ import annotations

import io
from datetime import date
from typing import Any, Dict, List, Optional

import pandas as pd


CIBC_VISA_COLS = {
    "account_type": "Account Type",
    "date": "Transaction Date",
    "desc1": "Description 1",
    "desc2": "Description 2",
    "cad": "CAD$",
}

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
    "Income",
    "Transfer",
    "ATM & Cash",
    "Government & Tax",
    "Other",
]


def _is_visa_format(df: pd.DataFrame) -> bool:
    return "Account Type" in df.columns and "CAD$" in df.columns


def _parse_chequing(df: pd.DataFrame, filename: str) -> List[Dict[str, Any]]:
    # CIBC chequing: no header, columns are date, description, debit, credit.
    # Extra columns (e.g. balance) are ignored by slicing to the last 4 usable ones.
    cols = list(df.columns)
    if len(cols) >= 4:
        df = df.iloc[:, [0, 1, len(cols) - 2, len(cols) - 1]]
    df.columns = ["date", "description", "debit", "credit"]

    rows = []
    for _, row in df.iterrows():
        try:
            parsed_date = pd.to_datetime(row["date"]).date()
        except Exception:
            continue  # skip header-like or malformed rows
        debit = _to_float(row["debit"])
        credit = _to_float(row["credit"])
        if debit and debit > 0:
            amount, direction = -debit, "out"
        elif credit and credit > 0:
            amount, direction = credit, "in"
        else:
            continue
        rows.append({
            "date": parsed_date,
            "description": str(row["description"]).strip(),
            "amount": amount,
            "direction": direction,
            "account_type": "chequing",
            "source_file": filename,
        })
    return rows


def _parse_visa(df: pd.DataFrame, filename: str) -> List[Dict[str, Any]]:
    rows = []
    for _, row in df.iterrows():
        cad = _to_float(row.get("CAD$"))
        if cad is None:
            continue
        desc = " ".join(filter(None, [
            str(row.get("Description 1", "")).strip(),
            str(row.get("Description 2", "")).strip(),
        ]))
        amount = cad  # negative = expense, positive = payment/refund
        direction = "in" if cad > 0 else "out"
        rows.append({
            "date": pd.to_datetime(row["Transaction Date"]).date(),
            "description": desc,
            "amount": amount,
            "direction": direction,
            "account_type": "visa",
            "source_file": filename,
        })
    return rows


def _to_float(val: Any) -> Optional[float]:
    try:
        f = float(str(val).replace(",", "").strip())
        return f if f != 0 else None
    except (ValueError, TypeError):
        return None


def parse_file(content: bytes, filename: str) -> List[Dict[str, Any]]:
    """Entry point — accepts raw file bytes, returns normalized transaction rows."""
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext in ("xlsx", "xls"):
        df = pd.read_excel(io.BytesIO(content))
    else:
        # Try with header first, fall back to no-header
        try:
            df = pd.read_csv(io.BytesIO(content))
            if not _is_visa_format(df):
                raise ValueError("not visa format")
        except Exception:
            df = pd.read_csv(io.BytesIO(content), header=None)

    if _is_visa_format(df):
        return _parse_visa(df, filename)
    return _parse_chequing(df, filename)
