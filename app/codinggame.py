"""CodingGame API client for fetching player statistics."""

from typing import Optional
import httpx
from app.schemas import PlayerStats

CODINGAME_API_BASE = "https://www.codingame.com/services"
DEFAULT_TIMEOUT = 10.0


class CodingGameAPIError(Exception):
    """Raised when the CodingGame API returns an error response."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        self.status_code = status_code
        super().__init__(message)


class PlayerNotFoundError(CodingGameAPIError):
    """Raised when a player handle is not found on CodingGame."""


def _build_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=DEFAULT_TIMEOUT,
        headers={"Content-Type": "application/json"},
    )


async def fetch_player_stats(handle: str) -> PlayerStats:
    """
    Fetch and return statistics for a CodingGame player by their handle.

    Raises:
        PlayerNotFoundError: If no player with the given handle exists.
        CodingGameAPIError: If the CodingGame API returns an unexpected error.
    """
    url = f"{CODINGAME_API_BASE}/CodinGamer/findCodingamePointsStatsByHandle"
    payload = [handle]

    async with _build_client() as client:
        response = await client.post(url, json=payload)

    if response.status_code == 404:
        raise PlayerNotFoundError(f"Player '{handle}' not found on CodingGame.")

    if response.status_code != 200:
        raise CodingGameAPIError(
            f"CodingGame API returned status {response.status_code}.",
            status_code=response.status_code,
        )

    data = response.json()

    if not data or "codingamePointsTotal" not in data:
        raise PlayerNotFoundError(f"Player '{handle}' not found on CodingGame.")

    codingamer = data.get("codingamer", {})
    avatar_id = codingamer.get("avatar")
    avatar_url = (
        f"https://static.codingame.com/servlet/fileservlet?id={avatar_id}&format=profile_avatar"
        if avatar_id
        else None
    )

    return PlayerStats(
        handle=handle,
        pseudo=codingamer.get("pseudo"),
        codingame_points=data.get("codingamePointsTotal", 0),
        rank=data.get("codingamePointsRank"),
        level=data.get("codingamePointsLevel"),
        country=codingamer.get("countryId"),
        company=codingamer.get("company"),
        school=codingamer.get("school"),
        avatar_url=avatar_url,
    )
