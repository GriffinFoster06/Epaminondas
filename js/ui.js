// UI controller — screens, interaction, game orchestration, AI, history, undo
import {
  COLS, ROWS, EMPTY, WHITE, BLACK,
  GameState, getValidMovesForPiece, getAllValidMoves, applyMove,
  opponent, goalRow, getPhalanxesThrough, deduplicateMoves,
  cellNotation, moveNotation
} from './game.js';
import { Renderer } from './renderer.js';
import { Network }  from './network.js';
import { TUTORIAL_STEPS } from './tutorial.js';
import { sound }    from './sound.js';

// ── Screen IDs ────────────────────────────────────────────────────────────────
const SCREEN_IDS = [
  'screen-menu', 'screen-lobby', 'screen-game', 'screen-gameover', 'screen-tutorial'
];

function showScreen(id) {
  SCREEN_IDS.forEach(s =>
    document.getElementById(s).classList.toggle('active', s === id)
  );
  if (id === 'screen-game' && renderer) {
    renderer.resize();
    redraw();
  }
  if (id === 'screen-tutorial' && tutRenderer) {
    tutRenderer.resize();
    tutRedraw();
  }
}

// ── Renderers ─────────────────────────────────────────────────────────────────
let renderer    = null;
let tutRenderer = null;

// ── Game state ────────────────────────────────────────────────────────────────
let gameState    = null;
let mode         = null;        // 'local' | 'host' | 'guest' | 'ai'
let myColor      = null;        // WHITE | BLACK | null (local/ai-both)
let aiColor      = null;        // which color the AI plays
let aiDifficulty = 'medium';
let net          = null;
let onlineSupported = true;

// History / undo
let stateHistory = [];          // array of GameState snapshots (before each move)
let moveHistory  = [];          // array of {notation, captures, moveNum}

// Selection
let selCell  = null;
let selMoves = null;

// AI worker
let aiWorker = null;
let aiThinking = false;

// Tutorial
let tutStep  = 0;
let tutState = null;

// ── Init ──────────────────────────────────────────────────────────────────────
export function init() {
  renderer    = new Renderer(document.getElementById('board-canvas'));
  tutRenderer = new Renderer(document.getElementById('tut-canvas'));

  window.addEventListener('resize', () => {
    renderer.resize();
    tutRenderer.resize();
    redraw();
    tutRedraw();
  });
  renderer.resize();
  tutRenderer.resize();

  // Board clicks
  document.getElementById('board-canvas').addEventListener('click', e => onBoardClick(e, false));
  document.getElementById('tut-canvas')  .addEventListener('click', e => onBoardClick(e, true));

  // Menu buttons
  document.getElementById('btn-local')   .addEventListener('click', startLocal);
  document.getElementById('btn-vs-cpu')  .addEventListener('click', toggleAiSetup);
  document.getElementById('btn-host')    .addEventListener('click', startHost);
  document.getElementById('btn-join')    .addEventListener('click', () => {
    if (!onlineSupported) {
      showOnlineDisabled();
      return;
    }
    document.getElementById('join-panel').classList.remove('hidden');
  });
  document.getElementById('btn-join-confirm').addEventListener('click', () => {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (code) startGuest(code);
  });
  document.getElementById('btn-tutorial').addEventListener('click', startTutorial);

  // AI setup difficulty buttons
  document.querySelectorAll('.ai-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      aiDifficulty = btn.dataset.diff;
    });
  });
  document.getElementById('btn-ai-start-white').addEventListener('click', () => startAI(WHITE));
  document.getElementById('btn-ai-start-black').addEventListener('click', () => startAI(BLACK));

  // Lobby
  document.getElementById('btn-copy-link')   .addEventListener('click', onCopyLink);
  document.getElementById('btn-lobby-cancel').addEventListener('click', goMenu);

  // Game header
  document.getElementById('btn-resign')      .addEventListener('click', onResign);
  document.getElementById('btn-rematch')     .addEventListener('click', onRematch);
  document.getElementById('btn-menu')        .addEventListener('click', goMenu);
  document.getElementById('btn-rules-toggle').addEventListener('click', () =>
    document.getElementById('rules-panel').classList.toggle('open')
  );
  document.getElementById('btn-settings-toggle').addEventListener('click', () =>
    document.getElementById('settings-panel').classList.toggle('open')
  );
  document.getElementById('btn-undo')        .addEventListener('click', onUndo);

  // Settings panel
  document.getElementById('settings-sound-toggle').addEventListener('change', e => {
    sound.enabled = e.target.checked;
  });
  document.querySelectorAll('.settings-diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.settings-diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      aiDifficulty = btn.dataset.diff;
    });
  });

  // Game over
  document.getElementById('btn-gameover-rematch').addEventListener('click', onRematch);
  document.getElementById('btn-gameover-menu')   .addEventListener('click', goMenu);

  // Tutorial
  document.getElementById('btn-tut-prev') .addEventListener('click', () => tutNav(-1));
  document.getElementById('btn-tut-next') .addEventListener('click', () => tutNav(1));
  document.getElementById('btn-tut-reset').addEventListener('click', tutReset);
  document.getElementById('btn-tut-close').addEventListener('click', closeTutorial);
  document.getElementById('btn-tut-rules-toggle').addEventListener('click', () =>
    document.getElementById('tut-rules-panel').classList.toggle('open')
  );

  // Auto-join from URL
  updateOnlineAvailability();

  const params   = new URLSearchParams(window.location.search);
  const joinRoom = params.get('join');
  if (joinRoom) {
    if (onlineSupported) {
      document.getElementById('join-code-input').value = joinRoom;
      startGuest(joinRoom.toUpperCase());
    } else {
      showOnlineDisabled();
    }
  }
}

