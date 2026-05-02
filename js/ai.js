// Minimax with alpha-beta pruning for Epaminondas AI
import {
  WHITE, BLACK, opponent, goalRow,
  GameState, getAllValidMovesAI, applyMove, evaluate
} from './game.js';

const DEPTH_MAP = {
  beginner: 0,
  easy:     1,
  medium:   2,
  hard:     3,
};

const TIME_LIMIT_MS = 5000;

// Score thresholds for terminal positions
const WIN_SCORE  = 100000;
const LOSE_SCORE = -100000;

function isTerminal(state) {
  return state.checkWin() !== null;
}

// Move ordering: captures first (most captures first), then advancement toward goal
function orderMoves(moves, color) {
  const gr = goalRow(color);
  return moves.slice().sort((a, b) => {
    const aCap = a.captured ? a.captured.length : 0;
    const bCap = b.captured ? b.captured.length : 0;
    if (bCap !== aCap) return bCap - aCap;
    // Advancement: prefer moving the head toward goal row
    const aHead = a.to[1];
    const bHead = b.to[1];
    const aDist = Math.abs(aHead - gr);
    const bDist = Math.abs(bHead - gr);
    return aDist - bDist;
  });
}

function minimax(state, depth, alpha, beta, maximizing, rootColor, deadline) {
  if (Date.now() > deadline) return { score: evaluate(state, rootColor), move: null, timeout: true };

  // Check win at the start of this position's turn
  const winner = state.checkWin();
  if (winner !== null) {
    // Winner is state.turn (already checked at turn start)
    // If the winner is rootColor, that's great for us (but this state was reached AFTER opponent moved,
    // meaning rootColor just started their turn and wins immediately)
    const score = winner === rootColor
      ? WIN_SCORE  + depth
      : LOSE_SCORE - depth;
    return { score, move: null, timeout: false };
  }

  if (depth === 0) {
    return { score: evaluate(state, rootColor), move: null, timeout: false };
  }

  const moves = getAllValidMovesAI(state);
  if (moves.length === 0) {
    return { score: evaluate(state, rootColor), move: null, timeout: false };
  }

  const ordered = orderMoves(moves, state.turn);
  let bestMove  = ordered[0];
  let timedOut  = false;

  if (maximizing) {
    let best = -Infinity;
    for (const move of ordered) {
      const next   = applyMove(state, move);
      const result = minimax(next, depth - 1, alpha, beta, false, rootColor, deadline);
      if (result.timeout) { timedOut = true; break; }
      if (result.score > best) { best = result.score; bestMove = move; }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return { score: best, move: bestMove, timeout: timedOut };
  } else {
    let best = Infinity;
    for (const move of ordered) {
      const next   = applyMove(state, move);
      const result = minimax(next, depth - 1, alpha, beta, true, rootColor, deadline);
      if (result.timeout) { timedOut = true; break; }
      if (result.score < best) { best = result.score; bestMove = move; }
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return { score: best, move: bestMove, timeout: timedOut };
  }
}

// Public: find best move for current player at given difficulty
export function findBestMove(state, difficulty) {
  const depth = DEPTH_MAP[difficulty] ?? 1;
  const color = state.turn;

  const moves = getAllValidMovesAI(state);
  if (moves.length === 0) return null;

  // Beginner: random
  if (depth === 0) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const deadline  = Date.now() + TIME_LIMIT_MS;
  let bestMove    = moves[0];
  let bestScore   = -Infinity;

  // Iterative deepening up to target depth
  for (let d = 1; d <= depth; d++) {
    const ordered = orderMoves(moves, color);
    let currentBest = moves[0];
    let currentScore = -Infinity;
    let timedOut = false;

    for (const move of ordered) {
      if (Date.now() > deadline) { timedOut = true; break; }
      const next   = applyMove(state, move);
      const result = minimax(next, d - 1, -Infinity, Infinity, false, color, deadline);
      if (result.timeout) { timedOut = true; break; }
      if (result.score > currentScore) {
        currentScore = result.score;
        currentBest  = move;
      }
    }

    if (!timedOut) {
      bestMove  = currentBest;
      bestScore = currentScore;
    } else {
      // Use best from previous depth
      break;
    }
  }

  return bestMove;
}
