# Pitwall IQ — convenience targets for the web app. Run `make help` for the list.
.PHONY: help install install-backend install-frontend dev backend frontend \
        demo test test-backend test-frontend

help:
	@echo "Pitwall IQ (website)"
	@echo "  make install        Install backend + frontend dependencies"
	@echo "  make dev            Run backend (:8000) and frontend (:3000) together"
	@echo "  make backend        Run the FastAPI backend only (:8000)"
	@echo "  make frontend       Run the Next.js frontend only (:3000)"
	@echo "  make demo           Run the backend in explicit demo mode (offline sample data)"
	@echo "  make test           Backend tests + frontend typecheck/build"

install: install-backend install-frontend

install-backend:
	cd backend && pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

backend:
	cd backend && uvicorn app.main:app --reload --port 8000

# Explicit, developer-only demo mode (clearly-labelled sample data). Not a normal
# user path — the website uses real data by default.
demo:
	cd backend && PITWALL_IQ_MOCK_MODE=true uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

# Run both; frontend in the background, backend in the foreground.
dev:
	@echo "Starting backend :8000 and frontend :3000 …"
	cd frontend && npm run dev & \
	cd backend && uvicorn app.main:app --reload --port 8000

test: test-backend test-frontend

test-backend:
	cd backend && python -m pytest

test-frontend:
	cd frontend && npm run typecheck && npm run build
