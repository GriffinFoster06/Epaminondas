# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

```
python start.py
```

Opens the browser automatically at `localhost:8080`. No npm, no pip installs — Python stdlib only.

Quick tests (run from project root):
```bash
# Python syntax
python -c "import ast; ast.parse(open('start.py', encoding='utf-8').read()); print('OK')"

# JS game logic
node --input-type=module --eval "import('./js/game.js').then(m => { console.log(m.getAllValidMovesAI(m.GameState.initial()).length, 'moves'); })"
```

## Architecture

**`start.py`** — Single-file Python HTTP server (stdlib only). Handles static files, game relay API (`/room`, `/join`, `/move`, `/event`, `/events` SSE), SSH tunnel (localhost.run → serveo.net fallback). In-memory room state with `rooms` dict and `rooms_lock`.

**`js/game.js`** — Pure rules engine. Key exports:
- `GameState` — board (`Uint8Array`), `turn`, `moveCount`; `GameState.initial()` for start position
- `getValidMovesForPiece(state, c, r)` — all moves from ALL sub-phalanxes through that piece (for player UI)
- `getAllValidMovesAI(state)` — maximal phalanxes only (fast path for AI, manageable branching factor)
- `applyMove(state, move)` → new `GameState` (immutable)
- `checkWin()` instance method — called on new state after `applyMove`
- `evaluate(state, forColor)` — positional score for AI (back-row ±1000, near-back ±200, advancement ±8, pieces ±25)
- `cellNotation(c, r)` → `"A1"` (row 1 = bottom/White home, row 12 = top/Black home)
- `moveNotation(move)` → `"G7→G5 [3] ×2"`

**`js/renderer.js`** — Canvas rendering with continuous `requestAnimationFrame` loop. `Renderer` class:
- `draw(state, sel)` — draws board; `sel` = `{selected, phalanx, validMoves, highlights}`
- `animateMove(state, move, callback)` — slide animation, triggers loop
- `spawnCapture(positions, color)` — burst particles at given cell positions
- `setLastMove(move)` — sets amber last-move highlight
- Loop only runs when particles active or valid-move dots need pulsing; idles otherwise

**`js/sound.js`** — `SoundEngine` class with Web Audio API synth sounds. Exported singleton `sound`. Methods: `select`, `move`, `capture`, `win`, `lose`, `invalid`. Toggle with `sound.enabled`.

**`js/ai.js`** — `findBestMove(state, difficulty)`. Difficulties: `beginner` (random), `easy` (depth 1), `medium` (depth 2), `hard` (depth 3). Alpha-beta minimax, capture-first move ordering, 5s deadline.

**`js/ai-worker.js`** — ES module Web Worker. Posts `{boardData, turn, moveCount, difficulty}`, receives `{move}`. Spawned once per game session, reused.

**`js/ui.js`** — Orchestrates everything. Owns two `Renderer` instances (`renderer` for game, `tutRenderer` for tutorial). Key state: `mode` (`'local'|'host'|'guest'|'ai'`), `myColor`, `aiColor`, `aiDifficulty`, `stateHistory[]` (for undo), `moveHistory[]` (for display). `onBoardClick(e, isTut)` is the single board interaction entry point.

**`js/network.js`** — `Network` class: SSE (`EventSource`) + `fetch` POST. `createRoom()` / `joinRoom(id)` → `sendMove(move)` / `sendEvent(event, data)`.

**`js/tutorial.js`** — Pure data: `TUTORIAL_STEPS[10]`. Each step has `boardFactory()`, `highlights`, `interactive`, `freePlay`, `allowedColor`.

## Key invariants

- **Board coordinates**: col `c` ∈ [0,13], row `r` ∈ [0,11]. Row 0 = top (Black's home). Row 11 = bottom (White's home). White moves first.
- **Goal rows**: `goalRow(WHITE) = 0`, `goalRow(BLACK) = 11`. Win check: `state.checkWin()` on the NEW state after `applyMove`.
- **Sub-phalanxes**: `getValidMovesForPiece` returns moves from all sub-phalanxes; `getAllValidMovesAI` returns only maximal. The AI uses maximal-only to keep branching manageable (~188 initial moves vs. much more with sub-phalanxes).
- **phalanx ordering**: pieces sorted in `[dc, dr]` axis direction. Moving in `[dc,dr]` → head is `pieces[last]`; moving in `[-dc,-dr]` → head is `pieces[0]`. `applyMove` shifts every piece by `dc*dist, dr*dist`.
- **Immutable state**: `applyMove` always returns a new `GameState`; never mutates.
- **Animation**: phalanx moves animate; single-piece moves do not (immediate state update + redraw).

## Online multiplayer flow

Host: `python start.py` → SSH tunnel URL printed → "Host Game" → room code in URL (`?join=ROOMID`) → share link. Guest opens link → `startGuest(roomId)` auto-called → both subscribe to `/events` SSE → moves via `POST /move`. Host = White, Guest = Black.
