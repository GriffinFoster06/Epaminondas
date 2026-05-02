// ES module Web Worker for AI computation
// Runs minimax off the main thread to keep UI responsive.
import { GameState, WHITE } from './game.js';
import { findBestMove } from './ai.js';

self.onmessage = ({ data }) => {
  try {
    const state = new GameState(
      new Uint8Array(data.boardData),
      data.turn,
      data.moveCount
    );
    const move = findBestMove(state, data.difficulty);
    self.postMessage({ move });
  } catch (err) {
    self.postMessage({ move: null, error: String(err) });
  }
};
