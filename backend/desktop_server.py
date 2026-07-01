"""
Desktop sidecar entrypoint for Pitwall IQ.

Runs the FastAPI backend as a plain local process on 127.0.0.1 so the Tauri
desktop shell can launch it automatically — the user never runs uvicorn by hand.

Port resolution (first match wins):
  1. --port <n> CLI arg   (Tauri passes this)
  2. PITWALL_IQ_PORT env
  3. 8765 (default; deliberately not 8000 so a dev backend can run alongside)

When frozen by PyInstaller (inside the .app), the working directory is read-only,
so the cache is redirected to a per-user Application Support directory unless the
caller already set PITWALL_IQ_CACHE_DIR.
"""
from __future__ import annotations

import argparse
import multiprocessing
import os
import sys
from pathlib import Path

DEFAULT_PORT = 8765


def _frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def _resolve_port() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--host", type=str, default="127.0.0.1")
    args, _ = parser.parse_known_args()
    if args.port:
        return args.port
    env = os.environ.get("PITWALL_IQ_PORT")
    if env and env.isdigit():
        return int(env)
    return DEFAULT_PORT


def _user_cache_dir() -> Path:
    """A writable per-user cache location for the packaged app."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "PitwallIQ"
    elif sys.platform.startswith("win"):
        base = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "PitwallIQ"
    else:
        base = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "pitwall-iq"
    return base / "cache"


def main() -> None:
    multiprocessing.freeze_support()  # safe no-op unless frozen + multiprocessing used

    # Redirect the cache to a writable location inside the packaged app.
    if _frozen() and not os.environ.get("PITWALL_IQ_CACHE_DIR"):
        cache = _user_cache_dir()
        cache.mkdir(parents=True, exist_ok=True)
        os.environ["PITWALL_IQ_CACHE_DIR"] = str(cache)

    host = os.environ.get("PITWALL_IQ_HOST", "127.0.0.1")
    port = _resolve_port()

    # Import after env is prepared so config picks up the cache dir override.
    import uvicorn

    from app.main import app

    print(f"[pitwall-iq-backend] starting on http://{host}:{port}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="info", workers=1)


if __name__ == "__main__":
    main()
