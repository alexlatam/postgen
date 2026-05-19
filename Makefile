.PHONY: up build install clean dev

up: install build
	@echo ""
	@echo "→ http://localhost:3001/linkedin-poster.html"
	@echo ""
	node server.js

build:
	@echo "🔨 Building TypeScript..."
	npx tsc

install:
	@[[ -f .env ]] || { echo "❌ Missing .env — copy .env.example and fill in the values"; exit 1; }
	@[[ -d node_modules ]] || npm install

clean:
	rm -rf dist

dev:
	npx tsc --watch &
	node server.js
