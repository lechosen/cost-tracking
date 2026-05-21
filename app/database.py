from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import os

DB_PATH = os.getenv("DB_PATH", "cost_tool.db")
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add offset_category column if it doesn't exist yet (idempotent migration)
        try:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE transactions ADD COLUMN offset_category VARCHAR(100)"
                )
            )
        except Exception:
            pass  # column already exists
