/* =====================================================================
   NEXUS TIC-TAC-TOE · script.js
   Full game logic: Minimax + Alpha-Beta Pruning AI, particles,
   confetti, sound, dark/light mode, localStorage persistence.
   ===================================================================== */

'use strict';

/* ─────────────────────────────────────────
   1. DOM REFERENCES
──────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const loader       = $('loader');
const loaderBar    = $('loaderBar');
const loaderText   = $('loaderText');
const appWrapper   = $('appWrapper');

const boardEl      = $('board');
const cells        = [...document.querySelectorAll('.cell')];
const turnDot      = $('turnDot');
const turnText     = $('turnText');
const aiThinking   = $('aiThinking');

const winLineSvg   = $('winLineSvg');
const winLineEl    = $('winLine');

const scoreHuman   = $('scoreHuman');
const scoreAI      = $('scoreAI');
const scoreDraws   = $('scoreDraws');

const diffBtns     = [...document.querySelectorAll('.diff-btn')];
const restartBtn   = $('restartBtn');
const newGameBtn   = $('newGameBtn');
const resetScoreBtn= $('resetScoreBtn');

const themeToggle  = $('themeToggle');
const themeIcon    = $('themeIcon');
const soundToggle  = $('soundToggle');
const soundIcon    = $('soundIcon');

const modalOverlay = $('modalOverlay');
const modalEmoji   = $('modalEmoji');
const modalTitle   = $('modalTitle');
const modalSubtitle= $('modalSubtitle');
const modalPlayAgain=$('modalPlayAgain');
const modalClose   = $('modalClose');

const bgCanvas     = $('bgCanvas');
const confettiCanvas=$('confettiCanvas');
const currentDiffDisplay = $('currentDiffDisplay');

/* ─────────────────────────────────────────
   2. GAME STATE
──────────────────────────────────────────── */
const HUMAN = 'X';
const AI    = 'O';
const EMPTY = null;

/** Win combinations: indices on the 3×3 board */
const WIN_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],  // rows
  [0,3,6],[1,4,7],[2,5,8],  // cols
  [0,4,8],[2,4,6]           // diagonals
];

/** Positions of win-line endpoints in the SVG 300×300 space */
const WIN_LINE_COORDS = {
  // rows
  '012': { x1:15,  y1:50,  x2:285, y2:50  },
  '345': { x1:15,  y1:150, x2:285, y2:150 },
  '678': { x1:15,  y1:250, x2:285, y2:250 },
  // cols
  '036': { x1:50,  y1:15,  x2:50,  y2:285 },
  '147': { x1:150, y1:15,  x2:150, y2:285 },
  '258': { x1:250, y1:15,  x2:250, y2:285 },
  // diagonals
  '048': { x1:15,  y1:15,  x2:285, y2:285 },
  '246': { x1:285, y1:15,  x2:15,  y2:285 }
};

let state = {
  board: Array(9).fill(EMPTY),  // current board
  currentPlayer: HUMAN,         // whose turn
  gameOver: false,
  difficulty: 'medium',         // easy | medium | hard
  scores: { human:0, ai:0, draws:0 },
  soundEnabled: true,
  theme: 'dark'
};

/* ─────────────────────────────────────────
   3. LOCAL STORAGE PERSISTENCE
──────────────────────────────────────────── */
function saveToStorage() {
  localStorage.setItem('nexus_scores', JSON.stringify(state.scores));
  localStorage.setItem('nexus_difficulty', state.difficulty);
  localStorage.setItem('nexus_theme', state.theme);
  localStorage.setItem('nexus_sound', state.soundEnabled);
}

function loadFromStorage() {
  try {
    const scores = localStorage.getItem('nexus_scores');
    if (scores) state.scores = JSON.parse(scores);

    const diff = localStorage.getItem('nexus_difficulty');
    if (diff) state.difficulty = diff;

    const theme = localStorage.getItem('nexus_theme');
    if (theme) state.theme = theme;

    const sound = localStorage.getItem('nexus_sound');
    if (sound !== null) state.soundEnabled = sound === 'true';
  } catch(e) {
    // ignore storage errors
  }
}

