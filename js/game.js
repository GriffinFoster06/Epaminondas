// Epaminondas core game logic
// Board: 14 cols (0-13) x 12 rows (0-11)
// White starts rows 10-11 (bottom), Black rows 0-1 (top)
// White moves first.
// Win condition: at start of YOUR turn, you have MORE pieces on opponent's back row
//   than opponent has on YOUR back row.
// goalRow(color): the row that color is trying to reach (opponent's back row)
//   White → row 0 (top), Black → row 11 (bottom)

export const COLS = 14;
export const ROWS = 12;
export const EMPTY = 0;
export const WHITE = 1;
export const BLACK = 2;

// 8 directions: [dc, dr]
export const DIRS = [
  [1,0],[-1,0],[0,1],[0,-1],
  [1,1],[1,-1],[-1,1],[-1,-1]
];

export function opponent(color) {
  return color === WHITE ? BLACK : WHITE;
}

export function inBounds(c, r) {
  return c >= 0 && c < COLS && r >= 0 && r < ROWS;
}

// The row this color is trying to REACH (opponent's home)
export function goalRow(color) {
  return color === WHITE ? 0 : ROWS - 1;
}

// Kept for backward compatibility
export function opponentBackRow(color) {
  return goalRow(color);
}

export function homeRows(color) {
  return color === WHITE ? [ROWS - 2, ROWS - 1] : [0, 1];
}

// "A1" notation: col A–N, row 1 = bottom (row index 11), row 12 = top (row index 0)
export function cellNotation(c, r) {
  const col = 'ABCDEFGHIJKLMN'[c];
  const row = ROWS - r; // row 0 → "12", row 11 → "1"
  return col + row;
}

// Move notation: e.g. "G7→G5 [3] ×2"
// move: { phalanx, dc, dr, dist, captured, type, from, to }
export function moveNotation(move) {
  const fromCell = cellNotation(move.from[0], move.from[1]);
  const toCell   = cellNotation(move.to[0],   move.to[1]);
  const len      = move.phalanx ? move.phalanx.length : 1;
  const capCount = move.captured ? move.captured.length : 0;
  let s = `${fromCell}→${toCell}`;
  if (len > 1) s += ` [${len}]`;
  if (capCount > 0) s += ` ×${capCount}`;
  return s;
}

export class GameState {
  constructor(board, turn, moveCount) {
    this.board    = board     || new Uint8Array(COLS * ROWS);
    this.turn     = turn      !== undefined ? turn : WHITE;
    this.moveCount= moveCount !== undefined ? moveCount : 0;
  }

  idx(c, r) { return r * COLS + c; }

  get(c, r) { return this.board[this.idx(c, r)]; }

  clone() {
    return new GameState(new Uint8Array(this.board), this.turn, this.moveCount);
  }

  static initial() {
    const gs = new GameState();
    for (let c = 0; c < COLS; c++) {
      gs.board[gs.idx(c, 0)]  = BLACK;
      gs.board[gs.idx(c, 1)]  = BLACK;
      gs.board[gs.idx(c, 10)] = WHITE;
      gs.board[gs.idx(c, 11)] = WHITE;
    }
    return gs;
  }

  countOnRow(color, row) {
    let n = 0;
    for (let c = 0; c < COLS; c++) {
      if (this.get(c, row) === color) n++;
    }
    return n;
  }

  // Count ALL pieces of `color` on the board
  countAll(color) {
    let n = 0;
    for (let i = 0; i < this.board.length; i++) {
      if (this.board[i] === color) n++;
    }
    return n;
  }

  // Check win at start of `this.turn`'s turn
  checkWin() {
    const color  = this.turn;
    const opp    = opponent(color);
    const myGoal    = goalRow(color);   // row I'm trying to fill
    const theirGoal = goalRow(opp);     // row they're trying to fill

    const myCount    = this.countOnRow(color, myGoal);
    const theirCount = this.countOnRow(opp, theirGoal);

    if (myCount > theirCount) return color;
    return null;
  }
}

// Get all consecutive same-color pieces starting at (c,r) going in (dc,dr)
function getPhalanxInDir(state, c, r, dc, dr) {
  const color = state.get(c, r);
  if (!color) return [];
  const pieces = [[c, r]];
  let nc = c + dc, nr = r + dr;
  while (inBounds(nc, nr) && state.get(nc, nr) === color) {
    pieces.push([nc, nr]);
    nc += dc; nr += dr;
  }
  return pieces;
}

