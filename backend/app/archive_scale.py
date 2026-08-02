"""How much of Formula 1 this product actually covers.

The landing page states the scale of the archive in five figures. Those figures
were literals in a React component — true when they were typed and quietly
wrong from the next race onward, which is the worst kind of wrong because
nothing ever reports it. A landing statistic that has gone stale undermines
every number beside it, and the standing rule in this repo is that a flourish
may fail to *no* flourish and may never make the product lie.

So they are derived here, from one table of reference data and the current
date, and nothing on the page is a number somebody typed.

WHY A TABLE AND NOT A QUERY. Counting the archive properly means one request
per season, seventy-six times, on a page a first-time visitor is waiting on.
The number of World Championship Grands Prix held in 1974 is also not going to
change. It is reference data, exactly like the constructor list, and it is kept
here where its provenance can be stated rather than inferred.
"""

from __future__ import annotations

from datetime import date

FIRST_SEASON = 1950

# World Championship Grands Prix per season. The Indianapolis 500 rounds of
# 1950–1960 are included, as they are in the official record.
RACES_PER_SEASON: dict[int, int] = {
    1950: 7, 1951: 8, 1952: 8, 1953: 9, 1954: 9,
    1955: 7, 1956: 8, 1957: 8, 1958: 11, 1959: 9,
    1960: 10, 1961: 8, 1962: 9, 1963: 10, 1964: 10,
    1965: 10, 1966: 9, 1967: 11, 1968: 12, 1969: 11,
    1970: 13, 1971: 11, 1972: 12, 1973: 15, 1974: 15,
    1975: 14, 1976: 16, 1977: 17, 1978: 16, 1979: 15,
    1980: 14, 1981: 15, 1982: 16, 1983: 15, 1984: 16,
    1985: 16, 1986: 16, 1987: 16, 1988: 16, 1989: 16,
    1990: 16, 1991: 16, 1992: 16, 1993: 16, 1994: 16,
    1995: 17, 1996: 16, 1997: 17, 1998: 16, 1999: 16,
    2000: 17, 2001: 17, 2002: 17, 2003: 16, 2004: 18,
    2005: 19, 2006: 18, 2007: 17, 2008: 18, 2009: 17,
    2010: 19, 2011: 19, 2012: 20, 2013: 19, 2014: 19,
    2015: 19, 2016: 21, 2017: 20, 2018: 21, 2019: 21,
    2020: 17, 2021: 22, 2022: 22, 2023: 22, 2024: 24,
    2025: 24, 2026: 24,
}


def archive_scale(today: date | None = None) -> dict:
    """Coverage figures for the landing page.

    Every value is either counted or subtracted; none is asserted. `races`
    deliberately counts only *completed* seasons, so the figure never claims a
    Grand Prix that has not been run yet.
    """
    now = today or date.today()
    season = now.year
    last_complete = season - 1

    races = sum(n for y, n in RACES_PER_SEASON.items() if y <= last_complete)
    this_season = RACES_PER_SEASON.get(season, 0)

    return {
        "first_season": FIRST_SEASON,
        "season": season,
        # inclusive of the season in progress, which is what "covers" means
        "seasons": season - FIRST_SEASON + 1,
        "races": races,
        "season_races": this_season,
        "through": last_complete,
    }