function detectOnlineSupport() {
  if (window.location.protocol === 'file:') return false;
  const host = window.location.hostname || '';
  return !host.endsWith('github.io');
}

function updateOnlineAvailability() {
  onlineSupported = detectOnlineSupport();
  const hostBtn = document.getElementById('btn-host');
  const joinBtn = document.getElementById('btn-join');
  const note   = document.getElementById('online-disabled-note');

  if (hostBtn) hostBtn.disabled = !onlineSupported;
  if (joinBtn) joinBtn.disabled = !onlineSupported;
  if (note) note.classList.toggle('hidden', onlineSupported);

  if (!onlineSupported) {
    const joinPanel = document.getElementById('join-panel');
    if (joinPanel) joinPanel.classList.add('hidden');
  }
}

function showOnlineDisabled() {
  const note = document.getElementById('online-disabled-note');
  if (note) note.classList.remove('hidden');
}

// ── AI Worker lifecycle ───────────────────────────────────────────────────────
function ensureWorker() {
  if (aiWorker) return;
  aiWorker = new Worker('./js/ai-worker.js', { type: 'module' });
  aiWorker.onmessage = ({ data }) => {
    aiThinking = false;
    setAiThinking(false);
    if (!data.move || !gameState) return;
    executeAIMove(data.move);
  };
  aiWorker.onerror = (e) => {
    aiThinking = false;
    setAiThinking(false);
    console.error('AI worker error:', e);
  };
}

function terminateWorker() {
  if (aiWorker) {
    aiWorker.terminate();
    aiWorker = null;
  }
  aiThinking = false;
}

function postToAI() {
  if (!gameState || !aiWorker || aiThinking) return;
  aiThinking = true;
  setAiThinking(true);
  aiWorker.postMessage({
    boardData:  Array.from(gameState.board),
    turn:       gameState.turn,
    moveCount:  gameState.moveCount,
    difficulty: aiDifficulty
  });
}

function setAiThinking(on) {
  const el = document.getElementById('ai-thinking-indicator');
  if (el) el.classList.toggle('hidden', !on);
}

// ── AI Setup Panel ────────────────────────────────────────────────────────────
function toggleAiSetup() {
  const panel = document.getElementById('ai-setup-panel');
  panel.classList.toggle('hidden');
}

function startAI(playerColor) {
  document.getElementById('ai-setup-panel').classList.add('hidden');
  mode    = 'ai';
  myColor = playerColor;
  aiColor = opponent(playerColor);

  gameState    = GameState.initial();
  stateHistory = [];
  moveHistory  = [];
  resetSel();
  ensureWorker();

  updateColorIndicator();
  updateAIBadge();
  updateUndoVisibility();
  showScreen('screen-game');
  updateStatus();
  updateMoveHistory();
  renderer.setLastMove(null);
  redraw();

  // If AI plays White (goes first), kick it off immediately
  if (gameState.turn === aiColor) {
    setTimeout(postToAI, 300);
  }
}

