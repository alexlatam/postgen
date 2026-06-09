.PHONY: up down reset logs build clean dev

# Start everything (build if needed)
up:
	@[ -f .env ] || { echo "❌ Missing .env — copy .env.example and fill in values"; exit 1; }
	docker compose up --build -d
	@echo ""
	@echo "→ http://localhost:3001/linkedin-poster.html"
	@echo "→ http://localhost:3001/book-rag.html"
	@echo ""

# Stop all containers
down:
	docker compose down

# Wipe DB + volumes, rebuild from scratch
reset:
	docker compose down -v
	docker compose up --build -d
	@echo ""
	@echo "✅ Reset complete — database wiped and rebuilt"
	@echo ""

# Follow app logs
logs:
	docker compose logs -f app

# Follow all logs
logs-all:
	docker compose logs -f

# Rebuild images without starting
build:
	docker compose build

# Remove containers, volumes, and local images
clean:
	docker compose down -v --rmi local
	rm -rf dist

# Local dev (no docker, requires local postgres)
dev:
	npx tsc --watch & node server.js