/* ─────────────────────────────────────────
   4. SOUND ENGINE (Web Audio API)
──────────────────────────────────────────── */
let audioCtx = null;

/** Lazily create the AudioContext on first user interaction */
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/**
 * Play a tone using oscillator
 * @param {number} freq - frequency in Hz
 * @param {string} type - oscillator type
 * @param {number} duration - duration in seconds
 * @param {number} vol - volume 0-1
 */
function playTone(freq, type='sine', duration=0.15, vol=0.3) {
  if (!state.soundEnabled) return;
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

const SFX = {
  click() { playTone(440, 'sine',    0.08, 0.2); },
  aiMove() { playTone(280, 'triangle',0.1, 0.15); },
  win()  {
    // Happy ascending arpeggio
    [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f,'sine',0.25,0.3), i*100));
  },
  lose() {
    // Sad descending arpeggio
    [400,350,300,250].forEach((f,i) => setTimeout(() => playTone(f,'sawtooth',0.2,0.2), i*120));
  },
  draw() {
    playTone(300, 'square', 0.3, 0.15);
    setTimeout(() => playTone(350, 'square', 0.3, 0.15), 200);
  }
};

/* ─────────────────────────────────────────
   5. PARTICLE BACKGROUND
──────────────────────────────────────────── */
const bgCtx    = bgCanvas.getContext('2d');
let particles  = [];
let animFrame;

function resizeBgCanvas() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
}

class Particle {
  constructor() { this.reset(true); }

  reset(init=false) {
    this.x    = Math.random() * bgCanvas.width;
    this.y    = init ? Math.random() * bgCanvas.height : bgCanvas.height + 10;
    this.r    = Math.random() * 1.8 + 0.4;
    this.speed= Math.random() * 0.4 + 0.1;
    this.dx   = (Math.random() - 0.5) * 0.3;
    this.alpha= Math.random() * 0.6 + 0.1;
    this.hue  = Math.random() < 0.7 ? 200 : 260; // blue or purple
  }

  update() {
    this.y -= this.speed;
    this.x += this.dx;
    if (this.y < -10) this.reset();
  }

  draw() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    bgCtx.beginPath();
    bgCtx.arc(this.x, this.y, this.r, 0, Math.PI*2);
    bgCtx.fillStyle = isDark
      ? `hsla(${this.hue}, 100%, 70%, ${this.alpha})`
      : `hsla(${this.hue}, 80%, 40%, ${this.alpha * 0.4})`;
    bgCtx.fill();
  }
}

function initParticles(count=120) {
  particles = Array.from({length: count}, () => new Particle());
}

function animateBg() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  particles.forEach(p => { p.update(); p.draw(); });
  animFrame = requestAnimationFrame(animateBg);
}

/* ─────────────────────────────────────────
   6. CONFETTI ENGINE
──────────────────────────────────────────── */
const confCtx  = confettiCanvas.getContext('2d');
let confPieces = [];
let confActive = false;
let confFrame;

class ConfettiPiece {
  constructor() {
    confettiCanvas.width  = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    this.x     = Math.random() * confettiCanvas.width;
    this.y     = -20;
    this.w     = Math.random() * 12 + 6;
    this.h     = Math.random() * 6  + 4;
    this.color = `hsl(${Math.random()*360},90%,60%)`;
    this.rot   = Math.random() * Math.PI * 2;
    this.rotV  = (Math.random() - 0.5) * 0.15;
    this.vy    = Math.random() * 4 + 3;
    this.vx    = (Math.random() - 0.5) * 3;
    this.alpha = 1;
  }

  update() {
    this.y   += this.vy;
    this.x   += this.vx;
    this.rot += this.rotV;
    this.vy  += 0.08; // gravity
    if (this.y > confettiCanvas.height - 40) this.alpha -= 0.025;
  }

  draw() {
    confCtx.save();
    confCtx.globalAlpha = Math.max(0, this.alpha);
    confCtx.translate(this.x, this.y);
    confCtx.rotate(this.rot);
    confCtx.fillStyle = this.color;
    confCtx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
    confCtx.restore();
  }

  isDead() { return this.alpha <= 0; }
}

