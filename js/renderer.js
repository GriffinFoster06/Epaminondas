// Canvas renderer for Epaminondas — full visual overhaul
import { COLS, ROWS, EMPTY, WHITE, BLACK } from './game.js';

// ── Palette ────────────────────────────────────────────────────────────────────
const PAL = {
  boardBg:      '#0a0c18',
  squareDark:   '#111624',
  squareLight:  '#141828',
  gridLine:     '#1e2340',
  white:        '#f0e6c8',
  whiteBorder:  '#c8b890',
  whiteHigh:    '#ffffff',
  black:        '#1e0f08',
  blackBorder:  '#5a3020',
  blackHigh:    '#6a3820',
  highlight:    'rgba(200, 160, 48, 0.38)',   // amber for selected
  lastMoveFrom: 'rgba(200, 160, 48, 0.20)',
  lastMoveTo:   'rgba(200, 160, 48, 0.32)',
  phalanxGlow:  'rgba(74, 143, 255, 0.28)',
  validDot:     '#50e878',
  captureRing:  '#ff5050',
  goalLineW:    '#c8a030',   // gold  — White's goal (row 0)
  goalLineB:    '#4a8fff',   // blue  — Black's goal (row 11)
  goalTintW:    'rgba(200, 160, 48, 0.10)',
  goalTintB:    'rgba(74, 143, 255, 0.10)',
  labelNorm:    '#4a5070',
  labelGoalW:   '#c8a030',
  labelGoalB:   '#4a8fff',
};

// ── Particle ───────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, color) {
    const angle   = Math.random() * Math.PI * 2;
    const speed   = 1.5 + Math.random() * 3.5;
    this.x  = x;
    this.y  = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - 1.5;
    this.life   = 1.0;
    this.decay  = 0.025 + Math.random() * 0.02;
    this.radius = 2 + Math.random() * 3;
    this.color  = color === WHITE
      ? `hsl(${40 + Math.random()*20}, 80%, ${70 + Math.random()*20}%)`
      : `hsl(${10 + Math.random()*20}, 70%, ${40 + Math.random()*20}%)`;
  }

  update() {
    this.x    += this.vx;
    this.y    += this.vy;
    this.vy   += 0.12;   // gravity
    this.vx   *= 0.97;
    this.life -= this.decay;
  }

  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  isDead() { return this.life <= 0; }
}

// ── Renderer ───────────────────────────────────────────────────────────────────
export class Renderer {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.cellSize = 40;
    this.offsetX  = 28;
    this.offsetY  = 0;

    // Continuous animation loop state
    this._rafId      = null;
    this._particles  = [];
    this._anim       = null;   // active move animation
    this._animDone   = null;
    this._lastState  = null;
    this._lastSel    = null;
    this._lastMove   = null;   // { from, to } for amber tint
    this._animTime   = 0;      // used for pulsing dots

    this._startLoop();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  resize() {
    const parent = this.canvas.parentElement;
    const maxW   = parent ? parent.clientWidth  - 4 : 600;
    const maxH   = window.innerHeight - 160;
    const labelPad = 28;
    const cs     = Math.floor(
      Math.min((maxW - labelPad) / COLS, (maxH - labelPad) / ROWS)
    );
    this.cellSize = Math.max(cs, 24);
    this.canvas.width  = this.cellSize * COLS + labelPad;
    this.canvas.height = this.cellSize * ROWS + labelPad;
    this.offsetX = labelPad;
    this.offsetY = 0;
  }

  draw(state, sel, lastMove) {
    this._lastState = state;
    this._lastSel   = sel;
    if (lastMove !== undefined) this._lastMove = lastMove;
  }

  setLastMove(move) {
    this._lastMove = move;
  }

  // Spawn burst particles at given board cells for `color`
  spawnCapture(positions, color) {
    const cs = this.cellSize;
    const ox = this.offsetX, oy = this.offsetY;
    for (const [c, r] of positions) {
      const cx = ox + c * cs + cs / 2;
      const cy = oy + r * cs + cs / 2;
      for (let i = 0; i < 18; i++) {
        this._particles.push(new Particle(cx, cy, color));
      }
    }
  }

  animateMove(state, move, callback) {
    const duration = 200;
    this._anim = {
      move,
      stateBefore: state,
      startTime:   performance.now(),
      duration
    };
    this._animDone = callback;
  }