// ── Game Start: Local ─────────────────────────────────────────────────────────
function startLocal() {
  mode         = 'local';
  myColor      = null;
  aiColor      = null;
  net          = null;
  gameState    = GameState.initial();
  stateHistory = [];
  moveHistory  = [];
  resetSel();
  terminateWorker();
  updateColorIndicator();
  updateAIBadge();
  updateUndoVisibility();
  showScreen('screen-game');
  updateStatus();
  updateMoveHistory();
  renderer.setLastMove(null);
  redraw();
}

// ── Game Start: Host/Guest ────────────────────────────────────────────────────
async function startHost() {
  if (!onlineSupported) {
    showOnlineDisabled();
    return;
  }
  if (net) net.disconnect();
  net = new Network();

  net.on('opponent_joined', () => {
    document.getElementById('lobby-waiting').classList.add('hidden');
    document.getElementById('lobby-ready').classList.remove('hidden');
    setTimeout(() => {
      showScreen('screen-game');
      updateStatus();
      redraw();
    }, 800);
  });
  net.on('move',   onNetworkMove);
  net.on('resign', () => showGameOver(opponent(myColor)));
  net.on('rematch', doRematch);

  try {
    const { roomId } = await net.createRoom();
    mode         = 'host';
    myColor      = WHITE;
    aiColor      = null;
    gameState    = GameState.initial();
    stateHistory = [];
    moveHistory  = [];
    resetSel();
    terminateWorker();
    updateColorIndicator();
    updateAIBadge();
    updateMoveHistory();
    updateUndoVisibility();

    document.getElementById('lobby-room-code').textContent = roomId;
    updateLobbyLink();
    document.getElementById('lobby-waiting').classList.remove('hidden');
    document.getElementById('lobby-ready').classList.add('hidden');
    showScreen('screen-lobby');
  } catch {
    alert('Failed to create room. Is the server running?\n\nStart it with: python start.py');
  }
}

function updateLobbyLink() {
  const code = document.getElementById('lobby-room-code').textContent;
  const base = window.location.href.split('?')[0];
  const url  = `${base}?join=${code}`;
  document.getElementById('lobby-link').textContent = url;
}

async function startGuest(roomId) {
  if (!onlineSupported) {
    showOnlineDisabled();
    return;
  }
  if (net) net.disconnect();
  net = new Network();

  net.on('move',   onNetworkMove);
  net.on('resign', () => showGameOver(opponent(myColor)));
  net.on('rematch', doRematch);

  try {
    await net.joinRoom(roomId);
    mode         = 'guest';
    myColor      = BLACK;
    aiColor      = null;
    gameState    = GameState.initial();
    stateHistory = [];
    moveHistory  = [];
    resetSel();
    terminateWorker();
    updateColorIndicator();
    updateAIBadge();
    updateUndoVisibility();
    showScreen('screen-game');
    updateStatus();
    updateMoveHistory();
    renderer.setLastMove(null);
    redraw();
  } catch (e) {
    alert(`Could not join room "${roomId}": ${e.message}\n\nMake sure the host has the server running.`);
  }
}

