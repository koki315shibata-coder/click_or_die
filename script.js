// Game variables
function getLevelParams(idx) {
  const baseLevels = [
    { name: 'RECRUIT', window: 1200, threat: 'LOW' },
    { name: 'SOLDIER', window: 1000, threat: 'MEDIUM' },
    { name: 'VETERAN', window: 800, threat: 'HIGH' },
    { name: 'ELITE', window: 650, threat: 'EXTREME' },
    { name: 'OMEGA', window: 500, threat: 'CRITICAL' }
  ];
  
  let actualLevel = idx + 1;
  let params = { level: actualLevel };
  
  if (idx < 5) {
    params.name = baseLevels[idx].name;
    params.window = baseLevels[idx].window;
    params.threat = baseLevels[idx].threat;
    params.pulseDur = 0.8 - (idx * 0.1); 
  } else {
    let diff = idx - 4;
    let pluses = '+'.repeat(Math.min(diff, 3)); 
    params.name = 'OMEGA' + pluses;
    params.window = Math.max(180, 500 - (diff * 25)); // smoothly reduce window
    
    if (actualLevel < 10) params.threat = 'LETHAL';
    else if (actualLevel < 15) params.threat = 'TERMINAL';
    else params.threat = 'GOD-TIER';
    
    params.pulseDur = Math.max(0.1, 0.4 - (diff * 0.03));
  }
  
  return params;
}

let state = 'START'; // START, WAIT, FIRE, RESULT
let currentLevelIdx = 0;
let streak = 0;
let bestScore = localStorage.getItem('cod_best_score') || null;

let waitTimeout = null;
let fireTimeout = null;
let autoNextTimeout = null;
let startTime = 0;

// UI Elements
const gameArea = document.getElementById('game-area');
const targetStatusText = document.getElementById('target-status-text');
const mainBtn = document.getElementById('main-btn');
const statusPanel = document.getElementById('status-panel');
const levelDisplay = document.getElementById('level-display');
const threatDisplay = document.getElementById('threat-display');
const bestScoreEl = document.getElementById('best-score');
const lastScoreEl = document.getElementById('last-score');
const streakCounterEl = document.getElementById('streak-counter');
const resultTimeEl = document.getElementById('result-time');
const resultRankEl = document.getElementById('result-rank');
const flashOverlay = document.getElementById('flash-overlay');
const difficultyContainer = document.getElementById('difficulty-selector-container');
const diffBtns = document.querySelectorAll('.diff-btn');

// Wait Phase Sound Interval
let beepInterval = null;

// Audio Context
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, duration, vol=0.1) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playLockOn() {
  playTone(800, 'sine', 0.1, 0.05);
}

function playFire() {
  playTone(200, 'square', 0.2, 0.2);
  playTone(150, 'sawtooth', 0.3, 0.2);
}

function playSuccess() {
  playTone(600, 'sine', 0.1, 0.1);
  setTimeout(() => playTone(800, 'sine', 0.3, 0.1), 100);
}

function playFail() {
  playTone(100, 'sawtooth', 0.5, 0.2);
}

// Game Logic
function resetUI() {
  resultTimeEl.classList.add('hidden');
  resultRankEl.classList.add('hidden');
  gameArea.classList.remove('screen-shake');
  
  // ensure flash overlay is cleared
  flashOverlay.className = '';
  void flashOverlay.offsetWidth;
}

function startGame() {
  if (autoNextTimeout) clearTimeout(autoNextTimeout);
  if (beepInterval) clearInterval(beepInterval);
  resetUI();
  
  state = 'WAIT';
  gameArea.className = 'state-wait';
  targetStatusText.innerText = 'ENEMY LOCKING ON...';
  
  statusPanel.innerText = 'WAIT FOR GREEN';
  statusPanel.style.color = 'var(--accent-red)';
  statusPanel.style.borderColor = 'var(--accent-red)';
  
  mainBtn.style.display = 'none';
  
  const lvlParams = getLevelParams(currentLevelIdx);
  // hide difficulty selector when game is running
  difficultyContainer.style.opacity = '0.3';
  difficultyContainer.style.pointerEvents = 'none';
  
  // Set pulse duration CSS variable
  document.documentElement.style.setProperty('--pulse-dur', `${lvlParams.pulseDur}s`);

  // Delay logic scales with difficulty
  const minDelay = Math.max(800, 1500 - (currentLevelIdx * 50)); 
  const maxDelay = Math.min(6000, 3500 + (currentLevelIdx * 200));
  const delay = Math.random() * (maxDelay - minDelay) + minDelay;
  
  // Play subtle lock-on beep periodically during wait phase
  beepInterval = setInterval(playLockOn, 500);

  waitTimeout = setTimeout(() => {
    clearInterval(beepInterval);
    firePhase();
  }, delay);
}

function firePhase() {
  state = 'FIRE';
  gameArea.className = 'state-fire';
  targetStatusText.innerText = 'FIRE!';
  targetStatusText.style.color = '#fff';
  
  statusPanel.innerText = 'SHOOT NOW!';
  statusPanel.style.color = 'var(--accent-green)';
  statusPanel.style.borderColor = 'var(--accent-green)';
  
  flashScreen('white');
  playFire();
  
  startTime = performance.now();
  
  const currentLevel = getLevelParams(currentLevelIdx);
  fireTimeout = setTimeout(() => {
    failGame('TOO SLOW');
  }, currentLevel.window);
}