function launchConfetti() {
  confActive = true;
  confettiCanvas.width  = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
  confPieces = Array.from({length: 180}, () => new ConfettiPiece());

  function animConf() {
    confCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confPieces = confPieces.filter(p => !p.isDead());
    confPieces.forEach(p => { p.update(); p.draw(); });
    if (confPieces.length > 0) {
      confFrame = requestAnimationFrame(animConf);
    } else {
      confActive = false;
      confCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }
  animConf();
}

/* ─────────────────────────────────────────
   7. MINIMAX WITH ALPHA-BETA PRUNING
──────────────────────────────────────────── */

/**
 * Check if a player has won on the given board.
 * Returns the winning combo array or null.
 * @param {Array} board
 * @param {string} player - 'X' or 'O'
 * @returns {Array|null}
 */
function checkWinner(board, player) {
  for (const combo of WIN_COMBOS) {
    if (combo.every(i => board[i] === player)) return combo;
  }
  return null;
}

/**
 * Check if the board is full (no empty cells).
 * @param {Array} board
 * @returns {boolean}
 */
function isBoardFull(board) {
  return board.every(cell => cell !== EMPTY);
}

/**
 * Score a terminal board state.
 * AI wins: +10, Human wins: -10, draw: 0
 * Depth is subtracted/added to prefer faster wins/slower losses.
 * @param {Array} board
 * @param {number} depth
 * @returns {number|null} score or null if not terminal
 */
function scoreTerminal(board, depth) {
  if (checkWinner(board, AI))    return 10 - depth;
  if (checkWinner(board, HUMAN)) return depth - 10;
  if (isBoardFull(board))        return 0;
  return null; // not terminal
}

/**
 * Minimax algorithm with Alpha-Beta pruning.
 * Recursively evaluates all possible game states.
 *
 * @param {Array}  board       - current board
 * @param {number} depth       - current recursion depth
 * @param {boolean} isMaximizing - true = AI's turn (O), false = Human's turn (X)
 * @param {number} alpha       - best score for maximizer found so far
 * @param {number} beta        - best score for minimizer found so far
 * @returns {number} best score
 */
function minimax(board, depth, isMaximizing, alpha=-Infinity, beta=Infinity) {
  // --- Terminal state check ---
  const terminal = scoreTerminal(board, depth);
  if (terminal !== null) return terminal;

  const availableMoves = board
    .map((v, i) => v === EMPTY ? i : -1)
    .filter(i => i !== -1);

  if (isMaximizing) {
    // AI's turn: maximize score
    let best = -Infinity;
    for (const move of availableMoves) {
      board[move] = AI;
      const score = minimax(board, depth + 1, false, alpha, beta);
      board[move] = EMPTY;

      best  = Math.max(best, score);
      alpha = Math.max(alpha, best);

      // Alpha-Beta pruning: prune remaining branches
      if (beta <= alpha) break;
    }
    return best;
  } else {
    // Human's turn: minimize score
    let best = Infinity;
    for (const move of availableMoves) {
      board[move] = HUMAN;
      const score = minimax(board, depth + 1, true, alpha, beta);
      board[move] = EMPTY;

      best = Math.min(best, score);
      beta = Math.min(beta, best);

      // Alpha-Beta pruning
      if (beta <= alpha) break;
    }
    return best;
  }
}

/**
 * Find the best move for the AI.
 * Returns the index of the optimal cell.
 * @param {Array} board
 * @returns {number} best move index
 */
function getBestMove(board) {
  let bestScore = -Infinity;
  let bestMove  = -1;

  const available = board
    .map((v, i) => v === EMPTY ? i : -1)
    .filter(i => i !== -1);

  // If center is free and it's the first move, prefer it (optimization)
  if (available.length === 9) return 4;

  for (const move of available) {
    board[move] = AI;
    const score = minimax(board, 0, false, -Infinity, Infinity);
    board[move] = EMPTY;

    if (score > bestScore) {
      bestScore = score;
      bestMove  = move;
    }
  }
  return bestMove;
}

/**
 * Determine the AI's move based on current difficulty.
 *
 * Easy:   70% random, 30% optimal
 * Medium: 30% random, 70% optimal
 * Hard:   Always optimal (unbeatable)
 *
 * @param {Array} board
 * @returns {number} chosen move index
 */
function getAIMove(board) {
  const empty = board
    .map((v, i) => v === EMPTY ? i : -1)
    .filter(i => i !== -1);

  if (empty.length === 0) return -1;

  const rng = Math.random();
  const randomMove = empty[Math.floor(Math.random() * empty.length)];

  switch(state.difficulty) {
    case 'easy':
      // 70% random
      return rng < 0.70 ? randomMove : getBestMove(board);

    case 'medium':
      // 30% random — looks at 1-move threats first
      if (rng < 0.30) return randomMove;
      // Check if AI can win in one move
      for (const i of empty) {
        board[i] = AI;
        if (checkWinner(board, AI)) { board[i] = EMPTY; return i; }
        board[i] = EMPTY;
      }
      // Check if Human can win and block it
      for (const i of empty) {
        board[i] = HUMAN;
        if (checkWinner(board, HUMAN)) { board[i] = EMPTY; return i; }
        board[i] = EMPTY;
      }
      return getBestMove(board);

    case 'hard':
    default:
      return getBestMove(board);
  }
}

/* ─────────────────────────────────────────
   8. RENDER FUNCTIONS
──────────────────────────────────────────── */

/** Update cell DOM elements from current board state */
function renderBoard() {
  cells.forEach((cell, i) => {
    const val = state.board[i];
    cell.textContent = val || '';
    cell.className   = 'cell';
    if (val) {
      cell.classList.add('taken', val.toLowerCase());
    }
    // Accessibility
    cell.setAttribute('aria-label',
      val ? `Cell ${i+1}: ${val}` : `Cell ${i+1}: empty`);
  });
}

/** Update the turn indicator text and dot */
function renderTurnIndicator() {
  const isHuman = state.currentPlayer === HUMAN;
  turnDot.className  = 'turn-dot' + (isHuman ? '' : ' ai');
  turnText.textContent = isHuman ? 'YOUR TURN' : 'AI THINKING';
}

/** Update scoreboard DOM */
function renderScores(highlight) {
  scoreHuman.textContent = state.scores.human;
  scoreAI.textContent    = state.scores.ai;
  scoreDraws.textContent = state.scores.draws;

  if (highlight) {
    const el = highlight === 'human' ? scoreHuman
             : highlight === 'ai'    ? scoreAI
             : scoreDraws;
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 400);
  }
}