function onCopyLink() {
  const link = document.getElementById('lobby-link').textContent;
  navigator.clipboard.writeText(link).then(() => {
    const btn  = document.getElementById('btn-copy-link');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

function updateColorIndicator() {
  const dot   = document.getElementById('my-color-dot');
  const label = document.getElementById('my-color-label');
  if (mode === 'host' || myColor === WHITE) {
    dot.className = 'color-dot white';
    label.textContent = mode === 'ai' ? 'You are White' : (mode === 'host' ? 'You are White (Host)' : 'You are White');
  } else if (mode === 'guest' || myColor === BLACK) {
    dot.className = 'color-dot black';
    label.textContent = mode === 'ai' ? 'You are Black' : (mode === 'guest' ? 'You are Black (Guest)' : 'You are Black');
  } else {
    dot.className = 'color-dot white';
    label.textContent = 'Local 2-Player';
  }
}

function updateAIBadge() {
  const badge = document.getElementById('ai-mode-badge');
  if (!badge) return;
  if (mode === 'ai') {
    badge.textContent = `vs AI · ${aiDifficulty}`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ── Board Interaction ─────────────────────────────────────────────────────────
function onBoardClick(e, isTut) {
  const rend        = isTut ? tutRenderer : renderer;
  const activeState = isTut ? tutState    : gameState;
  if (!activeState) return;

  // Don't allow clicks while AI is thinking
  if (!isTut && mode === 'ai' && aiThinking) return;

  const rect  = rend.canvas.getBoundingClientRect();
  const scale = rend.canvas.width / rect.width;
  const px    = (e.clientX - rect.left) * scale;
  const py    = (e.clientY - rect.top)  * scale;
  const cell  = rend.pixelToCell(px, py);
  if (!cell) return;
  const [c, r] = cell;

  const step = isTut ? TUTORIAL_STEPS[tutStep - 1] : null;
  if (step && !step.interactive) return;

  const turn = activeState.turn;

  // Online: only move on your turn
  if (!isTut && (mode === 'host' || mode === 'guest') && turn !== myColor) return;

  // AI mode: only move when it's the human's turn
  if (!isTut && mode === 'ai' && turn === aiColor) return;

  // Tutorial restricted color
  if (step && !step.freePlay && step.allowedColor && turn !== step.allowedColor) return;

  const piece = activeState.get(c, r);

  if (!selCell) {
    if (piece === turn) {
      selCell  = [c, r];
      selMoves = deduplicateMoves(getValidMovesForPiece(activeState, c, r));
      sound.select();
      isTut ? tutRedraw() : redraw();
    }
  } else {
    const move = selMoves && selMoves.find(m => m.to[0] === c && m.to[1] === r);
    if (move) {
      executeMove(activeState, move, isTut);
    } else if (piece === turn) {
      selCell  = [c, r];
      selMoves = deduplicateMoves(getValidMovesForPiece(activeState, c, r));
      sound.select();
      isTut ? tutRedraw() : redraw();
    } else {
      resetSel();
      isTut ? tutRedraw() : redraw();
    }
  }
}

function executeMove(activeState, move, isTut) {
  if (!isTut) {
    stateHistory.push(activeState.clone());
  }

  const newState = applyMove(activeState, move);
  resetSel();

  // Sounds
  if (move.captured && move.captured.length > 0) {
    sound.capture();
  } else {
    sound.move();
  }

  // Renderer effects
  if (!isTut) {
    renderer.setLastMove({ from: move.from, to: move.to });
    if (move.captured && move.captured.length > 0) {
      renderer.spawnCapture(move.captured, activeState.turn);
    }
  }

  const rend = isTut ? tutRenderer : renderer;

  if (move.type === 'phalanx') {
    rend.animateMove(activeState, move, () => {
      if (isTut) tutState = newState;
      else       gameState = newState;
      if (!isTut) {
        addMoveHistory(move, activeState);
      }
      afterMove(newState, isTut, move);
    });
  } else {
    if (isTut) tutState = newState;
    else       gameState = newState;
    if (!isTut) {
      addMoveHistory(move, activeState);
    }
    afterMove(newState, isTut, move);
  }

  if (!isTut && net) net.sendMove(move);
}

function afterMove(state, isTut, move) {
  if (isTut) { tutRedraw(); return; }

  const winner = state.checkWin();
  if (winner) {
    if (winner === myColor || (mode === 'local' && !myColor)) sound.win();
    else if (mode !== 'local') sound.lose();
    else sound.win();
    showGameOver(winner);
    return;
  }

  updateStatus();
  updateUndoVisibility();
  redraw();

  // If AI mode and now AI's turn, dispatch to worker
  if (mode === 'ai' && state.turn === aiColor) {
    setTimeout(postToAI, 350);
  }
}

function executeAIMove(move) {
  if (!gameState) return;
  // Animate the AI move
  const prevState = gameState.clone();
  stateHistory.push(prevState);

  const newState = applyMove(gameState, move);
  gameState = newState;

  renderer.setLastMove({ from: move.from, to: move.to });
  if (move.captured && move.captured.length > 0) {
    sound.capture();
    renderer.spawnCapture(move.captured, prevState.turn);
  } else {
    sound.move();
  }

  addMoveHistory(move, prevState);

  if (move.type === 'phalanx') {
    renderer.animateMove(prevState, move, () => {
      afterMoveAI(newState, move);
    });
  } else {
    afterMoveAI(newState, move);
  }
}

function afterMoveAI(state, move) {
  const winner = state.checkWin();
  if (winner) {
    if (winner === myColor) sound.win();
    else sound.lose();
    showGameOver(winner);
    return;
  }
  updateStatus();
  updateUndoVisibility();
  redraw();
}

function onNetworkMove(moveData) {
  if (!gameState) return;
  const prevState = gameState.clone();
  const newState  = applyMove(gameState, moveData);

  renderer.setLastMove({ from: moveData.from, to: moveData.to });
  if (moveData.captured && moveData.captured.length > 0) {
    sound.capture();
    renderer.spawnCapture(moveData.captured, prevState.turn);
  } else {
    sound.move();
  }

  if (moveData.type === 'phalanx') {
    renderer.animateMove(gameState, moveData, () => {
      gameState = newState;
      addMoveHistory(moveData, prevState);
      const w = newState.checkWin();
      if (w) { sound.lose(); showGameOver(w); }
      else { updateStatus(); redraw(); }
    });
  } else {
    gameState = newState;
    addMoveHistory(moveData, prevState);
    const w = newState.checkWin();
    if (w) { sound.lose(); showGameOver(w); }
    else { updateStatus(); redraw(); }
  }
}

// ── Undo ──────────────────────────────────────────────────────────────────────
function onUndo() {
  if (mode !== 'local' && mode !== 'ai') return;
  if (stateHistory.length === 0) return;

  if (mode === 'ai') {
    // Undo 2 moves (human + AI), unless only 1 move was made
    const steps = stateHistory.length >= 2 ? 2 : 1;
    for (let i = 0; i < steps; i++) {
      if (stateHistory.length > 0) {
        gameState = stateHistory.pop();
        if (moveHistory.length > 0) moveHistory.pop();
      }
    }
  } else {
    // Local: undo 1 move
    gameState = stateHistory.pop();
    if (moveHistory.length > 0) moveHistory.pop();
  }

  resetSel();
  renderer.setLastMove(stateHistory.length > 0 ? null : null);
  updateStatus();
  updateMoveHistory();
  updateUndoVisibility();
  redraw();
}

function updateUndoVisibility() {
  const btn = document.getElementById('btn-undo');
  if (!btn) return;
  const canUndo = (mode === 'local' || mode === 'ai') && stateHistory.length > 0;
  btn.classList.toggle('hidden', !canUndo);
}

// ── Move History ──────────────────────────────────────────────────────────────
function addMoveHistory(move, stateBefore) {
  const num      = moveHistory.length + 1;
  const notation = moveNotation(move);
  const captures = move.captured ? move.captured.length : 0;
  const color    = stateBefore.turn;
  moveHistory.push({ num, notation, captures, color });
  updateMoveHistory();
}

function updateMoveHistory() {
  const list = document.getElementById('move-history-list');
  if (!list) return;

  list.innerHTML = '';
  for (const entry of moveHistory) {
    const li   = document.createElement('li');
    const colorName = entry.color === WHITE ? 'white' : 'black';
    li.className = `history-entry history-${colorName}`;

    const numSpan  = document.createElement('span');
    numSpan.className = 'history-num';
    numSpan.textContent = entry.num + '.';

    const notSpan  = document.createElement('span');
    notSpan.className = 'history-notation';
    notSpan.textContent = entry.notation;

    li.appendChild(numSpan);
    li.appendChild(notSpan);

    if (entry.captures > 0) {
      const cap = document.createElement('span');
      cap.className = 'history-cap-badge';
      cap.textContent = `×${entry.captures}`;
      li.appendChild(cap);
    }

    list.appendChild(li);
  }
  // Scroll to bottom
  list.scrollTop = list.scrollHeight;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function resetSel() { selCell = null; selMoves = null; }

function redraw() {
  if (!gameState) return;
  renderer.draw(gameState, {
    selected:   selCell,
    phalanx:    selMoves ? selMoves.flatMap(m => m.phalanx) : null,
    validMoves: selMoves,
  });
}

function tutRedraw() {
  if (!tutState) return;
  const step = TUTORIAL_STEPS[tutStep - 1];
  tutRenderer.draw(tutState, {
    selected:   selCell,
    phalanx:    selMoves ? selMoves.flatMap(m => m.phalanx) : null,
    validMoves: selMoves,
    highlights: step ? (step.highlights || []) : [],
  });
}

// ── Status ────────────────────────────────────────────────────────────────────
function updateStatus() {
  if (!gameState) return;

  const name     = gameState.turn === WHITE ? 'White' : 'Black';
  const turnEl   = document.getElementById('status-turn');
  if (turnEl) {
    turnEl.textContent = `${name}'s turn`;
    turnEl.className = gameState.turn === WHITE ? 'subtitle turn-white' : 'subtitle turn-black';
  }

  const wGoal = gameState.countOnRow(WHITE, 0);   // White's goal is row 0
  const bGoal = gameState.countOnRow(BLACK, ROWS - 1); // Black's goal is row 11
  const scoreEl = document.getElementById('status-score');
  if (scoreEl) {
    scoreEl.innerHTML =
      `<span class="score-white">W: ${wGoal}</span> on row 1 &nbsp;|&nbsp; ` +
      `<span class="score-black">B: ${bGoal}</span> on row 12`;
  }

  const waitEl = document.getElementById('status-wait');
  if (waitEl) {
    if (mode === 'host' || mode === 'guest') {
      waitEl.classList.toggle('hidden', gameState.turn === myColor);
    } else {
      waitEl.classList.add('hidden');
    }
  }
}

// ── Game Over ─────────────────────────────────────────────────────────────────
function showGameOver(winner) {
  const name = winner === WHITE ? 'White' : 'Black';
  document.getElementById('gameover-title').textContent = `${name} Wins!`;
  document.getElementById('gameover-msg').textContent =
    winner === WHITE
      ? "White has more pieces on Black's back row (row 1)."
      : "Black has more pieces on White's back row (row 12).";

  // Show AI-specific outcome message if applicable
  const aiMsg = document.getElementById('gameover-ai-msg');
  if (aiMsg) {
    if (mode === 'ai') {
      if (winner === myColor) {
        aiMsg.textContent = 'You defeated the AI!';
        aiMsg.className = 'gameover-ai-msg win';
      } else {
        aiMsg.textContent = `The AI (${aiDifficulty}) wins this time.`;
        aiMsg.className = 'gameover-ai-msg lose';
      }
      aiMsg.classList.remove('hidden');
    } else {
      aiMsg.classList.add('hidden');
    }
  }

  showScreen('screen-gameover');
}

function onResign() {
  if (!gameState) return;
  const loser = gameState.turn;
  if (net) net.sendEvent('resign');
  if (mode === 'ai') terminateWorker();
  showGameOver(opponent(loser));
}

function doRematch() {
  gameState    = GameState.initial();
  stateHistory = [];
  moveHistory  = [];
  resetSel();
  renderer.setLastMove(null);
  updateColorIndicator();
  updateMoveHistory();
  showScreen('screen-game');
  updateStatus();
  updateUndoVisibility();
  redraw();

  if (mode === 'ai') {
    ensureWorker();
    if (gameState.turn === aiColor) {
      setTimeout(postToAI, 400);
    }
  }
}

function onRematch() {
  if (net) net.sendEvent('rematch');
  doRematch();
}

function goMenu() {
  if (net) { net.disconnect(); net = null; }
  terminateWorker();
  gameState    = null;
  mode         = null;
  myColor      = null;
  aiColor      = null;
  stateHistory = [];
  moveHistory  = [];
  tutStep      = 0;
  tutState     = null;
  resetSel();
  document.getElementById('join-panel').classList.add('hidden');
  document.getElementById('ai-setup-panel').classList.add('hidden');
  document.getElementById('join-code-input').value = '';
  showScreen('screen-menu');
}

// ── Tutorial ──────────────────────────────────────────────────────────────────
function startTutorial() {
  tutStep = 1;
  loadTutStep();
  showScreen('screen-tutorial');
}

function loadTutStep() {
  const step = TUTORIAL_STEPS[tutStep - 1];
  tutState   = step.boardFactory();
  resetSel();

  document.getElementById('tut-step-num').textContent = `${tutStep} / ${TUTORIAL_STEPS.length}`;
  document.getElementById('tut-title')   .textContent = step.title;
  document.getElementById('tut-body')    .innerHTML   = step.body;

  const instrEl = document.getElementById('tut-instruction');
  instrEl.textContent = step.instruction || '';
  instrEl.classList.toggle('hidden', !step.instruction);

  document.getElementById('btn-tut-prev').disabled = tutStep === 1;
  document.getElementById('btn-tut-next').textContent =
    tutStep === TUTORIAL_STEPS.length ? 'Finish ✓' : 'Next →';

  tutRenderer.resize();
  tutRedraw();
}

function tutNav(dir) {
  const next = tutStep + dir;
  if (next < 1) return;
  if (next > TUTORIAL_STEPS.length) { closeTutorial(); return; }
  tutStep = next;
  loadTutStep();
}

function tutReset() {
  if (!tutStep) return;
  tutState = TUTORIAL_STEPS[tutStep - 1].boardFactory();
  resetSel();
  tutRedraw();
}

function closeTutorial() {
  tutStep = 0; tutState = null;
  showScreen('screen-menu');
}
