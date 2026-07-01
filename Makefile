# Pitwall IQ — convenience targets. Run `make help` for the list.
.PHONY: help install install-backend install-frontend dev backend frontend test test-backend test-frontend build

help:
	@echo "Pitwall IQ"
	@echo "  make install        Install backend + frontend dependencies"
	@echo "  make dev            Run backend (:8000) and frontend (:3000) together"
	@echo "  make backend        Run the FastAPI backend only"
	@echo "  make frontend       Run the Next.js frontend only"
	@echo "  make test           Run backend tests + frontend typecheck/build"
	@echo "  make demo           Run the backend in forced demo mode (offline)"

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

test: test-backend test-frontend

test-backend:
	cd backend && python -m pytest

test-frontend:
	cd frontend && npm run typecheck && npm run build
