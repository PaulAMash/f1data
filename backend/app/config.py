"""Runtime configuration, driven entirely by environment variables.

Secrets (F1 TV token, LLM key) live ONLY here and never leave the backend.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    # --- data behaviour --------------------------------------------------- #
    # When true, the app never attempts a network fetch and always serves the
    # realistic simulated race. Useful for demos, tests and offline dev.
    mock_mode: bool = os.getenv("PITWALL_IQ_MOCK_MODE", "false").lower() in ("1", "true", "yes")

    # When true (default) we try real pitwall/FastF1 data first, then fall back
    # to cache, then to mock if the fetch fails.
    enable_live_fetch: bool = os.getenv("PITWALL_IQ_ENABLE_LIVE", "true").lower() in ("1", "true", "yes")

    # Use FastF1 (richer laps/telemetry) when available. Requires f1pitwall[full].
    use_fastf1: bool = os.getenv("PITWALL_IQ_USE_FASTF1", "true").lower() in ("1", "true", "yes")

    fetch_timeout: int = int(os.getenv("PITWALL_IQ_FETCH_TIMEOUT", "30"))

    # --- cache ------------------------------------------------------------ #
    cache_dir: Path = Path(os.getenv("PITWALL_IQ_CACHE_DIR", str(_BACKEND_DIR / "data" / "cache")))
    cache_ttl_hours: int = int(os.getenv("PITWALL_IQ_CACHE_TTL_HOURS", "720"))  # 30 days

    # --- optional secrets (never sent to the frontend) -------------------- #
    f1tv_token: str | None = os.getenv("F1TV_TOKEN") or None
    llm_api_key: str | None = os.getenv("ANTHROPIC_API_KEY") or os.getenv("PITWALL_IQ_LLM_KEY") or None
    llm_model: str = os.getenv("PITWALL_IQ_LLM_MODEL", "claude-opus-4-8")

    # --- server ----------------------------------------------------------- #
    cors_origins: str = os.getenv("PITWALL_IQ_CORS", "http://localhost:3000")
    default_year: int = int(os.getenv("PITWALL_IQ_DEFAULT_YEAR", "2026"))

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_available(self) -> bool:
        return bool(self.llm_api_key)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.cache_dir.mkdir(parents=True, exist_ok=True)
    return s
