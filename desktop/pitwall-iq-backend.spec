# PyInstaller spec — packages the FastAPI backend into a single macOS/Windows
# executable that Tauri bundles as a sidecar.
#
# Run from the repo root:  pyinstaller desktop/pitwall-iq-backend.spec
#
# By default this bundles the lightweight real-data sources (OpenF1 + Jolpica,
# which only need `requests`) so the packaged app can still fetch real F1 data.
# FastF1 / f1pitwall are large and data-heavy; set PITWALL_IQ_BUNDLE_FASTF1=1 to
# attempt including them (bigger, slower build — see docs/DESKTOP.md).
import os

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []

# our application package
hiddenimports += collect_submodules("app")

# web stack + http clients that PyInstaller can miss
for pkg in (
    "fastapi", "starlette", "pydantic", "pydantic_core", "pydantic_settings",
    "anyio", "sniffio", "click", "h11", "certifi", "requests", "urllib3",
    "idna", "charset_normalizer", "uvicorn",
):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:  # noqa: BLE001 — optional deps just get skipped
        pass

# uvicorn resolves these lazily; name them explicitly for a frozen build
hiddenimports += [
    "uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto",
    "uvicorn.protocols", "uvicorn.protocols.http", "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets", "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan", "uvicorn.lifespan.on", "uvicorn.lifespan.off",
]

# optional heavy stack for FastF1-based fetching
if os.environ.get("PITWALL_IQ_BUNDLE_FASTF1") == "1":
    for pkg in ("fastf1", "f1pitwall", "pandas", "numpy"):
        try:
            d, b, h = collect_all(pkg)
            datas += d
            binaries += b
            hiddenimports += h
        except Exception:  # noqa: BLE001
            pass

block_cipher = None

a = Analysis(
    ["backend/desktop_server.py"],
    pathex=["backend"],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="pitwall-iq-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=True,          # keep a console/log stream; Tauri hides it
    disable_windowed_traceback=False,
    target_arch=None,      # native arch; use ARCHFLAGS / --target-arch for universal2
    codesign_identity=None,
    entitlements_file=None,
)
