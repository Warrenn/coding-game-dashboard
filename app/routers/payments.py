"""Router for payment recording endpoints."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Payment
from app.schemas import PaymentCreate, PaymentResponse, PaymentUpdate

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/", response_model=PaymentResponse, status_code=201, summary="Record a payment")
def create_payment(payment: PaymentCreate, db: Session = Depends(get_db)) -> Payment:
    """Record a new payment for a player's progress."""
    db_payment = Payment(**payment.model_dump())
    db.add(db_payment)
    db.commit()
    db.refresh(db_payment)
    return db_payment


@router.get("/", response_model=List[PaymentResponse], summary="List all payments")
def list_payments(
    skip: int = 0, limit: int = 100, db: Session = Depends(get_db)
) -> List[Payment]:
    """Retrieve a paginated list of all recorded payments."""
    return db.query(Payment).offset(skip).limit(limit).all()


@router.get(
    "/player/{handle}",
    response_model=List[PaymentResponse],
    summary="List payments for a player",
)
def list_payments_for_player(handle: str, db: Session = Depends(get_db)) -> List[Payment]:
    """Retrieve all payment records for a specific player."""
    return db.query(Payment).filter(Payment.player_handle == handle).all()


@router.get("/{payment_id}", response_model=PaymentResponse, summary="Get a payment")
def get_payment(payment_id: int, db: Session = Depends(get_db)) -> Payment:
    """Retrieve a single payment record by ID."""
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail=f"Payment {payment_id} not found.")
    return payment


@router.put("/{payment_id}", response_model=PaymentResponse, summary="Update a payment")
def update_payment(
    payment_id: int, update: PaymentUpdate, db: Session = Depends(get_db)
) -> Payment:
    """Update an existing payment record."""
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail=f"Payment {payment_id} not found.")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(payment, field, value)
    db.commit()
    db.refresh(payment)
    return payment


@router.delete("/{payment_id}", status_code=204, summary="Delete a payment")
def delete_payment(payment_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a payment record by ID."""
    payment = db.get(Payment, payment_id)
    if payment is None:
        raise HTTPException(status_code=404, detail=f"Payment {payment_id} not found.")
    db.delete(payment)
    db.commit()
