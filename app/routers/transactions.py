from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, extract

from app.database import get_db
from app.models import Transaction

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


class ReviewPatch(BaseModel):
    confirmed_category: str
    notes: Optional[str] = None
    offset_category: Optional[str] = None


class PublishBatch(BaseModel):
    ids: List[int]


class CashEntryIn(BaseModel):
    date: date
    description: str
    amount: float
    direction: str  # "in" or "out"
    category: Optional[str] = None


@router.get("")
async def list_transactions(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    reviewed: Optional[bool] = Query(None),
    published: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Transaction).order_by(Transaction.date.desc())
    if year:
        q = q.where(extract("year", Transaction.date) == year)
    if month:
        q = q.where(extract("month", Transaction.date) == month)
    if reviewed is not None:
        q = q.where(Transaction.is_reviewed == reviewed)
    if published is not None:
        q = q.where(Transaction.is_published == published)
    result = await db.execute(q)
    txns = result.scalars().all()
    return [_txn_dict(t) for t in txns]


@router.patch("/{txn_id}/review")
async def review_transaction(
    txn_id: int,
    body: ReviewPatch,
    db: AsyncSession = Depends(get_db),
):
    txn = await db.get(Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    if body.confirmed_category == "Transfer In" and txn.direction == "out":
        raise HTTPException(400, "Transfer In can only be applied to incoming transactions")
    txn.confirmed_category = body.confirmed_category
    txn.notes = body.notes
    txn.offset_category = body.offset_category if body.confirmed_category == "Transfer In" else None
    txn.is_reviewed = True
    await db.commit()
    return _txn_dict(txn)


@router.post("/publish")
async def publish_transactions(
    body: PublishBatch,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction).where(Transaction.id.in_(body.ids), Transaction.is_reviewed == True)
    )
    txns = result.scalars().all()
    for t in txns:
        t.is_published = True
    await db.commit()
    return {"published": len(txns)}


@router.post("/{txn_id}/unpublish")
async def unpublish_transaction(txn_id: int, db: AsyncSession = Depends(get_db)):
    txn = await db.get(Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    txn.is_published = False
    txn.is_reviewed = False
    await db.commit()
    return _txn_dict(txn)


@router.delete("/{txn_id}")
async def delete_transaction(txn_id: int, db: AsyncSession = Depends(get_db)):
    txn = await db.get(Transaction, txn_id)
    if not txn:
        raise HTTPException(404, "Transaction not found")
    await db.delete(txn)
    await db.commit()
    return {"deleted": txn_id}


# --- Cash entries ---

@router.post("/cash")
async def add_cash_entry(body: CashEntryIn, db: AsyncSession = Depends(get_db)):
    # Negate amount for outgoing entries so sign convention matches CSV parser
    # (CSV parser stores debits as negative, credits as positive).
    stored_amount = -abs(body.amount) if body.direction == "out" else abs(body.amount)
    # Store as a Transaction (reviewed but unpublished) so it appears in the review tab.
    txn = Transaction(
        date=body.date,
        description=body.description,
        amount=stored_amount,
        direction=body.direction,
        account_type="cash",
        confirmed_category=body.category,
        raw_category=body.category,
        is_reviewed=True,
        is_published=False,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return _txn_dict(txn)


@router.get("/cash")
async def list_cash_entries(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Transaction)
        .where(Transaction.account_type == "cash")
        .order_by(Transaction.date.desc())
    )
    if year:
        q = q.where(extract("year", Transaction.date) == year)
    if month:
        q = q.where(extract("month", Transaction.date) == month)
    result = await db.execute(q)
    return [_txn_dict(t) for t in result.scalars().all()]


def _txn_dict(t: Transaction) -> dict:  # type: ignore[type-arg]
    return {
        "id": t.id,
        "date": t.date.isoformat(),
        "description": t.description,
        "amount": t.amount,
        "direction": t.direction,
        "account_type": t.account_type,
        "raw_category": t.raw_category,
        "confirmed_category": t.confirmed_category,
        "is_reviewed": t.is_reviewed,
        "is_published": t.is_published,
        "notes": t.notes,
        "offset_category": t.offset_category,
        "source_file": t.source_file,
    }
