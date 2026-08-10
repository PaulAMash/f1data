"""Shared test bootstrap.

WHY THIS FILE EXISTS. Two test modules set `PITWALL_IQ_MOCK_MODE=true` at import
time and then import the app — and `get_settings()` is `lru_cache`d, so whichever
module happens to be imported FIRST decides the settings for the entire run.
That worked only for as long as one of those two modules was the first thing to
pull in `app.main`, which is a property of alphabetical filenames rather than of
anything anyone decided. Adding a test file whose name sorts earlier flipped the
whole suite into live-fetch mode and sent two unrelated tests at the network.

So the decision is made here instead, once, before any test module is imported:
pytest loads conftest first, the environment is set, and the settings cache is
cleared so nothing that ran during collection can have cached the wrong answer.

Tests that genuinely need live behaviour (test_website_hardening,
test_upstream_resilience) already say so explicitly by overriding `mock_mode` and
`enable_live_fetch` themselves — which is the right way round: the default is the
offline one, and reaching the network is something a test has to ask for.
"""
import os

os.environ.setdefault("PITWALL_IQ_MOCK_MODE", "true")

from app.config import get_settings  # noqa: E402

get_settings.cache_clear()
