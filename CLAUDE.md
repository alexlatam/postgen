# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repo contains two separate LinkedIn publishing interfaces that share the same LinkedIn API logic:

1. **MCP server** (`src/index.ts` → `dist/index.js`) — stdio-transport MCP server registered in `.claude/mcp.json`, used by AI assistants directly.
2. **Web UI server** (`server.js`) — Express HTTP server serving `linkedin-poster.html` as a browser-based post editor at `http://localhost:3001`.

## Commands

```bash
# Build MCP server (TypeScript → dist/)
npx tsc

# Run MCP server (after build)
node dist/index.js

# Run web UI server
node server.js
```

The MCP server (`dist/index.js`) reads env vars from `.claude/mcp.json` at runtime. The web UI server (`server.js`) reads from a `.env` file via `dotenv`.

## Required Environment Variables

- `LINKEDIN_ACCESS_TOKEN` — OAuth 2.0 bearer token
- `LINKEDIN_PERSON_ID` — LinkedIn URN person ID (e.g. `ijeW4LnBkH`), used as `urn:li:person:<id>` in post author

## Architecture

**MCP server** (`src/index.ts`): Registers `tools/list` and `tools/call` handlers. Each tool needs a descriptor in `ListToolsRequestSchema` handler and a branch in `CallToolRequestSchema` handler. Currently exposes one tool: `create_post` → `POST /v2/ugcPosts` with `PUBLIC` visibility.

**Web UI server** (`server.js`): Plain Node.js/Express. Serves the static HTML and exposes `POST /publish` which proxies to the same LinkedIn API endpoint. No build step needed.

Both servers post to `https://api.linkedin.com/v2/ugcPosts` with the same UGC payload shape.

## TypeScript Config

`tsconfig.json` targets ES2020 with `NodeNext` module resolution. Source in `src/`, output in `dist/`. The `package.json` has `"type": "module"` so all JS files are ESM.