  cellToPixel(c, r) {
    return [
      this.offsetX + c * this.cellSize + this.cellSize / 2,
      this.offsetY + r * this.cellSize + this.cellSize / 2,
    ];
  }

  pixelToCell(px, py) {
    const c = Math.floor((px - this.offsetX) / this.cellSize);
    const r = Math.floor((py - this.offsetY) / this.cellSize);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return [c, r];
  }

  // ── Internal loop ──────────────────────────────────────────────────────────

  _startLoop() {
    const loop = (ts) => {
      this._animTime = ts;
      this._tick(ts);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _tick(ts) {
    if (!this._lastState) return;

    // Update particles
    for (const p of this._particles) p.update();
    this._particles = this._particles.filter(p => !p.isDead());

    // Check move animation progress
    let animT = null;
    if (this._anim) {
      animT = Math.min((ts - this._anim.startTime) / this._anim.duration, 1);
      if (animT >= 1) {
        const done = this._animDone;
        this._anim     = null;
        this._animDone = null;
        if (done) done();
        return; // let next frame render the final state
      }
    }

    this._render(this._lastState, this._lastSel, this._lastMove, animT);
  }

  _render(state, sel, lastMove, animT) {
    const ctx = this.ctx;
    const cs  = this.cellSize;
    const ox  = this.offsetX;
    const oy  = this.offsetY;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Board background
    ctx.fillStyle = PAL.boardBg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Checkerboard pattern (very subtle)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (c + r) % 2 === 0 ? PAL.squareDark : PAL.squareLight;
        ctx.fillRect(ox + c * cs, oy + r * cs, cs, cs);
      }
    }

    // Goal row tints
    ctx.fillStyle = PAL.goalTintW;
    ctx.fillRect(ox, oy + 0 * cs, COLS * cs, cs);      // row 0 = White's goal
    ctx.fillStyle = PAL.goalTintB;
    ctx.fillRect(ox, oy + (ROWS - 1) * cs, COLS * cs, cs); // row 11 = Black's goal

    // Last-move highlights
    if (lastMove) {
      const markCell = (cell, style) => {
        if (!cell) return;
        ctx.fillStyle = style;
        ctx.fillRect(ox + cell[0] * cs, oy + cell[1] * cs, cs, cs);
      };
      markCell(lastMove.from, PAL.lastMoveFrom);
      markCell(lastMove.to,   PAL.lastMoveTo);
    }

    // Selected cell highlight
    if (sel && sel.selected) {
      const [sc, sr] = sel.selected;
      ctx.fillStyle = PAL.highlight;
      ctx.fillRect(ox + sc * cs, oy + sr * cs, cs, cs);
    }

    // Phalanx glow
    if (sel && sel.phalanx) {
      for (const [pc, pr] of sel.phalanx) {
        ctx.fillStyle = PAL.phalanxGlow;
        ctx.fillRect(ox + pc * cs, oy + pr * cs, cs, cs);
      }
    }

    // Grid lines
    ctx.strokeStyle = PAL.gridLine;
    ctx.lineWidth   = 1;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + r * cs);
      ctx.lineTo(ox + COLS * cs, oy + r * cs);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(ox + c * cs, oy);
      ctx.lineTo(ox + c * cs, oy + ROWS * cs);
      ctx.stroke();
    }

    // Goal row accent lines
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PAL.goalLineW;
    ctx.beginPath();
    ctx.moveTo(ox, oy + 0);
    ctx.lineTo(ox + COLS * cs, oy + 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox, oy + 1 * cs);
    ctx.lineTo(ox + COLS * cs, oy + 1 * cs);
    ctx.stroke();

    ctx.strokeStyle = PAL.goalLineB;
    ctx.beginPath();
    ctx.moveTo(ox, oy + (ROWS - 1) * cs);
    ctx.lineTo(ox + COLS * cs, oy + (ROWS - 1) * cs);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ox, oy + ROWS * cs);
    ctx.lineTo(ox + COLS * cs, oy + ROWS * cs);
    ctx.stroke();

    // Tutorial highlights (golden border)
    if (sel && sel.highlights) {
      for (const [hc, hr] of sel.highlights) {
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.85)';
        ctx.lineWidth   = 3;
        ctx.strokeRect(ox + hc * cs + 2, oy + hr * cs + 2, cs - 4, cs - 4);
      }
    }

    // Valid move indicators (pulsing)
    if (sel && sel.validMoves) {
      const pulse = 0.75 + 0.25 * Math.sin(this._animTime / 300);
      for (const m of sel.validMoves) {
        const [tc, tr] = m.to;
        const cx = ox + tc * cs + cs / 2;
        const cy = oy + tr * cs + cs / 2;
        if (m.captured && m.captured.length > 0) {
          // Red ring for captures
          const ringR = cs * 0.40 * pulse;
          ctx.strokeStyle = PAL.captureRing;
          ctx.lineWidth   = 2.5;
          ctx.shadowColor  = PAL.captureRing;
          ctx.shadowBlur   = 6 * pulse;
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          // Green dot for moves
          const dotR = cs * 0.16 * pulse;
          ctx.fillStyle  = PAL.validDot;
          ctx.shadowColor = PAL.validDot;
          ctx.shadowBlur  = 5 * pulse;
          ctx.beginPath();
          ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }

    // Coordinate labels
    const labelSize = Math.max(cs * 0.28, 9);
    ctx.font      = `${labelSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const colLetters = 'ABCDEFGHIJKLMN';
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = PAL.labelNorm;
      ctx.fillText(colLetters[c], ox + c * cs + cs / 2, oy + ROWS * cs + 14);
    }
    ctx.textAlign = 'right';
    for (let r = 0; r < ROWS; r++) {
      const rowNum = ROWS - r;
      if (r === 0) ctx.fillStyle = PAL.labelGoalW;         // row 12 → gold
      else if (r === ROWS - 1) ctx.fillStyle = PAL.labelGoalB; // row 1  → blue
      else ctx.fillStyle = PAL.labelNorm;
      ctx.fillText(String(rowNum), ox - 5, oy + r * cs + cs / 2);
    }

    // Determine which cells are animating
    const animatingCells = new Set();
    if (this._anim && animT !== null) {
      const { move } = this._anim;
      for (const [pc, pr] of move.phalanx) animatingCells.add(`${pc},${pr}`);
      for (const [cc, cr] of (move.captured || [])) animatingCells.add(`${cc},${cr}`);
    }

    // Draw static pieces
    const drawState = (this._anim && animT !== null) ? this._anim.stateBefore : state;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = drawState.get(c, r);
        if (!piece) continue;
        if (animatingCells.has(`${c},${r}`)) continue;
        this._drawPiece(ctx, piece, ox + c * cs + cs / 2, oy + r * cs + cs / 2, cs * 0.38);
      }
    }

    // Draw animated pieces
    if (this._anim && animT !== null) {
      const { move, stateBefore } = this._anim;
      const ease  = _easeInOut(animT);
      const color = stateBefore.get(move.phalanx[0][0], move.phalanx[0][1]);
      for (const [pc, pr] of move.phalanx) {
        const startX = ox + pc * cs + cs / 2;
        const startY = oy + pr * cs + cs / 2;
        const endX   = startX + move.dc * move.dist * cs;
        const endY   = startY + move.dr * move.dist * cs;
        const x = startX + (endX - startX) * ease;
        const y = startY + (endY - startY) * ease;
        this._drawPiece(ctx, color, x, y, cs * 0.38);
      }
    }

    // Draw particles on top
    for (const p of this._particles) p.draw(ctx);
  }

  _drawPiece(ctx, color, x, y, r) {
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur  = r * 0.7;
    ctx.shadowOffsetX = r * 0.15;
    ctx.shadowOffsetY = r * 0.25;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);

    if (color === WHITE) {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x + r * 0.1, y + r * 0.1, r);
      g.addColorStop(0, PAL.whiteHigh);
      g.addColorStop(0.45, PAL.white);
      g.addColorStop(1, '#b0a888');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = PAL.whiteBorder;
    } else {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.05, x + r * 0.1, y + r * 0.1, r);
      g.addColorStop(0, PAL.blackHigh);
      g.addColorStop(0.4, '#3a1a10');
      g.addColorStop(1, PAL.black);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = PAL.blackBorder;
    }

    ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function _easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
