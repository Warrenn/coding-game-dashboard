"""Tests for the payment recording system."""

import pytest
from fastapi.testclient import TestClient


def test_root_health_check(client: TestClient):
    """Health check endpoint returns 200."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_payment(client: TestClient):
    """Successfully create a payment record."""
    payload = {
        "player_handle": "alice",
        "amount": 99.99,
        "currency": "USD",
        "description": "Monthly subscription",
        "codingame_points_at_payment": 3500,
        "rank_at_payment": 500,
    }
    response = client.post("/payments/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["player_handle"] == "alice"
    assert data["amount"] == 99.99
    assert data["currency"] == "USD"
    assert data["description"] == "Monthly subscription"
    assert data["codingame_points_at_payment"] == 3500
    assert data["rank_at_payment"] == 500
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


def test_create_payment_currency_uppercase(client: TestClient):
    """Currency is normalised to uppercase."""
    payload = {"player_handle": "bob", "amount": 10.00, "currency": "eur"}
    response = client.post("/payments/", json=payload)
    assert response.status_code == 201
    assert response.json()["currency"] == "EUR"


def test_create_payment_invalid_amount(client: TestClient):
    """Amount must be positive; zero or negative amounts are rejected."""
    for bad_amount in [0, -5.00]:
        response = client.post(
            "/payments/", json={"player_handle": "carol", "amount": bad_amount}
        )
        assert response.status_code == 422


def test_list_all_payments_empty(client: TestClient):
    """No payments returns an empty list."""
    response = client.get("/payments/")
    assert response.status_code == 200
    assert response.json() == []


def test_list_all_payments(client: TestClient):
    """Listed payments match what was created."""
    client.post("/payments/", json={"player_handle": "dave", "amount": 20.00})
    client.post("/payments/", json={"player_handle": "eve", "amount": 30.00})
    response = client.get("/payments/")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_payments_pagination(client: TestClient):
    """Pagination skip and limit parameters work correctly."""
    for i in range(5):
        client.post("/payments/", json={"player_handle": f"player{i}", "amount": float(i + 1)})
    response = client.get("/payments/?skip=2&limit=2")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_payments_for_player(client: TestClient):
    """Filtering payments by player handle returns only that player's records."""
    client.post("/payments/", json={"player_handle": "frank", "amount": 15.00})
    client.post("/payments/", json={"player_handle": "grace", "amount": 25.00})
    client.post("/payments/", json={"player_handle": "frank", "amount": 35.00})

    response = client.get("/payments/player/frank")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert all(p["player_handle"] == "frank" for p in data)


def test_get_payment_by_id(client: TestClient):
    """Retrieve a specific payment by its ID."""
    create_resp = client.post(
        "/payments/", json={"player_handle": "henry", "amount": 50.00}
    )
    payment_id = create_resp.json()["id"]

    response = client.get(f"/payments/{payment_id}")
    assert response.status_code == 200
    assert response.json()["id"] == payment_id
    assert response.json()["player_handle"] == "henry"


def test_get_payment_not_found(client: TestClient):
    """Requesting a non-existent payment ID returns 404."""
    response = client.get("/payments/99999")
    assert response.status_code == 404


def test_update_payment(client: TestClient):
    """Update an existing payment's amount and description."""
    create_resp = client.post(
        "/payments/",
        json={"player_handle": "iris", "amount": 10.00, "description": "Old"},
    )
    payment_id = create_resp.json()["id"]

    response = client.put(
        f"/payments/{payment_id}",
        json={"amount": 20.00, "description": "Updated"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["amount"] == 20.00
    assert data["description"] == "Updated"
    assert data["player_handle"] == "iris"


def test_update_payment_not_found(client: TestClient):
    """Updating a non-existent payment returns 404."""
    response = client.put("/payments/99999", json={"amount": 50.00})
    assert response.status_code == 404


def test_update_payment_invalid_amount(client: TestClient):
    """Updating with a non-positive amount is rejected."""
    create_resp = client.post(
        "/payments/", json={"player_handle": "jack", "amount": 10.00}
    )
    payment_id = create_resp.json()["id"]

    response = client.put(f"/payments/{payment_id}", json={"amount": -1.00})
    assert response.status_code == 422


def test_delete_payment(client: TestClient):
    """Delete a payment and confirm it is no longer retrievable."""
    create_resp = client.post(
        "/payments/", json={"player_handle": "kate", "amount": 5.00}
    )
    payment_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/payments/{payment_id}")
    assert delete_resp.status_code == 204

    get_resp = client.get(f"/payments/{payment_id}")
    assert get_resp.status_code == 404


def test_delete_payment_not_found(client: TestClient):
    """Deleting a non-existent payment returns 404."""
    response = client.delete("/payments/99999")
    assert response.status_code == 404


def test_update_payment_currency_uppercase(client: TestClient):
    """Currency is normalised to uppercase when updating a payment."""
    create_resp = client.post(
        "/payments/", json={"player_handle": "mike", "amount": 10.00, "currency": "USD"}
    )
    payment_id = create_resp.json()["id"]

    response = client.put(f"/payments/{payment_id}", json={"currency": "gbp"})
    assert response.status_code == 200
    assert response.json()["currency"] == "GBP"


def test_payment_with_progress_snapshot(client: TestClient):
    """Payment record can capture player's CodingGame points and rank at payment time."""
    payload = {
        "player_handle": "leo",
        "amount": 49.99,
        "codingame_points_at_payment": 8200,
        "rank_at_payment": 150,
    }
    response = client.post("/payments/", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["codingame_points_at_payment"] == 8200
    assert data["rank_at_payment"] == 150

