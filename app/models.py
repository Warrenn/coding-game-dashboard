"""SQLAlchemy ORM models."""

from datetime import datetime, timezone
from sqlalchemy import String, Float, DateTime, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    player_handle: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="USD")
    description: Mapped[str] = mapped_column(String(500), nullable=True)
    codingame_points_at_payment: Mapped[int] = mapped_column(Integer, nullable=True)
    rank_at_payment: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def __repr__(self) -> str:
        return f"<Payment id={self.id} player={self.player_handle} amount={self.amount}>"
