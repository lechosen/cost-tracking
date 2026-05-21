from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, extract, func

from app.database import get_db
from app.models import Transaction, CashEntry
from app.services.categorizer import NON_EXPENSE_CATEGORIES

router = APIRouter(prefix="/api/reports", tags=["reports"])

TRANSFER_IN = "Transfer In"
TRANSFER_SAVING = "Transfer for Saving"
INVESTMENT = "Investment"


@router.get("/monthly")
async def monthly_summary(
    year: int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    txn_rows = await db.execute(
        select(
            func.coalesce(Transaction.confirmed_category, Transaction.raw_category).label("category"),
            func.sum(Transaction.amount).label("total"),
            Transaction.direction,
        )
        .where(
            extract("year", Transaction.date) == year,
            extract("month", Transaction.date) == month,
            Transaction.is_published == True,
        )
        .group_by("category", Transaction.direction)
    )

    # Fetch Transfer In rows with their offset_category for targeted deduction
    transfer_in_rows = await db.execute(
        select(
            Transaction.offset_category,
            func.sum(func.abs(Transaction.amount)).label("total"),
        )
        .where(
            extract("year", Transaction.date) == year,
            extract("month", Transaction.date) == month,
            Transaction.is_published == True,
            func.coalesce(Transaction.confirmed_category, Transaction.raw_category) == TRANSFER_IN,
        )
        .group_by(Transaction.offset_category)
    )

    cash_rows = await db.execute(
        select(
            CashEntry.category,
            func.sum(CashEntry.amount).label("total"),
            CashEntry.direction,
        )
        .where(
            extract("year", CashEntry.date) == year,
            extract("month", CashEntry.date) == month,
            CashEntry.is_published == True,
        )
        .group_by(CashEntry.category, CashEntry.direction)
    )

    # Raw per-category accumulation
    raw: dict = {}
    for cat, total, direction in list(txn_rows) + list(cash_rows):
        cat = cat or "Other"
        if cat not in raw:
            raw[cat] = {"income": 0.0, "expense": 0.0}
        amt = abs(float(total or 0))
        if direction == "in":
            raw[cat]["income"] += amt
        else:
            raw[cat]["expense"] += amt

    # Build offset map: {offset_category -> amount} and total Transfer In
    offset_map: dict = {}
    transfer_in_total = 0.0
    for offset_cat, total in list(transfer_in_rows):
        amt = float(total or 0)
        transfer_in_total += amt
        if offset_cat:
            offset_map[offset_cat] = offset_map.get(offset_cat, 0.0) + amt

    # Totals
    total_income = sum(v["income"] for k, v in raw.items() if k not in NON_EXPENSE_CATEGORIES)
    total_expense = sum(v["expense"] for k, v in raw.items() if k not in NON_EXPENSE_CATEGORIES)
    net_expense = total_expense - transfer_in_total  # reimbursements reduce effective spend
    savings = raw.get(TRANSFER_SAVING, {}).get("expense", 0.0)
    investment = raw.get(INVESTMENT, {}).get("expense", 0.0)

    # Expense breakdown for pie chart: subtract Transfer In from its offset category
    expense_breakdown = {}
    for k, v in raw.items():
        if k in NON_EXPENSE_CATEGORIES or v["expense"] <= 0:
            continue
        net = v["expense"] - offset_map.get(k, 0.0)
        if net > 0:
            expense_breakdown[k] = round(net, 2)
    # Transfer In with no offset_category: unallocated reimbursement — reduce proportionally
    unallocated = offset_map.get(None, 0.0) if None in offset_map else 0.0
    if unallocated > 0 and expense_breakdown:
        total_bd = sum(expense_breakdown.values())
        for k in list(expense_breakdown):
            share = expense_breakdown[k] / total_bd * unallocated
            expense_breakdown[k] = round(max(0, expense_breakdown[k] - share), 2)
        expense_breakdown = {k: v for k, v in expense_breakdown.items() if v > 0}

    return {
        "year": year,
        "month": month,
        "categories": raw,
        "expense_breakdown": expense_breakdown,
        "summary": {
            "total_income": round(total_income, 2),
            "total_expense": round(total_expense, 2),
            "transfer_in": round(transfer_in_total, 2),
            "net_expense": round(net_expense, 2),
            "savings": round(savings, 2),
            "investment": round(investment, 2),
            "net": round(total_income - net_expense - savings - investment, 2),
        },
    }


@router.get("/history")
async def history_overview(db: AsyncSession = Depends(get_db)):
    """All-time monthly totals for the trend chart."""
    txn_rows = await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            func.coalesce(Transaction.confirmed_category, Transaction.raw_category).label("category"),
            Transaction.direction,
            func.sum(func.abs(Transaction.amount)).label("total"),
        )
        .where(Transaction.is_published == True)
        .group_by("year", "month", "category", Transaction.direction)
        .order_by("year", "month")
    )

    cash_rows = await db.execute(
        select(
            extract("year", CashEntry.date).label("year"),
            extract("month", CashEntry.date).label("month"),
            CashEntry.category,
            CashEntry.direction,
            func.sum(func.abs(CashEntry.amount)).label("total"),
        )
        .where(CashEntry.is_published == True)
        .group_by("year", "month", CashEntry.category, CashEntry.direction)
        .order_by("year", "month")
    )

    months: dict = {}
    for year, month, cat, direction, total in list(txn_rows) + list(cash_rows):
        key = f"{int(year)}-{int(month):02d}"
        cat = cat or "Other"
        if key not in months:
            months[key] = {"income": 0.0, "expense": 0.0, "transfer_in": 0.0, "savings": 0.0, "investment": 0.0, "breakdown": {}}
        amt = float(total or 0)
        if cat == TRANSFER_IN and direction == "in":
            months[key]["transfer_in"] += amt
        elif cat == TRANSFER_SAVING and direction == "out":
            months[key]["savings"] += amt
        elif cat == INVESTMENT and direction == "out":
            months[key]["investment"] += amt
        elif cat not in NON_EXPENSE_CATEGORIES:
            if direction == "in":
                months[key]["income"] += amt
            else:
                months[key]["expense"] += amt
                months[key]["breakdown"][cat] = months[key]["breakdown"].get(cat, 0.0) + amt

    # Compute net expense (after reimbursements)
    for v in months.values():
        v["net_expense"] = round(max(0, v["expense"] - v["transfer_in"]), 2)
        v["income"] = round(v["income"], 2)
        v["expense"] = round(v["expense"], 2)

    return {"history": months}
