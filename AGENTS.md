# Kahoot Clone - Agent Instructions

## Architecture

- **server/** — Node.js + `ws` WebSocket server (CommonJS, `require`/`module.exports`). In-memory game state only.
- **client/host/** — React 19 app (ESM, Vite, port 5173). Quiz creation + host view.
- **client/player/** — React 19 app (ESM, Vite, port 5174). Mobile-optimized player view.
- **Root package.json** uses `concurrently` to run all three in parallel via `npm run dev`.

## Developer Commands

```bash
# Full stack (all three at once)
npm run dev

# Individual
npm run server          # Node server on :3001
npm run client:host    # Host app on :5173
npm run client:player  # Player app on :5174

# Per-client lint/build
cd client/host && npm run lint
cd client/player && npm run lint
cd client/host && npm run build
cd client/player && npm run build
```

## Key Conventions

- **Server**: CommonJS (`require`/`module.exports`). Never add `type: "module"` or ESM imports here — `ws` is used as CJS.
- **Clients**: ESM (`"type": "module"` in package.json). React files are `.jsx`.
- **WebSocket URL**: Both clients connect directly to `ws://localhost:3001`. The Vite proxy config (`/ws` → `ws://localhost:3001`) exists but clients use the direct URL in `new WebSocket()`.
- **messageHandler.js:216**: Uses `module.exports` (CommonJS). The export is `module.exports = { handleMessage }`. All callers use `.handleMessage` - it works as a property access.
- **No tests exist** in this repo.

## Server Ports

- Server: `http://localhost:3001` (HTTP + WebSocket on same port)
- Host client: `http://localhost:5173`
- Player client: `http://localhost:5174`

## WebSocket Protocol

Messages are JSON strings: `{ "type": "EVENT_NAME", "payload": { ... } }`.

Server → Host includes `correctAnswer` in `NEW_QUESTION`. Server → Players does NOT include `correctAnswer`.

## Project Language

Spanish (README, code comments, variable names, WebSocket event types).