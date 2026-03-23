# Initial Setup & Run (Backend)

This document provides instructions to run the backend (FastAPI) for the `saree-erp-project`.

## 1. Requirements

- Python 3.10+ (the project requires `>=3.10,<4.0`)
- Docker (not mandatory if running locally with Python, but required if you use Docker Compose)
- `uv` (recommended to use as provided in this repo)

## 2. Install backend dependencies

Run the following in the `backend/` directory:

```bash
cd backend
uv sync
```

> Note: This repo uses `uv workspace`, and the virtual environment is typically at `../.venv`.

## 3. Run the backend (`python main.py`)

In the `backend/` directory, run:

```bash
uv run python main.py
```

The server will run at:

- `http://0.0.0.0:8111`
- Usually accessible at `http://localhost:8111`

## 4. Environment configuration

The project uses a `.env` file located at the root directory. If you haven't configured it yet, please check `.env` and ensure all required environment variables are set.

## 5. (Optional) Run with Docker Compose

If you want to use Docker Compose, follow the instructions in `development.md` or quickly start with:

```bash
docker compose watch
```

