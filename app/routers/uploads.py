from __future__ import annotations

from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models import Transaction
from app.services.parser import parse_file
from app.services.categorizer import categorize_transactions

router = APIRouter(prefix="/api/upload", tags=["upload"])

ALLOWED_EXTENSIONS = {"csv", "xlsx", "xls"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


async def _get_examples(db: AsyncSession) -> list:
    """Pull recently confirmed transactions as few-shot examples for the LLM."""
    result = await db.execute(
        select(Transaction.description, Transaction.confirmed_category)
        .where(Transaction.confirmed_category.isnot(None))
        .order_by(Transaction.created_at.desc())
        .limit(30)
    )
    return [{"description": row[0], "category": row[1]} for row in result]


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File too large (max 10 MB)")

    try:
        rows = parse_file(content, file.filename or "upload")
    except Exception as exc:
        raise HTTPException(422, f"Could not parse file: {exc}")

    if not rows:
        raise HTTPException(422, "No transactions found in file")

    # Use confirmed past transactions as few-shot examples
    examples = await _get_examples(db)
    categories = await categorize_transactions(rows, examples=examples)

    # Count occurrences of each (date, description, amount) key in this batch.
    # This allows genuinely identical transactions (same merchant, same day, same amount)
    # to all be inserted, while still preventing re-upload of the same file.
    batch_key_counts: Counter = Counter(
        (row["date"], row["description"], row["amount"]) for row in rows
    )
    db_key_counts: dict = {}
    for key in batch_key_counts:
        d, desc, amt = key
        result = await db.execute(
            select(func.count()).select_from(Transaction).where(
                Transaction.date == d,
                Transaction.description == desc,
                Transaction.amount == amt,
            )
        )
        db_key_counts[key] = result.scalar_one()

    inserted_key_counts: Counter = Counter()
    inserted = 0
    for i, row in enumerate(rows):
        key = (row["date"], row["description"], row["amount"])
        allowed = max(0, batch_key_counts[key] - db_key_counts[key])
        if inserted_key_counts[key] >= allowed:
            continue

        inserted_key_counts[key] += 1
        txn = Transaction(
            date=row["date"],
            description=row["description"],
            amount=row["amount"],
            direction=row["direction"],
            account_type=row["account_type"],
            source_file=row["source_file"],
            raw_category=categories.get(i, "Other"),
        )
        db.add(txn)
        inserted += 1

    await db.commit()
    return {"inserted": inserted, "total_parsed": len(rows)}
