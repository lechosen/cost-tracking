from sqlalchemy import Column, Integer, String, Float, Date, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    description = Column(Text, nullable=False)
    amount = Column(Float, nullable=False)          # positive = income, negative = expense
    direction = Column(String(10), nullable=False)  # "in" or "out"
    source_file = Column(String(255))               # original uploaded filename
    account_type = Column(String(50))               # "chequing", "visa", "cash"
    raw_category = Column(String(100))              # LLM-assigned category
    confirmed_category = Column(String(100))        # user-confirmed category
    is_reviewed = Column(Boolean, default=False, index=True)
    is_published = Column(Boolean, default=False, index=True)
    notes = Column(Text)
    offset_category = Column(String(100))             # for Transfer In: which category it offsets
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CashEntry(Base):
    __tablename__ = "cash_entries"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    description = Column(Text, nullable=False)
    amount = Column(Float, nullable=False)          # positive = income, negative = expense
    direction = Column(String(10), nullable=False)  # "in" or "out"
    category = Column(String(100))
    is_published = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
