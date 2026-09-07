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


def from_grid(grid: int | None, analyst: bool = False) -> str:
    """Where a driver started, as a clause — or nothing, when it is not known.

    "won from P?" was this clause with a placeholder in it, and "won from
    pole" was the same clause when the grid was None and a truthiness test
    read None as "not greater than one". A starting position the sources did
    not publish is not P1 and it is not a question mark; the sentence simply
    does not say where they started. Ergast encodes a pit-lane start as grid
    0, which is a place, not a missing value.
    """
    if grid is None:
        return ""
    if grid == 0:
        return " from the pit lane"
    if grid == 1 and not analyst:
        return " from pole"
    return f" from P{grid}"
