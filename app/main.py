"""CodingGame Dashboard API application."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from app.database import init_db
from app.routers import players, payments


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    init_db()
    yield


app = FastAPI(
    title="CodingGame Dashboard",
    description=(
        "Verify CodingGame player statistics and manage a payment recording system "
        "for tracking player progress."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(players.router)
app.include_router(payments.router)


@app.get("/", tags=["health"])
def root() -> dict:
    """Health check endpoint."""
    return {"status": "ok", "service": "CodingGame Dashboard"}