/** Show/hide the AI thinking animation */
function setAIThinking(visible) {
  aiThinking.classList.toggle('visible', visible);
}

/** Draw the animated win line on the SVG overlay */
function drawWinLine(combo) {
  const key = combo.join('');
  const coords = WIN_LINE_COORDS[key];
  if (!coords) return;

  // Calculate total length for dash animation
  const dx = coords.x2 - coords.x1;
  const dy = coords.y2 - coords.y1;
  const len = Math.sqrt(dx*dx + dy*dy);

  winLineEl.setAttribute('x1', coords.x1);
  winLineEl.setAttribute('y1', coords.y1);
  winLineEl.setAttribute('x2', coords.x2);
  winLineEl.setAttribute('y2', coords.y2);
  winLineEl.style.strokeDasharray  = len;
  winLineEl.style.strokeDashoffset = len;

  // Force reflow before animating
  winLineEl.getBoundingClientRect();
  winLineEl.classList.add('animate');
}

/** Clear the win line */
function clearWinLine() {
  winLineEl.classList.remove('animate');
  winLineEl.setAttribute('x1', 0); winLineEl.setAttribute('y1', 0);
  winLineEl.setAttribute('x2', 0); winLineEl.setAttribute('y2', 0);
}

/* ─────────────────────────────────────────
   9. MODAL
──────────────────────────────────────────── */
const OUTCOMES = {
  win:  { emoji:'🏆', title:'YOU WIN!',    subtitle:'Incredible! The AI bows before your genius.', gradient:'linear-gradient(135deg, #00c8ff, #00ffea)' },
  lose: { emoji:'🤖', title:'AI WINS!',    subtitle:'The neural net was too strong this time.', gradient:'linear-gradient(135deg, #ff4d6a, #ff8800)' },
  draw: { emoji:'⚡', title:"IT'S A DRAW!", subtitle:'A perfect standoff. Minds in equilibrium.', gradient:'linear-gradient(135deg, #7b2fff, #00c8ff)' }
};

