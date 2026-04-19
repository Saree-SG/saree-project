"""
Local entrypoint for running the backend with plain Python.

Example:
  pip install -r requirements.txt
  python main.py
"""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    """Run the FastAPI app with Uvicorn."""

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8111"))
    reload_flag = os.environ.get("RELOAD", "1") == "1"
    uvicorn.run("app.main:app", host=host, port=port, reload=reload_flag)


if __name__ == "__main__":
    main()
