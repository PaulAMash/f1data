# Pitwall IQ — convenience targets. Run `make help` for the list.
.PHONY: help install install-backend install-frontend dev backend backend-dev frontend \
        test test-backend test-frontend build \
        desktop-deps desktop-icons desktop-backend desktop-dev desktop-build-mac

help:
	@echo "Pitwall IQ"
	@echo "  Web / dev"
	@echo "    make install          Install backend + frontend dependencies"
	@echo "    make dev              Run backend (:8000) and frontend (:3000) together"
	@echo "    make backend          Run the FastAPI backend only (:8000)"
	@echo "    make backend-dev      Alias for 'make backend'"
	@echo "    make frontend         Run the Next.js frontend only (:3000)"
	@echo "    make demo             Run the backend in forced demo mode (offline)"
	@echo "    make test             Backend tests + frontend typecheck/build"
	@echo "  Desktop (macOS)"
	@echo "    make desktop-deps     Install Tauri CLI + PyInstaller"
	@echo "    make desktop-dev      Run the desktop app in dev (auto-starts backend)"
	@echo "    make desktop-build-mac  Build the macOS .app + .dmg"
	@echo "    make desktop-icons    Regenerate app icons"

install: install-backend install-frontend

install-backend:
	cd backend && pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

backend:
	cd backend && uvicorn app.main:app --reload --port 8000

demo:
	cd backend && PITWALL_IQ_MOCK_MODE=true uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

# Run both; frontend in the background, backend in the foreground.
dev:
	@echo "Starting backend :8000 and frontend :3000 …"
	cd frontend && npm run dev & \
	cd backend && uvicorn app.main:app --reload --port 8000

backend-dev: backend

test: test-backend test-frontend

test-backend:
	cd backend && python -m pytest

test-frontend:
	cd frontend && npm run typecheck && npm run build

# ---------------------------------------------------------------------------
# Desktop (macOS via Tauri). Prerequisites: Rust (https://rustup.rs), Node,
# Python, and Xcode command line tools. See docs/DESKTOP.md.
# ---------------------------------------------------------------------------
desktop-deps:
	cd frontend && npm install
	pip install pyinstaller
	@echo "✔ Desktop deps installed. Rust toolchain must be installed separately (rustup)."

desktop-icons:
	python3 desktop/scripts/generate_icons.py

# Desktop dev: `tauri dev` launches the app window and (via the Rust shell) runs
# the source backend with your Python — no PyInstaller build needed for dev.
desktop-dev:
	cd frontend && npm run desktop:dev

# Package the backend into a sidecar, then build the macOS .app + .dmg.
desktop-backend:
	./desktop/scripts/build-backend.sh

desktop-build-mac: desktop-backend
	cd frontend && npm run desktop:build
	@echo ""
	@echo "✔ Build complete. Find your app under:"
	@echo "    frontend/src-tauri/target/release/bundle/macos/Pitwall IQ.app"
	@echo "    frontend/src-tauri/target/release/bundle/dmg/Pitwall IQ_*.dmg"
