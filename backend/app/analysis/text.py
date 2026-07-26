"""Small text helpers shared by every narrative the analysis layer writes.

"1 places" and "2 lap(s)" are the kind of detail that quietly tells a reader the
copy was generated rather than written. One helper, used everywhere, keeps the
product's voice consistent.
"""
from __future__ import annotations


def plural(n: int, singular: str, plural_form: str | None = None) -> str:
    """`plural(1, "place")` -> "1 place"; `plural(2, "place")` -> "2 places"."""
    word = singular if abs(n) == 1 else (plural_form or f"{singular}s")
    return f"{n} {word}"


def pluralise(n: int, singular: str, plural_form: str | None = None) -> str:
    """The word alone, correctly inflected — for when the count is shown apart."""
    return singular if abs(n) == 1 else (plural_form or f"{singular}s")
