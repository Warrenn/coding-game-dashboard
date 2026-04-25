"""Router for CodingGame player stats endpoints."""

from fastapi import APIRouter, HTTPException
from app.codinggame import fetch_player_stats, PlayerNotFoundError, CodingGameAPIError
from app.schemas import PlayerStats

router = APIRouter(prefix="/players", tags=["players"])


@router.get("/{handle}/stats", response_model=PlayerStats, summary="Get player stats")
async def get_player_stats(handle: str) -> PlayerStats:
    """
    Fetch and verify statistics for a CodingGame player by their handle.

    Returns player stats including total CodingGame points, rank, level,
    country, company, and school.
    """
    try:
        return await fetch_player_stats(handle)
    except PlayerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CodingGameAPIError as exc:
        raise HTTPException(
            status_code=502, detail=f"CodingGame API error: {exc}"
        ) from exc
