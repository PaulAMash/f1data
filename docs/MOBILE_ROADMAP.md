# Pitwall IQ — Mobile roadmap (iOS, then Windows)

The macOS desktop app uses a **local Python backend sidecar**. That model does
**not** carry over to iOS: Apple does not allow bundling and running a Python/uvicorn
process inside an iOS app. So the mobile plan changes one thing — **the backend
becomes a hosted API service** — while everything above it (the normalized data
model, the analysis engine, the UI) is reused.

## Guiding principle

Keep the split we already have:

```
        ┌── same normalized API + analysis engine (FastAPI) ──┐
macOS   → local sidecar backend  (127.0.0.1:8765)
iOS     → hosted backend         (https://api.pitwalliq.app)   ← new for mobile
Windows → local sidecar backend  (127.0.0.1:8765)   (same as macOS)
```

The frontend already resolves its API base at runtime (`frontend/src/lib/api.ts`),
so pointing a mobile build at a hosted URL is a config change, not a rewrite.

## Recommended path for iOS

1. **Host the backend.** Deploy the existing FastAPI app (Docker → Fly.io / Render /
   Railway / a small VM). Add auth/rate-limiting if it's public. This same host can
   later serve a web version and Windows/macOS "online mode".
2. **Pick a shell.** Options, cleanest first:
   - **Tauri v2 mobile (iOS)** — reuses this exact repo and the Rust shell. Still
     maturing for iOS; no local sidecar (point the WebView at the hosted API).
   - **Capacitor** — wrap the static Next.js export in a native iOS shell; very
     stable, large ecosystem, easy App Store path.
   - **Native SwiftUI** — most native feel; reimplements the UI but consumes the
     same JSON API. Most effort.
3. **Point the app at the hosted API** via `NEXT_PUBLIC_API_BASE_URL` at build time.
4. **No Python on device.** All data/analysis stays server-side; the app is a thin
   client. This also keeps any future secrets (F1 TV token, LLM key) off the device.

## App Store checklist (plan ahead)

- **Apple Developer Program** membership ($99/yr).
- **Signing & provisioning**: Apple Distribution certificate + provisioning profile.
- **Privacy**: a Privacy Manifest + App Privacy "nutrition label" (this app collects
  little/none — declare accordingly).
- **Network**: uses standard HTTPS; ensure App Transport Security is satisfied (a
  properly TLS-terminated hosted backend covers this — no localhost/HTTP exceptions).
- **Hosted backend** must be reliably up (App Review will test it).
- **Content**: Formula 1 is a trademark — keep the "not affiliated with F1" notice
  and avoid protected logos/marks.

## Windows (after macOS)

Windows reuses the **same** sidecar model as macOS — Tauri targets Windows, and
PyInstaller produces a `pitwall-iq-backend.exe`. Practical notes:

- `build-backend.sh` already appends `.exe` and the Windows target triple; run it in
  a Windows shell (Git Bash) or port it to PowerShell.
- The `build:desktop` npm script uses POSIX inline env vars; on Windows use
  [`cross-env`](https://www.npmjs.com/package/cross-env) or set the vars in PowerShell.
- Distribution wants an **Authenticode** code-signing certificate (analogous to
  Apple's Developer ID) to avoid SmartScreen warnings.