// Find ALL sub-phalanxes of length >= 2 through (c, r) along each axis.
// Returns array of {pieces, dc, dr} ordered in the [dc,dr] direction.
export function getPhalanxesThrough(state, c, r) {
  const color = state.get(c, r);
  if (!color) return [];

  const result = [];
  const axes = [[1,0],[0,1],[1,1],[1,-1]];

  for (const [dc, dr] of axes) {
    // Walk to the start of the full contiguous run
    let sc = c, sr = r;
    while (inBounds(sc - dc, sr - dr) && state.get(sc - dc, sr - dr) === color) {
      sc -= dc; sr -= dr;
    }
    // Collect full run
    const fullRun = [];
    let nc = sc, nr = sr;
    while (inBounds(nc, nr) && state.get(nc, nr) === color) {
      fullRun.push([nc, nr]);
      nc += dc; nr += dr;
    }
    if (fullRun.length < 2) continue;

    // Find index of (c, r) in fullRun
    const idx = fullRun.findIndex(([fc, fr]) => fc === c && fr === r);
    if (idx < 0) continue;

    // All sub-runs of length >= 2 that include index idx
    for (let start = 0; start <= idx; start++) {
      for (let end = idx; end < fullRun.length; end++) {
        if (end - start + 1 >= 2) {
          result.push({
            pieces: fullRun.slice(start, end + 1),
            dc, dr
          });
        }
      }
    }
  }

  return result;
}

// Single-piece moves (1 square any direction, to empty cell)
function getSinglePieceMoves(state, c, r) {
  const moves = [];
  for (const [dc, dr] of DIRS) {
    const nc = c + dc, nr = r + dr;
    if (inBounds(nc, nr) && state.get(nc, nr) === EMPTY) {
      moves.push({
        type: 'single',
        from: [c, r],
        to:   [nc, nr],
        phalanx: [[c, r]],
        dc: 0, dr: 0, dist: 0,
        captured: []
      });
    }
  }
  return moves;
}

// Valid moves for a given phalanx (ordered in [dc,dr]) in both axis directions
function getPhalanxMoves(state, phalanx, dc, dr) {
  const moves = [];
  const n     = phalanx.length;
  const color = state.get(phalanx[0][0], phalanx[0][1]);
  const opp   = opponent(color);

  for (const [moveDc, moveDr] of [[dc, dr], [-dc, -dr]]) {
    const [headC, headR] = (moveDc === dc && moveDr === dr)
      ? phalanx[phalanx.length - 1]
      : phalanx[0];

    for (let dist = 1; dist <= n; dist++) {
      const newHeadC = headC + moveDc * dist;
      const newHeadR = headR + moveDr * dist;
      if (!inBounds(newHeadC, newHeadR)) break;

      const cell = state.get(newHeadC, newHeadR);

      if (cell === color) break; // blocked by own piece

      if (cell === EMPTY) {
        moves.push({
          type: 'phalanx',
          from: phalanx[0],
          to:   [newHeadC, newHeadR],
          phalanx: [...phalanx],
          dc: moveDc, dr: moveDr, dist,
          captured: []
        });
      } else if (cell === opp) {
        // Count consecutive enemy pieces
        let enemyCount = 0;
        let ec = newHeadC, er = newHeadR;
        while (inBounds(ec, er) && state.get(ec, er) === opp) {
          enemyCount++;
          ec += moveDc; er += moveDr;
        }
        if (enemyCount < n) {
          const captured = [];
          let cc = newHeadC, cr = newHeadR;
          for (let i = 0; i < enemyCount; i++) {
            captured.push([cc, cr]);
            cc += moveDc; cr += moveDr;
          }
          moves.push({
            type: 'phalanx',
            from: phalanx[0],
            to:   [newHeadC, newHeadR],
            phalanx: [...phalanx],
            dc: moveDc, dr: moveDr, dist,
            captured
          });
        }
        break;
      }
    }
  }
  return moves;
}

// All valid moves for the piece at (c, r) — uses ALL sub-phalanxes
export function getValidMovesForPiece(state, c, r) {
  const color = state.get(c, r);
  if (!color || color !== state.turn) return [];

  const moves = getSinglePieceMoves(state, c, r);
  const phalanxes = getPhalanxesThrough(state, c, r);
  for (const { pieces, dc, dr } of phalanxes) {
    moves.push(...getPhalanxMoves(state, pieces, dc, dr));
  }
  return moves;
}