function showModal(outcome) {
  const data = OUTCOMES[outcome];
  modalEmoji.textContent    = data.emoji;
  modalTitle.textContent    = data.title;
  modalSubtitle.textContent = data.subtitle;
  modalTitle.style.backgroundImage = data.gradient;
  modalOverlay.classList.add('show');
}

function hideModal() {
  modalOverlay.classList.remove('show');
}

/* ─────────────────────────────────────────
   10. CORE GAME LOGIC
──────────────────────────────────────────── */

/** Initialise / reset the board for a new round */
function startGame() {
  state.board         = Array(9).fill(EMPTY);
  state.currentPlayer = HUMAN;
  state.gameOver      = false;

  clearWinLine();
  renderBoard();
  renderTurnIndicator();
  setAIThinking(false);
  boardEl.style.pointerEvents = '';
  hideModal();
}

/** Handle a human clicking cell at index i */
function handleHumanMove(index) {
  if (state.gameOver)                 return;
  if (state.currentPlayer !== HUMAN)  return;
  if (state.board[index] !== EMPTY)   return;

  SFX.click();
  placeMove(index, HUMAN);

  if (state.gameOver) return;

  // Switch to AI
  state.currentPlayer = AI;
  renderTurnIndicator();
  boardEl.style.pointerEvents = 'none'; // disable input while AI thinks

  // Small delay so the human can see their move before AI responds
  setTimeout(handleAITurn, 400);
}

/** Execute AI's turn */
function handleAITurn() {
  if (state.gameOver) return;
  setAIThinking(true);

  // Use requestAnimationFrame so the thinking animation renders first
  requestAnimationFrame(() => {
    setTimeout(() => {
      const move = getAIMove([...state.board]);
      setAIThinking(false);
      if (move === -1) return; // no moves left (should not happen)

      SFX.aiMove();
      placeMove(move, AI);

      if (!state.gameOver) {
        state.currentPlayer = HUMAN;
        renderTurnIndicator();
        boardEl.style.pointerEvents = '';
      }
    }, 200); // small artificial delay for realism
  });
}

/** Place a mark on the board and check for game end */
function placeMove(index, player) {
  state.board[index] = player;
  renderBoard();

  // Animate the placed cell
  cells[index].style.animation = 'none';
  void cells[index].offsetWidth; // trigger reflow
  cells[index].style.animation = '';

  // Check winner
  const winCombo = checkWinner(state.board, player);
  if (winCombo) {
    endGame(player, winCombo);
    return;
  }

  // Check draw
  if (isBoardFull(state.board)) {
    endGame(null, null);
  }
}

/** End the game: update scores, show modal, play sound */
function endGame(winner, winCombo) {
  state.gameOver = true;
  boardEl.style.pointerEvents = 'none';

  if (winner) {
    // Highlight winning cells
    winCombo.forEach(i => cells[i].classList.add('winner'));
    drawWinLine(winCombo);

    if (winner === HUMAN) {
      state.scores.human++;
      renderScores('human');
      SFX.win();
      launchConfetti();
      setTimeout(() => showModal('win'), 800);
    } else {
      state.scores.ai++;
      renderScores('ai');
      SFX.lose();
      setTimeout(() => showModal('lose'), 800);
    }
  } else {
    // Draw
    state.scores.draws++;
    renderScores('draws');
    SFX.draw();
    setTimeout(() => showModal('draw'), 600);
  }

  saveToStorage();
  turnText.textContent = winner
    ? (winner === HUMAN ? 'YOU WIN!' : 'AI WINS!')
    : 'DRAW!';
}

/* ─────────────────────────────────────────
   11. DIFFICULTY
──────────────────────────────────────────── */
function setDifficulty(level) {
  state.difficulty = level;
  currentDiffDisplay.textContent = level.toUpperCase();

  diffBtns.forEach(btn => {
    const active = btn.dataset.level === level;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });

  saveToStorage();
}

/* ─────────────────────────────────────────
   12. THEME TOGGLE
──────────────────────────────────────────── */
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀' : '🌙';
  saveToStorage();
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

