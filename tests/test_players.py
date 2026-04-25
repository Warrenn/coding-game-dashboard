"""Tests for the CodingGame player stats endpoint."""

import pytest
import httpx
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient


MOCK_STATS_RESPONSE = {
    "codingamePointsTotal": 5000,
    "codingamePointsRank": 12345,
    "codingamePointsLevel": 20,
    "codingamer": {
        "pseudo": "TestPlayer",
        "countryId": "US",
        "company": "Acme Corp",
        "school": "MIT",
        "avatar": 987654,
    },
}

MOCK_STATS_NO_POINTS_RESPONSE = {
    "codingamer": {
        "pseudo": "TestPlayer",
    },
}


def _mock_response(json_data, status_code=200):
    response = httpx.Response(status_code, json=json_data)
    return response


@patch("app.codinggame._build_client")
def test_get_player_stats_success(mock_build_client, client: TestClient):
    """Valid handle returns player stats."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=_mock_response(MOCK_STATS_RESPONSE))
    mock_build_client.return_value = mock_client

    response = client.get("/players/testplayer/stats")

    assert response.status_code == 200
    data = response.json()
    assert data["handle"] == "testplayer"
    assert data["pseudo"] == "TestPlayer"
    assert data["codingame_points"] == 5000
    assert data["rank"] == 12345
    assert data["level"] == 20
    assert data["country"] == "US"
    assert data["company"] == "Acme Corp"
    assert data["school"] == "MIT"
    assert "avatar_url" in data
    assert "987654" in data["avatar_url"]


@patch("app.codinggame._build_client")
def test_get_player_stats_not_found_empty_response(mock_build_client, client: TestClient):
    """Empty response body triggers 404."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=_mock_response(None, status_code=404))
    mock_build_client.return_value = mock_client

    response = client.get("/players/unknown_handle/stats")
    assert response.status_code == 404


@patch("app.codinggame._build_client")
def test_get_player_stats_missing_points_field(mock_build_client, client: TestClient):
    """Response missing codingamePointsTotal triggers 404."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(
        return_value=_mock_response(MOCK_STATS_NO_POINTS_RESPONSE)
    )
    mock_build_client.return_value = mock_client

    response = client.get("/players/testplayer/stats")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@patch("app.codinggame._build_client")
def test_get_player_stats_api_error(mock_build_client, client: TestClient):
    """Non-200/404 status code from CodingGame API triggers 502."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=_mock_response({}, status_code=500))
    mock_build_client.return_value = mock_client

    response = client.get("/players/testplayer/stats")
    assert response.status_code == 502


@patch("app.codinggame._build_client")
def test_get_player_stats_no_avatar(mock_build_client, client: TestClient):
    """Player without avatar returns None avatar_url."""
    stats = {**MOCK_STATS_RESPONSE, "codingamer": {"pseudo": "NoAvatar"}}
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    mock_client.post = AsyncMock(return_value=_mock_response(stats))
    mock_build_client.return_value = mock_client

    response = client.get("/players/noavatar/stats")
    assert response.status_code == 200
    assert response.json()["avatar_url"] is None