// All valid moves for the current player — uses ALL sub-phalanxes
export function getAllValidMoves(state) {
  const moves = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.get(c, r) === state.turn) {
        moves.push(...getValidMovesForPiece(state, c, r));
      }
    }
  }
  return moves;
}

// ── AI variant: only MAXIMAL phalanxes (faster, manageable branching) ──────────

function getMaximalPhalanxesThrough(state, c, r) {
  const color = state.get(c, r);
  if (!color) return [];

  const result = [];
  const axes = [[1,0],[0,1],[1,1],[1,-1]];

  for (const [dc, dr] of axes) {
    let sc = c, sr = r;
    while (inBounds(sc - dc, sr - dr) && state.get(sc - dc, sr - dr) === color) {
      sc -= dc; sr -= dr;
    }
    const pieces = [];
    let nc = sc, nr = sr;
    while (inBounds(nc, nr) && state.get(nc, nr) === color) {
      pieces.push([nc, nr]);
      nc += dc; nr += dr;
    }
    if (pieces.length >= 2 && pieces.some(([pc, pr]) => pc === c && pr === r)) {
      result.push({ pieces, dc, dr });
    }
  }
  return result;
}

function getValidMovesForPieceAI(state, c, r) {
  const color = state.get(c, r);
  if (!color || color !== state.turn) return [];

  const moves = getSinglePieceMoves(state, c, r);
  const phalanxes = getMaximalPhalanxesThrough(state, c, r);
  for (const { pieces, dc, dr } of phalanxes) {
    moves.push(...getPhalanxMoves(state, pieces, dc, dr));
  }
  return moves;
}

export function getAllValidMovesAI(state) {
  const moves = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.get(c, r) === state.turn) {
        moves.push(...getValidMovesForPieceAI(state, c, r));
      }
    }
  }
  return moves;
}

// Apply a move and return a new GameState
export function applyMove(state, move) {
  const next  = state.clone();
  const color = state.turn;
  const { phalanx, dc, dr, dist, captured } = move;

  if (move.type === 'single') {
    const [fc, fr] = move.from;
    const [tc, tr] = move.to;
    next.board[next.idx(fc, fr)] = EMPTY;
    next.board[next.idx(tc, tr)] = color;
  } else {
    // Clear phalanx positions
    for (const [pc, pr] of phalanx) {
      next.board[next.idx(pc, pr)] = EMPTY;
    }
    // Remove captured pieces
    for (const [cc, cr] of captured) {
      next.board[next.idx(cc, cr)] = EMPTY;
    }
    // Place phalanx at new positions
    for (const [pc, pr] of phalanx) {
      next.board[next.idx(pc + dc * dist, pr + dr * dist)] = color;
    }
  }

  next.turn = opponent(color);
  next.moveCount++;
  return next;
}

export function deduplicateMoves(moves) {
  const seen = new Set();
  return moves.filter(m => {
    const key = JSON.stringify({ to: m.to, phalanx: m.phalanx });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Static evaluation for AI.  Positive = good for `forColor`.
export function evaluate(state, forColor) {
  const opp = opponent(forColor);

  // Back-row control (most important)
  const myGoal    = goalRow(forColor);
  const theirGoal = goalRow(opp);
  const myOnGoal    = state.countOnRow(forColor, myGoal);
  const theirOnGoal = state.countOnRow(opp, theirGoal);
  const backRowScore = (myOnGoal - theirOnGoal) * 1000;

  // Near-back-row (1 row away from goal)
  const myNearGoal    = myGoal === 0 ? 1 : ROWS - 2;
  const theirNearGoal = theirGoal === 0 ? 1 : ROWS - 2;
  const myNear    = state.countOnRow(forColor, myNearGoal);
  const theirNear = state.countOnRow(opp, theirNearGoal);
  const nearScore = (myNear - theirNear) * 200;

  // Advancement toward goal
  let advanceScore = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = state.get(c, r);
      if (piece === forColor) {
        // distance covered toward goal
        const dist = forColor === WHITE ? (ROWS - 1 - r) : r;
        advanceScore += dist * 8;
      } else if (piece === opp) {
        const dist = opp === WHITE ? (ROWS - 1 - r) : r;
        advanceScore -= dist * 8;
      }
    }
  }

  // Piece count
  const myCount    = state.countAll(forColor);
  const theirCount = state.countAll(opp);
  const pieceScore = (myCount - theirCount) * 25;

  return backRowScore + nearScore + advanceScore + pieceScore;
}
