"""THE 2026 SEASON, AS THE PROVIDERS WOULD ANSWER IT — the regression world.

Everything the backend fetches goes through `app.upstream.fetch_json`, so one
router stub stands in for OpenF1 and Jolpica together, and the real adapters,
merge, source chain, post-processing and API run unchanged over it.

The world is deliberately the awkward one: sprint weekends and normal ones,
three pre-season tests (two of them at Sakhir, the Bahrain Grand Prix's own
circuit), OpenF1's second "Bahrain Grand Prix" meeting — the "IN MALAYSIA"
placeholder at Sepang that production carried in September 2026 — and two
rounds in one country. Nothing in it is a real timing record; it is the SHAPE
of the providers' answers, which is what the pipeline has to survive.

Knobs on `SeasonWorld` degrade a source the way production does — a meeting
OpenF1 has not loaded, a feed that answers empty, a round the results archive
has not published, a host that is down — so a test can ask what the reader is
told in each case.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import requests

UTC = timezone.utc
YEAR = 2026

OPENF1 = "https://api.openf1.org/v1"
JOLPICA = "https://api.jolpi.ca/ergast/f1"

NORMAL = ["Practice 1", "Practice 2", "Practice 3", "Qualifying", "Race"]
SPRINT = ["Practice 1", "Sprint Qualifying", "Sprint", "Qualifying", "Race"]

# round, jolpica raceName, openf1 meeting_name, location, country, circuit_short_name,
# official name, friday (ISO date), format
ROUNDS = [
    (1, "Australian Grand Prix", "Australian Grand Prix", "Melbourne", "Australia", "Melbourne",
     "FORMULA 1 LOUIS VUITTON AUSTRALIAN GRAND PRIX 2026", "2026-03-06", NORMAL),
    (2, "Chinese Grand Prix", "Chinese Grand Prix", "Shanghai", "China", "Shanghai",
     "FORMULA 1 HEINEKEN CHINESE GRAND PRIX 2026", "2026-03-13", SPRINT),
    (3, "Japanese Grand Prix", "Japanese Grand Prix", "Suzuka", "Japan", "Suzuka",
     "FORMULA 1 HONDA JAPANESE GRAND PRIX 2026", "2026-03-27", NORMAL),
    (4, "Bahrain Grand Prix", "Bahrain Grand Prix", "Sakhir", "Bahrain", "Sakhir",
     "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2026", "2026-04-10", NORMAL),
    (5, "Saudi Arabian Grand Prix", "Saudi Arabian Grand Prix", "Jeddah", "Saudi Arabia", "Jeddah",
     "FORMULA 1 STC SAUDI ARABIAN GRAND PRIX 2026", "2026-04-17", NORMAL),
    (6, "Miami Grand Prix", "Miami Grand Prix", "Miami", "United States", "Miami",
     "FORMULA 1 CRYPTO.COM MIAMI GRAND PRIX 2026", "2026-05-01", SPRINT),
    (7, "Canadian Grand Prix", "Canadian Grand Prix", "Montréal", "Canada", "Montreal",
     "FORMULA 1 PIRELLI GRAND PRIX DU CANADA 2026", "2026-05-22", SPRINT),
    (8, "Monaco Grand Prix", "Monaco Grand Prix", "Monaco", "Monaco", "Monte Carlo",
     "FORMULA 1 TAG HEUER GRAND PRIX DE MONACO 2026", "2026-06-05", NORMAL),
    (9, "Spanish Grand Prix", "Spanish Grand Prix", "Barcelona", "Spain", "Catalunya",
     "FORMULA 1 GRAN PREMIO DE ESPAÑA 2026", "2026-06-12", NORMAL),
    (10, "Austrian Grand Prix", "Austrian Grand Prix", "Spielberg", "Austria", "Spielberg",
     "FORMULA 1 MSC CRUISES AUSTRIAN GRAND PRIX 2026", "2026-06-26", NORMAL),
    (11, "British Grand Prix", "British Grand Prix", "Silverstone", "United Kingdom", "Silverstone",
     "FORMULA 1 QATAR AIRWAYS BRITISH GRAND PRIX 2026", "2026-07-03", SPRINT),
    (12, "Belgian Grand Prix", "Belgian Grand Prix", "Spa-Francorchamps", "Belgium", "Spa-Francorchamps",
     "FORMULA 1 MOËT & CHANDON BELGIAN GRAND PRIX 2026", "2026-07-17", NORMAL),
    (13, "Hungarian Grand Prix", "Hungarian Grand Prix", "Budapest", "Hungary", "Hungaroring",
     "FORMULA 1 HUNGARIAN GRAND PRIX 2026", "2026-07-24", NORMAL),
    (14, "Dutch Grand Prix", "Dutch Grand Prix", "Zandvoort", "Netherlands", "Zandvoort",
     "FORMULA 1 HEINEKEN DUTCH GRAND PRIX 2026", "2026-08-21", SPRINT),
    (15, "Italian Grand Prix", "Italian Grand Prix", "Monza", "Italy", "Monza",
     "FORMULA 1 PIRELLI GRAN PREMIO D’ITALIA 2026", "2026-09-04", NORMAL),
    (16, "Madrid Grand Prix", "Madrid Grand Prix", "Madrid", "Spain", "Madrid",
     "FORMULA 1 MADRID GRAND PRIX 2026", "2026-09-11", NORMAL),
    (17, "Azerbaijan Grand Prix", "Azerbaijan Grand Prix", "Baku", "Azerbaijan", "Baku",
     "FORMULA 1 QATAR AIRWAYS AZERBAIJAN GRAND PRIX 2026", "2026-09-24", NORMAL),
    (18, "Singapore Grand Prix", "Singapore Grand Prix", "Marina Bay", "Singapore", "Singapore",
     "FORMULA 1 SINGAPORE AIRLINES SINGAPORE GRAND PRIX 2026", "2026-10-09", SPRINT),
    (19, "United States Grand Prix", "United States Grand Prix", "Austin", "United States", "Austin",
     "FORMULA 1 MSC CRUISES UNITED STATES GRAND PRIX 2026", "2026-10-23", NORMAL),
    (20, "Mexico City Grand Prix", "Mexico City Grand Prix", "Mexico City", "Mexico", "Mexico City",
     "FORMULA 1 GRAN PREMIO DE LA CIUDAD DE MÉXICO 2026", "2026-10-30", NORMAL),
    (21, "São Paulo Grand Prix", "São Paulo Grand Prix", "São Paulo", "Brazil", "Interlagos",
     "FORMULA 1 MSC CRUISES GRANDE PRÊMIO DE SÃO PAULO 2026", "2026-11-06", NORMAL),
    (22, "Las Vegas Grand Prix", "Las Vegas Grand Prix", "Las Vegas", "United States", "Las Vegas",
     "FORMULA 1 HEINEKEN LAS VEGAS GRAND PRIX 2026", "2026-11-19", NORMAL),
    (23, "Qatar Grand Prix", "Qatar Grand Prix", "Lusail", "Qatar", "Lusail",
     "FORMULA 1 QATAR AIRWAYS QATAR GRAND PRIX 2026", "2026-11-27", NORMAL),
    (24, "Abu Dhabi Grand Prix", "Abu Dhabi Grand Prix", "Yas Island", "United Arab Emirates", "Yas Marina Circuit",
     "FORMULA 1 ETIHAD AIRWAYS ABU DHABI GRAND PRIX 2026", "2026-12-04", NORMAL),
]

#: OpenF1 meetings that are not rounds: the tests, and the placeholder that
#: shares the Bahrain Grand Prix's short name (observed in production, Sept 2026).
EXTRA_MEETINGS = [
    dict(meeting_key=1279, meeting_name="Pre-Season Testing",
         meeting_official_name="FORMULA 1 ARAMCO PRE-SEASON TESTING 2026",
         location="Barcelona", country_name="Spain", circuit_short_name="Catalunya",
         date_start="2026-01-26T09:00:00+00:00", sessions=["Day 1", "Day 2", "Day 3"]),
    dict(meeting_key=1280, meeting_name="Pre-Season Testing",
         meeting_official_name="FORMULA 1 ARAMCO PRE-SEASON TESTING 1 2026",
         location="Sakhir", country_name="Bahrain", circuit_short_name="Sakhir",
         date_start="2026-02-11T07:00:00+00:00", sessions=["Day 1", "Day 2", "Day 3"]),
    dict(meeting_key=1281, meeting_name="Pre-Season Testing",
         meeting_official_name="FORMULA 1 ARAMCO PRE-SEASON TESTING 2 2026",
         location="Sakhir", country_name="Bahrain", circuit_short_name="Sakhir",
         date_start="2026-02-18T07:00:00+00:00", sessions=["Day 1", "Day 2", "Day 3"]),
    dict(meeting_key=1308, meeting_name="Bahrain Grand Prix",
         meeting_official_name="FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026",
         location="Kuala Lumpur", country_name="Bahrain", circuit_short_name="Kuala Lumpur",
         date_start="2026-10-02T07:00:00+00:00", sessions=list(NORMAL), placeholder=True),
]

DRIVERS = [  # number, code, first, last, team, colour, id
    (1, "VER", "Max", "Verstappen", "Red Bull Racing", "3671C6", "max_verstappen"),
    (4, "NOR", "Lando", "Norris", "McLaren", "FF8000", "norris"),
    (81, "PIA", "Oscar", "Piastri", "McLaren", "FF8000", "piastri"),
    (16, "LEC", "Charles", "Leclerc", "Ferrari", "E80020", "leclerc"),
    (44, "HAM", "Lewis", "Hamilton", "Ferrari", "E80020", "hamilton"),
    (63, "RUS", "George", "Russell", "Mercedes", "27F4D2", "russell"),
    (12, "ANT", "Kimi", "Antonelli", "Mercedes", "27F4D2", "antonelli"),
    (22, "TSU", "Yuki", "Tsunoda", "Red Bull Racing", "3671C6", "tsunoda"),
    (14, "ALO", "Fernando", "Alonso", "Aston Martin", "229971", "alonso"),
    (18, "STR", "Lance", "Stroll", "Aston Martin", "229971", "stroll"),
    (10, "GAS", "Pierre", "Gasly", "Alpine", "0093CC", "gasly"),
    (43, "COL", "Franco", "Colapinto", "Alpine", "0093CC", "colapinto"),
    (23, "ALB", "Alexander", "Albon", "Williams", "64C4FF", "albon"),
    (55, "SAI", "Carlos", "Sainz", "Williams", "64C4FF", "sainz"),
    (27, "HUL", "Nico", "Hülkenberg", "Kick Sauber", "52E252", "hulkenberg"),
    (5, "BOR", "Gabriel", "Bortoleto", "Kick Sauber", "52E252", "bortoleto"),
    (31, "OCO", "Esteban", "Ocon", "Haas F1 Team", "B6BABD", "ocon"),
    (87, "BEA", "Oliver", "Bearman", "Haas F1 Team", "B6BABD", "bearman"),
    (30, "LAW", "Liam", "Lawson", "Racing Bulls", "6692FF", "lawson"),
    (6, "HAD", "Isack", "Hadjar", "Racing Bulls", "6692FF", "hadjar"),
]

LAPS_FOR = {"race": 12, "sprint": 8, "qualifying": 6, "sprint_qualifying": 5, "practice": 6}


def _cat(name: str) -> str:
    from app.models import session_category
    return session_category(name)


# --------------------------------------------------------------------------- #
# schedule helpers
# --------------------------------------------------------------------------- #
def _friday(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=UTC)


def session_starts(friday: datetime, fmt: list[str]) -> dict[str, datetime]:
    """Start instants for a weekend, Friday to Sunday."""
    if fmt is SPRINT:
        return {"Practice 1": friday.replace(hour=11, minute=30),
                "Sprint Qualifying": friday.replace(hour=15, minute=30),
                "Sprint": (friday + timedelta(days=1)).replace(hour=11, minute=0),
                "Qualifying": (friday + timedelta(days=1)).replace(hour=15, minute=0),
                "Race": (friday + timedelta(days=2)).replace(hour=15, minute=0)}
    return {"Practice 1": friday.replace(hour=11, minute=30),
            "Practice 2": friday.replace(hour=15, minute=0),
            "Practice 3": (friday + timedelta(days=1)).replace(hour=11, minute=30),
            "Qualifying": (friday + timedelta(days=1)).replace(hour=15, minute=0),
            "Race": (friday + timedelta(days=2)).replace(hour=15, minute=0)}


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# --------------------------------------------------------------------------- #
# the world
# --------------------------------------------------------------------------- #
class SeasonWorld:
    """Every answer both providers would give for 2026, generated on demand.

    Knobs (set before the first request):
      openf1_missing_meetings  meeting names OpenF1 has no meeting or sessions for
      openf1_empty_feeds       {meeting_name: [endpoint, ...]} feeds that answer []
      jolpica_missing_rounds   rounds whose results/laps answer empty
      openf1_down / jolpica_down  the whole host raises a connection error
    """

    def __init__(self) -> None:
        self.openf1_missing_meetings: set[str] = set()
        self.openf1_empty_feeds: dict[str, set[str]] = {}
        self.jolpica_missing_rounds: set[int] = set()
        self.openf1_down = False
        self.jolpica_down = False
        self.calls: list[tuple[str, dict]] = []
        self._build()

    # ----- construction ------------------------------------------------- #
    def _build(self) -> None:
        self.meetings: list[dict] = []
        self.sessions: list[dict] = []
        self.by_key: dict[int, dict] = {}       # session_key -> meta
        key = 9000
        for rnd, _jname, oname, loc, country, circ, official, fri, fmt in ROUNDS:
            mk = 1400 + rnd
            friday = _friday(fri)
            self.meetings.append(dict(
                meeting_key=mk, meeting_name=oname, meeting_official_name=official,
                location=loc, country_name=country, circuit_short_name=circ,
                date_start=_iso(friday.replace(hour=9)), year=YEAR))
            for name, start in session_starts(friday, fmt).items():
                key += 1
                s = dict(session_key=key, meeting_key=mk, session_name=name,
                         session_type=("Race" if name in ("Race", "Sprint") else
                                       "Qualifying" if "Qualifying" in name else "Practice"),
                         meeting_name=oname, location=loc, country_name=country,
                         circuit_short_name=circ, date_start=_iso(start),
                         date_end=_iso(start + timedelta(hours=1)), year=YEAR,
                         _round=rnd, _placeholder=False)
                self.sessions.append(s)
                self.by_key[key] = s
        for extra in EXTRA_MEETINGS:
            m = {k: v for k, v in extra.items() if k not in ("sessions", "placeholder")}
            m["year"] = YEAR
            self.meetings.append(m)
            start = datetime.fromisoformat(extra["date_start"])
            for i, name in enumerate(extra["sessions"]):
                key += 1
                s = dict(session_key=key, meeting_key=extra["meeting_key"], session_name=name,
                         session_type="Practice" if name != "Race" else "Race",
                         meeting_name=extra["meeting_name"], location=extra["location"],
                         country_name=extra["country_name"],
                         circuit_short_name=extra["circuit_short_name"],
                         date_start=_iso(start + timedelta(days=i // 2, hours=(i % 2) * 4)),
                         year=YEAR, _round=None, _placeholder=True)
                self.sessions.append(s)
                self.by_key[key] = s

    # ----- OpenF1 per-session feeds -------------------------------------- #
    def openf1_feed(self, endpoint: str, sk: int) -> list[dict]:
        meta = self.by_key.get(sk)
        if meta is None or meta["_placeholder"]:
            return []
        name = meta["meeting_name"]
        if endpoint in self.openf1_empty_feeds.get(name, set()):
            return []
        cat = _cat(meta["session_name"])
        n_laps = LAPS_FOR[cat]
        start = datetime.fromisoformat(meta["date_start"])
        if endpoint == "drivers":
            return [dict(driver_number=num, name_acronym=code, full_name=f"{first} {last}",
                         first_name=first, last_name=last, broadcast_name=f"{first[0]} {last.upper()}",
                         team_name=team, team_colour=col, country_code="XXX",
                         headshot_url=None, session_key=sk, meeting_key=meta["meeting_key"])
                    for num, code, first, last, team, col, _id in DRIVERS]
        if endpoint == "laps":
            out = []
            for i, (num, *_r) in enumerate(DRIVERS):
                t = start
                for lap in range(1, n_laps + 1):
                    dur = 90.0 + i * 0.05 + (lap % 3) * 0.1
                    out.append(dict(driver_number=num, lap_number=lap, date_start=_iso(t),
                                    lap_duration=None if lap == 1 else dur,
                                    duration_sector_1=28.0, duration_sector_2=31.0, duration_sector_3=31.0,
                                    is_pit_out_lap=(lap == 6 and cat == "race"), session_key=sk))
                    t += timedelta(seconds=dur)
            return out
        if endpoint == "stints":
            if cat in ("race", "sprint"):
                return [s for num, *_r in DRIVERS for s in (
                    dict(driver_number=num, stint_number=1, compound="MEDIUM", lap_start=1,
                         lap_end=5, tyre_age_at_start=0, session_key=sk),
                    dict(driver_number=num, stint_number=2, compound="HARD", lap_start=6,
                         lap_end=n_laps, tyre_age_at_start=0, session_key=sk))]
            return [dict(driver_number=num, stint_number=1, compound="SOFT", lap_start=1,
                         lap_end=n_laps, tyre_age_at_start=0, session_key=sk) for num, *_r in DRIVERS]
        if endpoint == "pit":
            if cat != "race":
                return []
            return [dict(driver_number=num, lap_number=5, pit_duration=22.4 + i * 0.1,
                         date=_iso(start + timedelta(seconds=90 * 5 + 30)), session_key=sk)
                    for i, (num, *_r) in enumerate(DRIVERS)]
        if endpoint == "position":
            out = [dict(driver_number=num, position=i + 1, date=_iso(start + timedelta(seconds=5)),
                        session_key=sk) for i, (num, *_r) in enumerate(DRIVERS)]
            if cat in ("race", "sprint"):
                # one swap on lap 4: P2 and P3 exchange
                t = _iso(start + timedelta(seconds=90 * 3 + 40))
                out.append(dict(driver_number=DRIVERS[1][0], position=3, date=t, session_key=sk))
                out.append(dict(driver_number=DRIVERS[2][0], position=2, date=t, session_key=sk))
            return out
        if endpoint == "intervals":
            if cat not in ("race", "sprint"):
                return []
            out = []
            for lap in range(1, n_laps + 1):
                t = _iso(start + timedelta(seconds=90 * lap - 10))
                for i, (num, *_r) in enumerate(DRIVERS):
                    out.append(dict(driver_number=num, gap_to_leader=(0 if i == 0 else 1.2 * i),
                                    interval=(0 if i == 0 else 1.2), date=t, session_key=sk))
            return out
        if endpoint == "weather":
            return [dict(date=_iso(start + timedelta(minutes=m)), air_temperature=28.0,
                         track_temperature=41.0, humidity=40, rainfall=0, wind_speed=2.0,
                         wind_direction=180, session_key=sk) for m in (0, 20, 40)]
        if endpoint == "race_control":
            rows = [dict(date=_iso(start), lap_number=1, category="Flag", flag="GREEN",
                         scope="Track", message="GREEN LIGHT - PIT EXIT OPEN", session_key=sk)]
            if cat == "race":
                rows += [dict(date=_iso(start + timedelta(seconds=270)), lap_number=3,
                              category="SafetyCar", flag=None, scope="Track",
                              message="SAFETY CAR DEPLOYED", session_key=sk),
                         dict(date=_iso(start + timedelta(seconds=450)), lap_number=5,
                              category="SafetyCar", flag=None, scope="Track",
                              message="SAFETY CAR IN THIS LAP", session_key=sk)]
            return rows
        if endpoint == "overtakes":
            return []
        if endpoint == "starting_grid":
            if cat not in ("race", "sprint"):
                return []
            return [dict(driver_number=num, position=i + 1, session_key=sk)
                    for i, (num, *_r) in enumerate(DRIVERS)]
        if endpoint == "session_result":
            if cat == "practice":
                return []
            return [dict(driver_number=num, position=i + 1, number_of_laps=n_laps,
                         gap_to_leader=(0 if i == 0 else round(1.2 * i, 3)),
                         points=(10 if i == 0 else 0), dnf=False, dns=False, dsq=False,
                         duration=(3600.0 + i) if cat in ("race", "sprint") else 89.5 + i * 0.1,
                         session_key=sk, meeting_key=meta["meeting_key"])
                    for i, (num, *_r) in enumerate(DRIVERS)]
        return []

    # ----- Jolpica documents -------------------------------------------- #
    def jolpica_calendar(self) -> dict:
        races = []
        for rnd, jname, _o, loc, country, _c, _off, fri, fmt in ROUNDS:
            friday = _friday(fri)
            starts = session_starts(friday, fmt)
            race = dict(season=str(YEAR), round=str(rnd), raceName=jname,
                        Circuit=dict(circuitId=loc.lower().replace(" ", "_"),
                                     circuitName=f"{loc} Circuit",
                                     Location=dict(locality=loc, country=country)),
                        date=starts["Race"].date().isoformat(),
                        time=starts["Race"].strftime("%H:%M:%SZ"))
            def block(name):
                return dict(date=starts[name].date().isoformat(), time=starts[name].strftime("%H:%M:%SZ"))
            race["FirstPractice"] = block("Practice 1")
            if fmt is SPRINT:
                race["SprintQualifying"] = block("Sprint Qualifying")
                race["Sprint"] = block("Sprint")
            else:
                race["SecondPractice"] = block("Practice 2")
                race["ThirdPractice"] = block("Practice 3")
            race["Qualifying"] = block("Qualifying")
            races.append(race)
        return {"MRData": {"RaceTable": {"season": str(YEAR), "Races": races}}}

    def _round(self, rnd: int) -> tuple | None:
        return next((r for r in ROUNDS if r[0] == rnd), None)

    def jolpica_results(self, rnd: int) -> dict:
        r = self._round(rnd)
        if r is None or rnd in self.jolpica_missing_rounds:
            return {"MRData": {"RaceTable": {"Races": []}}}
        results = [dict(number=str(num), position=str(i + 1), positionText=str(i + 1),
                        points=str(10 if i == 0 else 0),
                        Driver=dict(driverId=did, code=code, givenName=first, familyName=last,
                                    nationality="X"),
                        Constructor=dict(constructorId=team.lower().replace(" ", "_"), name=team),
                        grid=str(i + 1), laps=str(LAPS_FOR["race"]), status="Finished",
                        Time=dict(millis=str(3600000 + i * 1000), time="1:00:00.000" if i == 0 else f"+{i}.000"))
                   for i, (num, code, first, last, team, _col, did) in enumerate(DRIVERS)]
        return {"MRData": {"RaceTable": {"Races": [dict(
            season=str(YEAR), round=str(rnd), raceName=r[1],
            Circuit=dict(circuitId=r[3].lower(), circuitName=f"{r[3]} Circuit",
                         Location=dict(locality=r[3], country=r[4])),
            date=r[7], Results=results)]}}}

    def jolpica_laps(self, rnd: int) -> dict:
        r = self._round(rnd)
        if r is None or rnd in self.jolpica_missing_rounds:
            return {"MRData": {"RaceTable": {"Races": []}}}
        laps = [dict(number=str(n), Timings=[dict(driverId=did, position=str(i + 1), time=f"1:3{i % 10}.{n:03d}")
                                            for i, (_num, _c, _f, _l, _t, _col, did) in enumerate(DRIVERS)])
                for n in range(1, LAPS_FOR["race"] + 1)]
        return {"MRData": {"RaceTable": {"Races": [dict(round=str(rnd), raceName=r[1], Laps=laps)]}}}

    def jolpica_pitstops(self, rnd: int) -> dict:
        r = self._round(rnd)
        if r is None or rnd in self.jolpica_missing_rounds:
            return {"MRData": {"RaceTable": {"Races": []}}}
        stops = [dict(driverId=did, lap="5", stop="1", duration=f"{22.4 + i * 0.1:.3f}")
                 for i, (_n, _c, _f, _l, _t, _col, did) in enumerate(DRIVERS)]
        return {"MRData": {"RaceTable": {"Races": [dict(round=str(rnd), raceName=r[1], PitStops=stops)]}}}

    def jolpica_qualifying(self, rnd: int) -> dict:
        r = self._round(rnd)
        if r is None or rnd in self.jolpica_missing_rounds:
            return {"MRData": {"RaceTable": {"Races": []}}}
        rows = [dict(position=str(i + 1), Driver=dict(driverId=did, code=code, familyName=last),
                     Q1=f"1:3{i % 10}.500", Q2=(f"1:3{i % 10}.300" if i < 15 else None),
                     Q3=(f"1:3{i % 10}.100" if i < 10 else None))
                for i, (_n, code, _f, last, _t, _col, did) in enumerate(DRIVERS)]
        return {"MRData": {"RaceTable": {"Races": [dict(round=str(rnd), raceName=r[1], QualifyingResults=rows)]}}}

    # ----- the router ----------------------------------------------------- #
    def fetch_json(self, url: str, *, params=None, headers=None, timeout=None, ttl=0):
        params = dict(params or {})
        self.calls.append((url, params))
        if url.startswith(OPENF1):
            if self.openf1_down:
                raise requests.ConnectionError("openf1: connection refused")
            path = url[len(OPENF1) + 1:]
            if path == "meetings":
                return [m for m in self.meetings if m["meeting_name"] not in self.openf1_missing_meetings]
            if path == "sessions":
                rows = [s for s in self.sessions if s["meeting_name"] not in self.openf1_missing_meetings]
                for k, v in params.items():
                    if k == "year":
                        continue
                    rows = [s for s in rows if str(s.get(k)) == str(v)]
                return [{k: v for k, v in s.items() if not k.startswith("_")} for s in rows]
            if "session_key" in params:
                return self.openf1_feed(path, int(params["session_key"]))
            return []
        if url.startswith(JOLPICA):
            if self.jolpica_down:
                raise requests.ConnectionError("jolpica: connection refused")
            path = url[len(JOLPICA) + 1:]
            if path == f"{YEAR}.json":
                return self.jolpica_calendar()
            if path == "seasons.json":
                return {"MRData": {"SeasonTable": {"Seasons": [{"season": str(y)} for y in range(2018, YEAR + 1)]}}}
            parts = path.split("/")
            if len(parts) == 3 and parts[0] == str(YEAR):
                rnd, doc = int(parts[1]), parts[2]
                return {"results.json": self.jolpica_results, "laps.json": self.jolpica_laps,
                        "pitstops.json": self.jolpica_pitstops,
                        "qualifying.json": self.jolpica_qualifying}.get(
                    doc, lambda _r: {"MRData": {"RaceTable": {"Races": []}}})(rnd)
            return {"MRData": {"RaceTable": {"Races": []}}}
        raise requests.ConnectionError(f"unexpected upstream {url}")


# --------------------------------------------------------------------------- #
# the fixture: the season above, behind the real app
# --------------------------------------------------------------------------- #
import pytest  # noqa: E402


@pytest.fixture()
def world_2026(monkeypatch, tmp_path):
    """Live mode over the season world, with a fresh cache, the F1 archive
    answering "no such session" (a host that is up and has nothing — its
    `not_available` category), no portrait lookups, and the clock at the end
    of the season so every round has been run and may be asked for."""
    from app import schedule as app_schedule
    from app import upstream
    from app.adapters import data_source_manager as dsm
    from app.adapters import headshots, season_memory
    from app.adapters.pitwall_adapter import FetchError
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "mock_mode", False)
    monkeypatch.setattr(settings, "enable_live_fetch", True)
    monkeypatch.setattr(settings, "cache_dir", tmp_path)
    world = SeasonWorld()
    monkeypatch.setattr(upstream, "fetch_json", world.fetch_json)
    upstream.cache_clear()
    season_memory.forget()
    monkeypatch.setattr(dsm.fastf1, "fetch_session",
                        lambda y, gp, st: (_ for _ in ()).throw(
                            FetchError(f"No '{st}' session found for '{gp}' in {y}.")))
    monkeypatch.setattr(dsm, "_archive_breaker", dsm._Breaker(threshold=2, cooldown=600.0))
    monkeypatch.setattr(headshots, "enrich", lambda session: False)
    monkeypatch.setattr(app_schedule, "now_utc",
                        lambda: datetime(2026, 12, 31, tzinfo=UTC))
    yield world
    upstream.cache_clear()
    season_memory.forget()
