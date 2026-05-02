// Tutorial system: 10 guided steps with preset board states
import { COLS, ROWS, EMPTY, WHITE, BLACK, GameState } from './game.js';

function makeBoard(pieces, turn) {
  const gs = new GameState();
  gs.turn = turn !== undefined ? turn : WHITE;
  for (const [c, r, color] of pieces) {
    gs.board[gs.idx(c, r)] = color;
  }
  return gs;
}

function fullStartBoard() {
  return GameState.initial();
}

// Step 3: single piece in centre
function step3Board() {
  const gs = new GameState();
  gs.board[gs.idx(7, 6)] = WHITE;
  gs.turn = WHITE;
  return gs;
}

// Step 5: three white pieces in a row
function step5Board() {
  const gs = new GameState();
  gs.board[gs.idx(4, 6)] = WHITE;
  gs.board[gs.idx(5, 6)] = WHITE;
  gs.board[gs.idx(6, 6)] = WHITE;
  gs.turn = WHITE;
  return gs;
}

// Step 6/7: phalanx capture demo
function step7Board() {
  const gs = new GameState();
  gs.board[gs.idx(4, 6)] = WHITE;
  gs.board[gs.idx(5, 6)] = WHITE;
  gs.board[gs.idx(6, 6)] = WHITE;
  gs.board[gs.idx(7, 6)] = BLACK;
  gs.board[gs.idx(8, 6)] = BLACK;
  gs.turn = WHITE;
  return gs;
}

// Step 9: more interesting midgame — White has a diagonal thrust going
function step9Board() {
  const gs = GameState.initial();
  // Clear original positions for the pieces we're moving
  const clears = [[3,11],[3,10],[7,11],[7,10],[5,11],[5,10],[9,11],[9,10]];
  for (const [c,r] of clears) gs.board[gs.idx(c,r)] = EMPTY;
  // Place white pieces in advanced positions
  gs.board[gs.idx(3, 7)] = WHITE;
  gs.board[gs.idx(3, 6)] = WHITE;
  gs.board[gs.idx(7, 5)] = WHITE;
  gs.board[gs.idx(7, 6)] = WHITE;
  gs.board[gs.idx(5, 8)] = WHITE;
  gs.board[gs.idx(5, 7)] = WHITE;
  gs.board[gs.idx(9, 9)] = WHITE;
  gs.board[gs.idx(9, 8)] = WHITE;
  // Place some black pieces also advanced, with a diagonal phalanx
  gs.board[gs.idx(4, 4)] = BLACK;
  gs.board[gs.idx(5, 5)] = BLACK;   // diagonal phalanx
  gs.board[gs.idx(6, 4)] = BLACK;
  gs.turn = WHITE;
  return gs;
}

// Step 10: Black has TWO pieces on White's back row — requires urgent response
function step10Board() {
  const gs = GameState.initial();
  // Remove black pieces from their home
  gs.board[gs.idx(4, 0)] = EMPTY;
  gs.board[gs.idx(5, 0)] = EMPTY;
  gs.board[gs.idx(4, 1)] = EMPTY;
  gs.board[gs.idx(5, 1)] = EMPTY;
  // Place two black pieces on White's home row (row 11)
  gs.board[gs.idx(4, 11)] = BLACK;
  gs.board[gs.idx(5, 11)] = BLACK;
  // Remove corresponding white pieces from row 11 to fit
  gs.board[gs.idx(4, 10)] = EMPTY;
  // Advance some white pieces toward Black's home
  gs.board[gs.idx(6, 11)] = EMPTY;
  gs.board[gs.idx(6, 10)] = EMPTY;
  gs.board[gs.idx(6, 4)] = WHITE;
  gs.board[gs.idx(6, 3)] = WHITE;
  gs.turn = WHITE;
  return gs;
}

