from __future__ import annotations

from datetime import date
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Transaction

router = APIRouter(prefix="/api/import", tags=["import"])


class HistoricalRow(BaseModel):
    year: int
    month: int
    category: str
    amount: float
    direction: str  # "in" or "out"


class HistoricalImport(BaseModel):
    rows: List[HistoricalRow]


@router.post("/historical")
async def import_historical(body: HistoricalImport, db: AsyncSession = Depends(get_db)):
    for row in body.rows:
        # Apply same sign convention as CSV parser: negative for out, positive for in.
        stored_amount = -abs(row.amount) if row.direction == "out" else abs(row.amount)
        txn = Transaction(
            date=date(row.year, row.month, 1),
            description=f"Historical import — {row.category}",
            amount=stored_amount,
            direction=row.direction,
            account_type="import",
            confirmed_category=row.category,
            raw_category=row.category,
            is_reviewed=True,
            is_published=True,
        )
        db.add(txn)
    await db.commit()
    return {"imported": len(body.rows)}