/* ─────────────────────────────────────────
   13. SOUND TOGGLE
──────────────────────────────────────────── */
function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
  saveToStorage();
}

/* ─────────────────────────────────────────
   14. RESET SCORES
──────────────────────────────────────────── */
function resetScores() {
  state.scores = { human:0, ai:0, draws:0 };
  renderScores(null);
  saveToStorage();
}

/* ─────────────────────────────────────────
   15. KEYBOARD ACCESSIBILITY
──────────────────────────────────────────── */
function handleKeyboard(e) {
  const cell = e.target.closest('.cell');
  if (!cell) return;

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleHumanMove(parseInt(cell.dataset.index));
  }

  // Arrow key navigation
  const index = parseInt(cell.dataset.index);
  const arrows = { ArrowRight:1, ArrowLeft:-1, ArrowDown:3, ArrowUp:-3 };
  if (arrows[e.key] !== undefined) {
    e.preventDefault();
    const next = index + arrows[e.key];
    if (next >= 0 && next < 9) cells[next].focus();
  }
}

/* ─────────────────────────────────────────
   16. LOADING SCREEN ANIMATION
──────────────────────────────────────────── */
const loadingSteps = [
  'INITIALIZING AI CORE...',
  'LOADING MINIMAX ENGINE...',
  'CALIBRATING ALPHA-BETA...',
  'RENDERING GAME BOARD...',
  'READY TO BATTLE!'
];

function runLoader() {
  let progress = 0;
  let step = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 18 + 8;
    if (progress >= 100) progress = 100;
    loaderBar.style.width = progress + '%';

    const stepIndex = Math.min(Math.floor((progress / 100) * loadingSteps.length), loadingSteps.length - 1);
    if (stepIndex !== step) {
      step = stepIndex;
      loaderText.textContent = loadingSteps[step];
    }

    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        loader.classList.add('hide');
        appWrapper.style.opacity = '1';
      }, 400);
    }
  }, 80);
}

/* ─────────────────────────────────────────
   17. INIT — WIRE EVERYTHING TOGETHER
──────────────────────────────────────────── */
function init() {
  // Load saved state
  loadFromStorage();

  // Apply saved theme
  applyTheme(state.theme);
  soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';

  // Apply saved difficulty
  setDifficulty(state.difficulty);

  // Render initial scores
  renderScores(null);

  // Start the game board
  startGame();

  // --- Particle background ---
  resizeBgCanvas();
  initParticles();
  animateBg();

  // --- Event Listeners ---

  // Cell clicks
  cells.forEach(cell => {
    cell.addEventListener('click', () => {
      handleHumanMove(parseInt(cell.dataset.index));
    });
    // Touch optimization: prevent 300ms delay on mobile
    cell.addEventListener('touchend', (e) => {
      e.preventDefault();
      handleHumanMove(parseInt(cell.dataset.index));
    }, { passive: false });
  });

  // Keyboard navigation
  boardEl.addEventListener('keydown', handleKeyboard);

  // Buttons
  restartBtn.addEventListener('click', () => { SFX.click(); startGame(); });
  newGameBtn.addEventListener('click',  () => { SFX.click(); startGame(); });
  resetScoreBtn.addEventListener('click', () => {
    SFX.click();
    if (confirm('Reset all scores?')) resetScores();
  });

  // Difficulty buttons
  diffBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      SFX.click();
      setDifficulty(btn.dataset.level);
      startGame(); // restart with new difficulty
    });
  });

  // Theme & sound toggles
  themeToggle.addEventListener('click', () => { SFX.click(); toggleTheme(); });
  soundToggle.addEventListener('click', toggleSound);

  // Modal buttons
  modalPlayAgain.addEventListener('click', () => { SFX.click(); hideModal(); startGame(); });
  modalClose.addEventListener('click',     () => { SFX.click(); hideModal(); });
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) { SFX.click(); hideModal(); }
  });

  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal();
  });

  // Resize handlers
  window.addEventListener('resize', () => {
    resizeBgCanvas();
    confettiCanvas.width  = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  });

  // --- Start loading animation ---
  runLoader();
}

// Kick everything off once the DOM is ready
document.addEventListener('DOMContentLoaded', init);
