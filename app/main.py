import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from app.database import init_db
from app.routers import uploads, transactions, reports, imports

APP_PIN = os.getenv("APP_PIN", "")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Cost Tracker", lifespan=lifespan)


@app.middleware("http")
async def pin_guard(request: Request, call_next):
    """Block all API routes unless the correct PIN is provided (or no PIN is set)."""
    if APP_PIN and request.url.path.startswith("/api"):
        pin = request.headers.get("X-App-Pin") or request.query_params.get("pin")
        if pin != APP_PIN:
            return JSONResponse(status_code=401, content={"detail": "Invalid PIN"})
    return await call_next(request)


app.include_router(uploads.router)
app.include_router(transactions.router)
app.include_router(reports.router)
app.include_router(imports.router)

# Serve frontend
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
