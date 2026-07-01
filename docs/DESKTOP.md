# Pitwall IQ — Desktop app (macOS via Tauri)

Pitwall IQ ships as a real macOS `.app` using [**Tauri v2**](https://tauri.app).
The desktop shell wraps the existing web UI and **auto-starts the FastAPI backend**
as a local sidecar — you just open the app, no terminal, no browser, no `uvicorn`,
no `npm`.

The web dev workflow is completely unchanged (`make dev` still runs the browser app).

---

## Architecture

```
┌──────────────────────── Pitwall IQ.app ────────────────────────┐
│  Tauri (Rust) shell                                             │
│   • on launch → spawns the backend sidecar on 127.0.0.1:8765    │
│   • waits for GET /health, then reveals the window              │
│   • on quit → stops the sidecar                                 │
│                                                                 │
│  WebView  ── loads the static Next.js export (frontend/out) ──┐ │
│     └─ talks to → http://127.0.0.1:8765  ─────────────────────┘ │
│                                                                 │
│  Sidecar: pitwall-iq-backend  (PyInstaller-packaged FastAPI)    │
└─────────────────────────────────────────────────────────────────┘
```

- **Frontend**: built as a static export (`BUILD_TARGET=desktop npm run build` → `frontend/out`), loaded from disk by the WebView. Same React app as the web version.
- **Backend**: the same FastAPI app, packaged into a single executable by PyInstaller and bundled as a Tauri *sidecar*. The Rust shell launches it and gates the window on `/health`.
- **Port**: the sidecar always listens on **127.0.0.1:8765** (not 8000, so a dev backend can run alongside a packaged app). The frontend's API base is set to match at build time and also auto-detected inside Tauri (`api.ts`).

Key files:

| File | Purpose |
|---|---|
| `frontend/src-tauri/tauri.conf.json` | App name, identifier, window, icons, bundle config |
| `frontend/src-tauri/tauri.bundle.conf.json` | Build-only overlay: adds the sidecar + `.dmg` target |
| `frontend/src-tauri/src/lib.rs` | Launches backend, health-gates the window, cleans up on exit |
| `backend/desktop_server.py` | Sidecar entrypoint (runs uvicorn on a configurable port) |
| `desktop/pitwall-iq-backend.spec` | PyInstaller spec for the backend |
| `desktop/scripts/build-backend.sh` | Builds the sidecar into `src-tauri/binaries/` |
| `desktop/scripts/generate_icons.py` | Generates the app icon set |

---

## Prerequisites (on your Mac)

1. **Xcode command line tools**: `xcode-select --install`
2. **Rust**: `curl https://sh.rustup.rs -sSf | sh` (see <https://rustup.rs>)
3. **Node 18+** and **Python 3.10+** (already needed for the web app)
4. Project deps: `make desktop-deps` (installs the Tauri CLI + PyInstaller)

---

## Desktop dev (fast loop)

```bash
make desktop-dev          # = cd frontend && npm run desktop:dev
```

This runs `tauri dev`, which:
- starts the Next.js dev server (hot reload),
- opens the native app window,
- and the Rust shell runs the **source backend with your system Python** — so you
  do **not** need to build the PyInstaller sidecar for the dev loop.

> Uses `python3` by default. If your backend lives in a virtualenv, either activate
> it before `make desktop-dev`, or set `PITWALL_IQ_PYTHON=/path/to/venv/bin/python`.

---

## Build the macOS app

```bash
make desktop-build-mac
```

This runs two steps:
1. `desktop/scripts/build-backend.sh` — PyInstaller packages the backend into
   `frontend/src-tauri/binaries/pitwall-iq-backend-<target-triple>`.
2. `npm run desktop:build` — Tauri builds the static frontend and bundles everything.

Output:

```
frontend/src-tauri/target/release/bundle/macos/Pitwall IQ.app
frontend/src-tauri/target/release/bundle/dmg/Pitwall IQ_2.0.0_<arch>.dmg
```

Double-click the `.app`, or open the `.dmg` to install. The app opens, starts its
backend automatically, waits for health, then shows the UI.

> **Apple Silicon vs Intel:** the build targets your Mac's native architecture.
> For a universal build, install both Rust targets
> (`rustup target add x86_64-apple-darwin aarch64-apple-darwin`), build the sidecar
> for each, and run `tauri build --target universal-apple-darwin`.

---

## Real data vs demo data in the packaged app

- The **Demo** toggle in the UI works exactly as in the web app.
- **OpenF1** and **Jolpica** real-data sources use only `requests`, so they are
  bundled and work out of the box (2023+ real races, historical results, standings).
- **FastF1** is large and data-heavy, so it is **not bundled by default**. To include
  it (enables FastF1-based fetching for 2018–2022 rich lap data):
  ```bash
  PITWALL_IQ_BUNDLE_FASTF1=1 ./desktop/scripts/build-backend.sh
  ```
  Expect a much larger, slower build.
- The packaged app writes its cache to `~/Library/Application Support/PitwallIQ/cache`.

---

## Signing & notarization

For **local testing** you need nothing — an unsigned `.app` runs on your own Mac
(right-click → Open the first time to bypass Gatekeeper).

For **distribution to other Macs**, Apple requires signing + notarization:

| Level | What you need | Notes |
|---|---|---|
| **Local dev / testing** | Nothing | Unsigned. Gatekeeper warns; right-click → Open once. |
| **Distribute outside the App Store** | Apple Developer Program ($99/yr) + a **Developer ID Application** certificate; then **notarize** with Apple | Required on modern macOS or users get "app is damaged / cannot be opened". |
| **Mac App Store** | Developer Program + **Apple Distribution** certificate + App Store Connect record | Separate provisioning + review process. |

Tauri supports signing/notarization via environment variables at build time:

```bash
# Developer ID signing
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
# Notarization (choose one auth method)
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="app-specific-password"   # from appleid.apple.com
export APPLE_TEAM_ID="TEAMID"

make desktop-build-mac      # Tauri signs + notarizes when these are set
```

See the Tauri macOS distribution guide:
<https://tauri.app/distribute/sign/macos/>. **Bottom line:** to hand the app to
anyone else, you'll eventually need an Apple Developer account and Developer ID
signing + notarization — this is an Apple platform requirement, not a Pitwall IQ one.

---

## Troubleshooting the sidecar

| Symptom | Fix |
|---|---|
| Window opens but shows "Cannot reach the API" | The backend sidecar didn't start or crashed. In dev, run `make backend` manually to see the error; check that Python deps are installed. In a packaged app, launch it from a terminal (`open -a "Pitwall IQ" --stderr /dev/stdout`) or check Console.app for `[pitwall-iq]` logs. |
| Long white screen on first launch | The health gate waits up to 40s for the backend. PyInstaller onefile extracts on first run (slower once). Subsequent launches are fast. |
| `tauri dev` says a sidecar binary is missing | It shouldn't — dev uses your system Python, not the sidecar. If you added `externalBin` to the base config, move it back to `tauri.bundle.conf.json`. |
| Port 8765 already in use | Something else (or a stale sidecar) holds it. `lsof -i :8765` then kill it. |
| Real data doesn't load in the packaged app | Only OpenF1/Jolpica are bundled by default. Rebuild with `PITWALL_IQ_BUNDLE_FASTF1=1` for FastF1, or use the Data tab → Check now to see which sources are reachable. |
| Build fails on icons | Run `make desktop-icons` (regenerates the set), or `cd frontend && npm run desktop:icons` to regenerate from `app-icon.png`. |

---

## Known limitations

- The macOS `.app`/`.dmg` must be built **on macOS** (Apple's toolchain is macOS-only). CI can do this on a macOS runner.
- FastF1 bundling is opt-in and heavy; the default packaged app relies on OpenF1/Jolpica for real data.
- The sidecar is a local process; there is no remote/hosted backend in this desktop build (see `docs/MOBILE_ROADMAP.md` for why iOS needs a hosted API instead).
