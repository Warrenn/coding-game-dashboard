# coding-game-dashboard

A FastAPI application to **verify CodingGame player statistics** and **manage a payment recording system** tracking player progress.

## Features

- **Player Stats** – fetch and verify a player's CodingGame points, rank, level, country, company and school via the CodingGame public API.
- **Payment Recording** – full CRUD API to record payments against a player's handle, optionally capturing their CodingGame points and rank at the time of payment.

## Running the API

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The interactive API docs are available at `http://localhost:8000/docs`.

## API Endpoints

### Player Stats
| Method | Path | Description |
|--------|------|-------------|
| GET | `/players/{handle}/stats` | Fetch and verify a player's CodingGame stats |

### Payments
| Method | Path | Description |
|--------|------|-------------|
| POST | `/payments/` | Record a new payment |
| GET | `/payments/` | List all payments (supports `skip` / `limit`) |
| GET | `/payments/{id}` | Get a payment by ID |
| GET | `/payments/player/{handle}` | List all payments for a player |
| PUT | `/payments/{id}` | Update a payment |
| DELETE | `/payments/{id}` | Delete a payment |

## Running Tests

```bash
pytest tests/ -v
```

## Configuration

| Environment Variable | Default | Description |
|----------------------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./coding_game_dashboard.db` | SQLAlchemy database URL |