function successGame() {
  const rt = Math.floor(performance.now() - startTime);
  clearTimeout(fireTimeout);
  
  state = 'RESULT';
  gameArea.className = 'state-success';
  targetStatusText.innerText = 'TARGET DOWN';
  
  statusPanel.innerText = 'ELIMINATED';
  statusPanel.style.color = 'var(--text-muted)';
  statusPanel.style.borderColor = 'rgba(255,255,255,0.1)';
  
  playSuccess();
  streak++;
  
  // Level progression
  if (streak % 1 === 0) {
    currentLevelIdx++;
  }

  updateSelectorUI();

  updateBestScore(rt);
  lastScoreEl.innerText = rt + ' ms';
  
  showResult(rt);
  updateSidebar();
  
  mainBtn.style.display = 'block';
  mainBtn.innerText = 'CONTINUE';
  
  autoNextTimeout = setTimeout(() => {
    if (state === 'RESULT') startGame();
  }, 1200);
}

function failGame(reason) {
  clearTimeout(waitTimeout);
  clearTimeout(fireTimeout);
  if (beepInterval) clearInterval(beepInterval);
  
  // Show selector again
  difficultyContainer.style.opacity = '1';
  difficultyContainer.style.pointerEvents = 'auto';
  
  state = 'RESULT';
  gameArea.className = 'state-start'; // Reset visuals roughly
  gameArea.classList.add('screen-shake');
  
  flashScreen('red');
  playFail();
  
  targetStatusText.innerText = 'YOU GOT SHOT';
  targetStatusText.style.color = 'var(--accent-red)';
  
  statusPanel.innerText = reason;
  statusPanel.style.color = 'var(--accent-red)';
  statusPanel.style.borderColor = 'var(--accent-red)';
  
  resultTimeEl.innerText = 'FAILED';
  resultTimeEl.style.color = 'var(--accent-red)';
  resultTimeEl.classList.remove('hidden');
  
  resultRankEl.innerText = reason;
  resultRankEl.className = 'rank-slow';
  resultRankEl.classList.remove('hidden');
  
  streak = 0;
  // If we fail on a high level, drop back to the level we manually started at (or 1)
  const activeBtn = Array.from(diffBtns).find(b => b.classList.contains('active'));
  currentLevelIdx = activeBtn ? parseInt(activeBtn.dataset.level) - 1 : 0;
  
  updateSelectorUI();
  updateSidebar();
  
  mainBtn.style.display = 'block';
  mainBtn.innerText = 'RETRY';
}

function showResult(rt) {
  resultTimeEl.innerText = rt + ' ms';
  resultTimeEl.style.color = '#fff';
  resultTimeEl.classList.remove('hidden');
  
  let rank = '';
  let rankClass = '';
  if (rt < 150) { rank = 'GODLIKE'; rankClass = 'rank-godlike'; }
  else if (rt < 200) { rank = 'ELITE'; rankClass = 'rank-elite'; }
  else if (rt < 250) { rank = 'SHARP'; rankClass = 'rank-sharp'; }
  else { rank = 'TOO SLOW'; rankClass = 'rank-slow'; }
  
  resultRankEl.innerText = rank;
  resultRankEl.className = rankClass;
  resultRankEl.classList.remove('hidden');
}

function flashScreen(color) {
  flashOverlay.className = '';
  void flashOverlay.offsetWidth; // trigger reflow
  flashOverlay.className = color === 'white' ? 'flash-white' : 'flash-red';
}

function updateBestScore(rt) {
  if (!bestScore || rt < bestScore) {
    bestScore = rt;
    localStorage.setItem('cod_best_score', bestScore);
  }
}

function updateSidebar() {
  const lvlParams = getLevelParams(currentLevelIdx);
  levelDisplay.innerText = `LEVEL ${lvlParams.level} — ${lvlParams.name}`;
  threatDisplay.innerText = `THREAT: ${lvlParams.threat}`;
  
  if (bestScore) bestScoreEl.innerText = bestScore + ' ms';
  streakCounterEl.innerText = 'x' + streak;
}

function updateSelectorUI() {
  diffBtns.forEach(btn => btn.classList.remove('active'));
  if (currentLevelIdx < 5) {
    const activeBtn = Array.from(diffBtns).find(b => parseInt(b.dataset.level) === (currentLevelIdx + 1));
    if (activeBtn) activeBtn.classList.add('active');
  }
}

// Event Listeners
diffBtns.forEach(btn => {
  const handler = (e) => {
    e.stopPropagation();
    if (state !== 'START' && state !== 'RESULT') return;
    
    currentLevelIdx = parseInt(e.target.dataset.level) - 1;
    streak = 0; 
    updateSelectorUI();
    updateSidebar();
  };
  btn.addEventListener('mousedown', handler);
  btn.addEventListener('touchstart', handler);
});

document.body.addEventListener('mousedown', (e) => {
  if (e.target.closest('#difficulty-selector-container')) return;
  initAudio();
  
  // Important logic to make whole screen act as the trigger
  if (state === 'START' || state === 'RESULT') {
    startGame();
  } else if (state === 'WAIT') {
    failGame('TOO EARLY');
  } else if (state === 'FIRE') {
    successGame();
  }
});

// Setup Initial UI
updateSidebar();
