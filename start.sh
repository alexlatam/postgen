#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

[[ -f .env ]] || { echo "❌ Missing .env — copy .env.example and fill in the values"; exit 1; }
[[ -d node_modules ]] || npm install

echo "🔨 Building TypeScript..."
npx tsc

echo ""
echo "→ http://localhost:3001/linkedin-poster.html"
echo ""
node server.js