export const TUTORIAL_STEPS = [
  {
    id: 1,
    title: 'Welcome to Epaminondas',
    body: `
      <p>Epaminondas is a two-player strategy game invented by Robert Abbott in 1975. It's named after an ancient Greek general who mastered the art of concentrated force.</p>
      <p>You play on a <strong>14×12 board</strong>. Each player controls <strong>28 pieces</strong> arranged on their two back rows.</p>
      <p><span class="pill white-pill">White</span> starts on the <strong>bottom two rows</strong> and moves first.<br>
         <span class="pill black-pill">Black</span> starts on the <strong>top two rows</strong>.</p>
      <p>The <span style="color:#c8a030">gold</span> accent marks row 1 — White's goal.<br>
         The <span style="color:#4a8fff">blue</span> accent marks row 12 — Black's goal.</p>
    `,
    boardFactory: fullStartBoard,
    highlights: [],
    interactive: false,
    freePlay: false,
  },
  {
    id: 2,
    title: 'The Goal',
    body: `
      <p>You win by controlling your opponent's back row.</p>
      <p>At the <strong>start of your turn</strong>: if you have <em>more pieces</em> on your opponent's back row than they have on yours — you win!</p>
      <p><span class="pill white-pill">White</span> wants to get pieces to <strong>row 1</strong> (the gold/top row).<br>
         <span class="pill black-pill">Black</span> wants to get pieces to <strong>row 12</strong> (the blue/bottom row).</p>
      <p>The goal rows are highlighted below. It's not enough to just get there — you need <em>more pieces</em> there than the opponent has on yours. <strong>Defense matters as much as offense!</strong></p>
    `,
    boardFactory: fullStartBoard,
    // Highlight all 14 cells in row 0 (White's goal) AND row 11 (Black's goal)
    highlights: [
      [0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],[12,0],[13,0],
      [0,11],[1,11],[2,11],[3,11],[4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[10,11],[11,11],[12,11],[13,11],
    ],
    interactive: false,
    freePlay: false,
  },
  {
    id: 3,
    title: 'Moving a Single Piece',
    body: `
      <p>A lone piece (not part of a group) moves like a chess king: <strong>one square in any direction</strong> — horizontal, vertical, or diagonal.</p>
      <p>It can only move to an <strong>empty square</strong>. A single piece <em>cannot capture</em>.</p>
      <p>The green dots show all valid destinations. Click the white piece, then click any green dot to move it.</p>
    `,
    boardFactory: step3Board,
    highlights: [],
    interactive: true,
    freePlay: false,
    allowedColor: WHITE,
    instruction: 'Click the white piece, then click a green dot to move it.',
  },
  {
    id: 4,
    title: 'What is a Phalanx?',
    body: `
      <p>A <strong>phalanx</strong> is a group of <strong>2 or more</strong> same-color pieces in a straight line — horizontal, vertical, or diagonal — with <em>no gaps</em>.</p>
      <p>Phalanxes move as a unit and can <strong>capture enemy pieces</strong>. The power of a phalanx comes from its <strong>length</strong>: a longer phalanx moves farther and can overpower shorter enemy lines.</p>
      <p>In the starting position, every pair of same-row pieces forms a horizontal phalanx of up to 14 pieces, and every pair of vertically adjacent same-column pieces is a vertical phalanx.</p>
      <p>The highlighted cells below show a horizontal black phalanx in row 1 and a vertical white phalanx in column H.</p>
    `,
    boardFactory: fullStartBoard,
    highlights: [
      // Horizontal black phalanx: first 5 of row 0
      [0,0],[1,0],[2,0],[3,0],[4,0],
      // Vertical white phalanx: column 7 rows 10-11
      [7,10],[7,11],
    ],
    interactive: false,
    freePlay: false,
  },
  {
    id: 5,
    title: 'Moving a Phalanx',
    body: `
      <p>A phalanx moves <strong>along its own axis</strong> (the direction it points), either forward or backward.</p>
      <p>A phalanx of <strong>N pieces</strong> can move up to <strong>N squares</strong> in one turn.</p>
      <p>All pieces shift together. The phalanx cannot turn mid-move.</p>
      <p>The three white pieces below form a horizontal phalanx. Click any piece to select it, then click a destination up to 3 squares to the left or right.</p>
    `,
    boardFactory: step5Board,
    highlights: [[4,6],[5,6],[6,6]],
    interactive: true,
    freePlay: false,
    allowedColor: WHITE,
    instruction: 'Click any white piece, then choose a destination (green dot).',
  },
  {
    id: 6,
    title: 'Capturing — The Setup',
    body: `
      <p>A phalanx can <strong>capture enemy pieces</strong> by moving into them head-on — but only if the enemy group it hits is <em>strictly smaller</em>.</p>
      <p>Rules:</p>
      <ul>
        <li>Your phalanx must move directly into an enemy group along the same axis.</li>
        <li>The enemy group must have <strong>fewer pieces</strong> than yours.</li>
        <li>All enemy pieces in that group are removed instantly.</li>
      </ul>
      <p>Example: A phalanx of <strong>3</strong> beats a phalanx of <strong>1 or 2</strong>, but <em>cannot</em> beat a phalanx of 3 or more.</p>
      <p>The highlighted cells show the upcoming battle: 3 white vs. 2 black — white can win!</p>
    `,
    boardFactory: step7Board,
    highlights: [[4,6],[5,6],[6,6],[7,6],[8,6]],
    interactive: false,
    freePlay: false,
  },
  {
    id: 7,
    title: 'Capturing — Try It!',
    body: `
      <p>The white phalanx of 3 faces a black phalanx of 2. White can capture by moving right.</p>
      <p>When you capture, the destination square shown (red ring) is <em>where the first enemy piece was</em>. The white phalanx slides in and the black pieces vanish.</p>
      <p>Click any white piece, then click the <strong>red ring</strong> to the right to execute the capture.</p>
    `,
    boardFactory: step7Board,
    highlights: [],
    interactive: true,
    freePlay: false,
    allowedColor: WHITE,
    instruction: 'Click a white piece, then click the red ring to capture the black phalanx.',
  },
  {
    id: 8,
    title: 'Win Condition & Strategy',
    body: `
      <p><strong>Winning:</strong> At the start of your turn, if you have more pieces on your opponent's back row than they have on yours, you win immediately.</p>
      <p>Key ideas:</p>
      <ul>
        <li><strong>Advance</strong> pieces to the enemy back row to score.</li>
        <li><strong>Defend</strong> your own back row — enemy pieces there cost you the lead.</li>
        <li><strong>Build long phalanxes</strong> — they move far and capture powerfully.</li>
        <li><strong>Diagonal phalanxes</strong> are hard to intercept.</li>
        <li><strong>Threaten multiple entry points</strong> at once to overwhelm the defense.</li>
        <li><strong>Trade carefully</strong> — a smaller phalanx can delay a bigger one.</li>
      </ul>
      <p>The tension between attacking the enemy's back row and defending your own is the heart of the game.</p>
    `,
    boardFactory: fullStartBoard,
    highlights: [],
    interactive: false,
    freePlay: false,
  },
  {
    id: 9,
    title: 'Practice: Break Through',
    body: `
      <p>A mid-game position. White has several phalanxes advanced. Black has a threatening diagonal phalanx.</p>
      <p>This is free play — move for both sides and experiment. Can you get more white pieces to row 1 than black has on row 12?</p>
      <p>Try building a long diagonal phalanx and driving it to the goal row. Watch out for Black's diagonal response!</p>
      <p>Click <strong>Reset Step</strong> to return to the starting position of this scenario.</p>
    `,
    boardFactory: step9Board,
    highlights: [],
    interactive: true,
    freePlay: true,
    instruction: 'Free play — push White to row 1. Click Reset Step to start over.',
  },
  {
    id: 10,
    title: 'Practice: Urgent Defense',
    body: `
      <p>Two black pieces have broken through to White's back row (row 12)! If it's Black's turn with 2 pieces on row 12 and White has 0 on row 1 — Black wins.</p>
      <p>White needs to act NOW. Options:</p>
      <ul>
        <li>Rush <strong>more</strong> white pieces to row 1 before Black's next turn (score 1+ to Black's 2 = still losing; need to match or beat).</li>
        <li>Capture the black pieces off your back row with a large enough phalanx.</li>
        <li>Use the advanced white phalanx in columns G-H (rows 3-4) to strike at Black's home.</li>
      </ul>
      <p>Click <strong>Reset Step</strong> to try different approaches.</p>
    `,
    boardFactory: step10Board,
    highlights: [[4,11],[5,11]],
    interactive: true,
    freePlay: true,
    instruction: 'Defend or counter-attack! Two black pieces are on your back row.',
  },
];
