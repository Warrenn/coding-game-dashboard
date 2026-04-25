"""Pydantic schemas for request/response validation."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class PlayerStats(BaseModel):
    """CodingGame player statistics."""

    handle: str
    pseudo: Optional[str] = None
    codingame_points: int = Field(ge=0)
    rank: Optional[int] = Field(default=None, ge=1)
    level: Optional[int] = Field(default=None, ge=0)
    country: Optional[str] = None
    company: Optional[str] = None
    school: Optional[str] = None
    avatar_url: Optional[str] = None

    model_config = {"from_attributes": True}


class PaymentCreate(BaseModel):
    """Schema for creating a payment record."""

    player_handle: str = Field(min_length=1, max_length=255)
    amount: float = Field(gt=0, description="Payment amount (must be positive)")
    currency: str = Field(default="USD", max_length=10)
    description: Optional[str] = Field(default=None, max_length=500)
    codingame_points_at_payment: Optional[int] = Field(default=None, ge=0)
    rank_at_payment: Optional[int] = Field(default=None, ge=1)

    @field_validator("currency")
    @classmethod
    def currency_uppercase(cls, v: str) -> str:
        return v.upper()


class PaymentUpdate(BaseModel):
    """Schema for updating a payment record."""

    amount: Optional[float] = Field(default=None, gt=0)
    currency: Optional[str] = Field(default=None, max_length=10)
    description: Optional[str] = Field(default=None, max_length=500)
    codingame_points_at_payment: Optional[int] = Field(default=None, ge=0)
    rank_at_payment: Optional[int] = Field(default=None, ge=1)

    @field_validator("currency")
    @classmethod
    def currency_uppercase(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return v.upper()
        return v


class PaymentResponse(BaseModel):
    """Schema for returning a payment record."""

    id: int
    player_handle: str
    amount: float
    currency: str
    description: Optional[str] = None
    codingame_points_at_payment: Optional[int] = None
    rank_at_payment: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
