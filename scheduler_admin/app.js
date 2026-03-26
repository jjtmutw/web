const STORAGE_KEYS = {
  currentUser: "ag_pacman_current_user",
  userPrefix: "ag_pacman_user_data_",
  audioEnabled: "ag_pacman_audio_enabled",
  audioStyle: "ag_pacman_audio_style",
};

const TILE = 28;
const TICK_MS = 480;
const GAMEPAD_AXIS_THRESHOLD = 0.55;
const WIN_BONUS = 120;
const FRIGHTENED_MS = 5600;

const MAZE = [
  "###############",
  "#o....#.#....o#",
  "#.###.#.#.###.#",
  "#.............#",
  "#.###.###.###.#",
  "#.............#",
  "###.#.#####.#.#",
  "#...#...#...#.#",
  "#.###.#.#.###.#",
  "#.....#.#.....#",
  "#.###.###.###.#",
  "#o...........o#",
  "#.###.#.#.###.#",
  "#.....#.#.....#",
  "###############",
];

const DIRECTION_MAP = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const KEY_TO_DIRECTION = {
  arrowup: "up", w: "up",
  arrowdown: "down", s: "down",
  arrowleft: "left", a: "left",
  arrowright: "right", d: "right",
};

const CONTROLLER_MODES = {
  keyboard: {
    title: "Keyboard",
    detail: "鍵盤模式已啟用，可直接用方向鍵或 WASD 控制 Pac-Man。",
    tip: "Keyboard 模式不需要額外裝置，可直接開始遊戲。",
    waiting: "鍵盤模式已啟用，可直接開始遊戲。",
    missing: "鍵盤模式已啟用，可直接用方向鍵或 WASD 控制。",
    disconnected: "鍵盤模式已啟用。",
    cleared: "已切回鍵盤模式。",
    connectedLabel: "keyboard",
    preferredMatcher: () => false,
  },
  usb: {
    title: "USB Gamepad",
    detail: "插入 USB Gamepad 後，按下任何按鍵，再點擊連接控制器。",
    tip: "支援方向鍵區、左類比與常見 A / Start 鍵。",
    waiting: "尚未偵測到 USB Gamepad，請插入並按下任意按鍵後再重新連接。",
    missing: "沒有找到 USB Gamepad，請確認裝置已被瀏覽器辨識。",
    disconnected: "USB Gamepad 已斷開。",
    cleared: "USB Gamepad 連線已清除。",
    connectedLabel: "USB gamepad",
    preferredMatcher: () => true,
  },
  magicsee: {
    title: "Magicsee",
    detail: "若你使用 Magicsee 控制器，請先配對或接上裝置，再點擊連接控制器。",
    tip: "若瀏覽器將 Magicsee 視為 gamepad，可用方向鍵區或左類比操作。",
    waiting: "尚未偵測到 Magicsee，請確認裝置已連接後再重試。",
    missing: "沒有找到 Magicsee 控制器。",
    disconnected: "Magicsee 已斷開。",
    cleared: "Magicsee 連線已清除。",
    connectedLabel: "Magicsee controller",
    preferredMatcher: (gamepad) => /magicsee/i.test(gamepad.id),
  },
};

const state = {
  auth: { isLoggedIn: false, username: "", loginTime: null },
  game: {
    isPlaying: false, currentScore: 0, bestScore: 0, lastScore: 0, gamesPlayed: 0,
    updatedAt: null, lastFinishedAt: null, history: [], lives: 3, pelletsLeft: 0, frightenedUntil: 0,
  },
  runtime: { timerId: null, startedAt: null, endedAt: null, direction: { x: 0, y: 0 }, queuedDirection: { x: 0, y: 0 } },
  controller: {
    mode: "keyboard", source: "keyboard", status: "Ready", detail: CONTROLLER_MODES.keyboard.detail,
    gamepadIndex: null, gamepadName: "", frameId: null, lastGamepadDirection: null, lastStartPressed: false,
  },
  audio: { enabled: true, style: "classic", context: null, wakaStep: 0, frightenedPulse: 0, ghostHumStep: 0 },
  world: null,
  player: null,
  ghosts: [],
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  usernameInput: document.querySelector("#username-input"),
  loginMessage: document.querySelector("#login-message"),
  logoutButton: document.querySelector("#logout-button"),
  audioToggleButton: document.querySelector("#audio-toggle-button"),
  audioStyleSelect: document.querySelector("#audio-style-select"),
  userStatus: document.querySelector("#user-status"),
  controllerTitle: document.querySelector("#controller-title"),
  controllerStatus: document.querySelector("#controller-status"),
  controllerDetail: document.querySelector("#controller-detail"),
  controllerModeSelect: document.querySelector("#controller-mode-select"),
  controllerTip: document.querySelector("#controller-tip"),
  connectControllerButton: document.querySelector("#connect-controller-button"),
  disconnectControllerButton: document.querySelector("#disconnect-controller-button"),
  statUsername: document.querySelector("#stat-username"),
  statLoginTime: document.querySelector("#stat-login-time"),
  statCurrentScore: document.querySelector("#stat-current-score"),
  statBestScore: document.querySelector("#stat-best-score"),
  statLastScore: document.querySelector("#stat-last-score"),
  statGamesPlayed: document.querySelector("#stat-games-played"),
  statUpdatedAt: document.querySelector("#stat-updated-at"),
  statLastFinishedAt: document.querySelector("#stat-last-finished-at"),
  historyList: document.querySelector("#history-list"),
  livesBadge: document.querySelector("#lives-badge"),
  pelletsBadge: document.querySelector("#pellets-badge"),
  canvas: document.querySelector("#game-canvas"),
  gameOverlay: document.querySelector("#game-overlay"),
  overlayTitle: document.querySelector("#overlay-title"),
  overlayCopy: document.querySelector("#overlay-copy"),
  startButton: document.querySelector("#start-button"),
};

const ctx = elements.canvas.getContext("2d");

const getControllerConfig = () => CONTROLLER_MODES[state.controller.mode];
const readJson = (key) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } };
const writeJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const getCurrentUser = () => readJson(STORAGE_KEYS.currentUser);
const setCurrentUser = (payload) => writeJson(STORAGE_KEYS.currentUser, payload);
const clearCurrentUser = () => localStorage.removeItem(STORAGE_KEYS.currentUser);
const getUserDataKey = (username) => `${STORAGE_KEYS.userPrefix}${username}`;
const readAudioEnabled = () => localStorage.getItem(STORAGE_KEYS.audioEnabled) !== "false";
const writeAudioEnabled = (value) => localStorage.setItem(STORAGE_KEYS.audioEnabled, String(value));
const readAudioStyle = () => localStorage.getItem(STORAGE_KEYS.audioStyle) || "classic";
const writeAudioStyle = (value) => localStorage.setItem(STORAGE_KEYS.audioStyle, value);

function createDefaultUserData(username) {
  return { username, loginHistory: [], bestScore: 0, lastScore: 0, gamesPlayed: 0, updatedAt: null, lastFinishedAt: null, history: [] };
}

function getUserData(username) {
  return readJson(getUserDataKey(username)) || createDefaultUserData(username);
}

function saveUserData(username, payload) {
  writeJson(getUserDataKey(username), payload);
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

function setMessage(text, type = "") {
  elements.loginMessage.textContent = text;
  elements.loginMessage.className = "inline-message";
  if (type) elements.loginMessage.classList.add(type === "error" ? "is-error" : "is-success");
}

function syncAudioUi() {
  elements.audioToggleButton.textContent = state.audio.enabled ? "音效：開" : "音效：關";
  elements.audioToggleButton.setAttribute("aria-pressed", state.audio.enabled ? "true" : "false");
  elements.audioStyleSelect.value = state.audio.style;
}

async function ensureAudioReady() {
  if (!state.audio.enabled) return null;
  if (!state.audio.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    state.audio.context = new AudioContextClass();
  }
  if (state.audio.context.state === "suspended") {
    try { await state.audio.context.resume(); } catch { return null; }
  }
  return state.audio.context;
}

async function playTone({
  frequency,
  duration = 0.09,
  type = "square",
  volume = 0.075,
  delay = 0,
  detune = 0,
  attack = 0.004,
  release = 0.045,
  brightness = 0.78,
}) {
  const audioContext = await ensureAudioReady();
  if (!audioContext) return;

  const primary = audioContext.createOscillator();
  const layer = audioContext.createOscillator();
  const filter = audioContext.createBiquadFilter();
  const gainNode = audioContext.createGain();
  const startAt = audioContext.currentTime + delay;
  const endAt = startAt + duration;

  primary.type = type;
  primary.frequency.setValueAtTime(frequency, startAt);
  primary.detune.setValueAtTime(detune, startAt);

  layer.type = type === "square" ? "square" : "triangle";
  layer.frequency.setValueAtTime(frequency * 0.5, startAt);
  layer.detune.setValueAtTime(-detune || -3, startAt);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900 + brightness * 2200, startAt);
  filter.Q.setValueAtTime(1.4, startAt);

  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(volume, startAt + attack);
  gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.55), endAt - Math.min(release, duration * 0.5));
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

  primary.connect(filter);
  layer.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(audioContext.destination);

  primary.start(startAt);
  layer.start(startAt);
  primary.stop(endAt + 0.03);
  layer.stop(endAt + 0.03);
}

function playEffect(name, options = {}) {
  if (!state.audio.enabled) return;
  if (state.audio.style === "modern") {
    if (name === "waka") {
      const isA = state.audio.wakaStep % 2 === 0;
      const accent = options.accent ? 1 : 0.6;
      playTone({
        frequency: isA ? 880 : 720,
        duration: 0.04,
        type: "triangle",
        volume: 0.06 * accent,
        attack: 0.004,
        release: 0.022,
        brightness: 0.95,
      });
      playTone({
        frequency: isA ? 1320 : 1080,
        duration: 0.03,
        type: "sine",
        volume: 0.026 * accent,
        delay: 0.006,
        attack: 0.004,
        release: 0.018,
        brightness: 0.98,
      });
      state.audio.wakaStep += 1;
      return;
    }
    if (name === "frightened") {
      const pulseHigh = state.audio.frightenedPulse % 2 === 0;
      playTone({
        frequency: pulseHigh ? 340 : 255,
        duration: 0.07,
        type: "sawtooth",
        volume: 0.05,
        attack: 0.004,
        release: 0.04,
        brightness: 0.7,
      });
      state.audio.frightenedPulse += 1;
      return;
    }
    if (name === "ghost-hum") {
      const step = state.audio.ghostHumStep % 3;
      const base = step === 0 ? 130 : step === 1 ? 146 : 116;
      playTone({
        frequency: base,
        duration: 0.08,
        type: "sine",
        volume: 0.018,
        attack: 0.008,
        release: 0.05,
        brightness: 0.24,
      });
      state.audio.ghostHumStep += 1;
      return;
    }
    if (name === "start") {
      playTone({ frequency: 392, duration: 0.09, type: "triangle", volume: 0.07, delay: 0.0, brightness: 0.88 });
      playTone({ frequency: 523, duration: 0.09, type: "triangle", volume: 0.075, delay: 0.1, brightness: 0.9 });
      playTone({ frequency: 659, duration: 0.12, type: "triangle", volume: 0.08, delay: 0.2, brightness: 0.92 });
      return;
    }
    if (name === "pellet") {
      playTone({ frequency: 1040, duration: 0.03, type: "triangle", volume: 0.05, attack: 0.003, release: 0.015, brightness: 0.95 });
      return;
    }
    if (name === "power") {
      playTone({ frequency: 392, duration: 0.08, type: "sawtooth", volume: 0.06, brightness: 0.78 });
      playTone({ frequency: 587, duration: 0.1, type: "triangle", volume: 0.065, delay: 0.08, brightness: 0.86 });
      return;
    }
    if (name === "ghost") {
      playTone({ frequency: 587, duration: 0.08, type: "triangle", volume: 0.07, brightness: 0.9 });
      playTone({ frequency: 880, duration: 0.1, type: "triangle", volume: 0.072, delay: 0.08, brightness: 0.94 });
      return;
    }
    if (name === "hit") {
      playTone({ frequency: 330, duration: 0.08, type: "sawtooth", volume: 0.07, delay: 0.0, brightness: 0.52 });
      playTone({ frequency: 247, duration: 0.1, type: "triangle", volume: 0.072, delay: 0.08, brightness: 0.46 });
      playTone({ frequency: 165, duration: 0.14, type: "triangle", volume: 0.075, delay: 0.18, brightness: 0.38 });
      return;
    }
    if (name === "win") {
      playTone({ frequency: 523, duration: 0.08, type: "triangle", volume: 0.07, delay: 0.0, brightness: 0.9 });
      playTone({ frequency: 659, duration: 0.08, type: "triangle", volume: 0.074, delay: 0.09, brightness: 0.92 });
      playTone({ frequency: 784, duration: 0.1, type: "triangle", volume: 0.078, delay: 0.18, brightness: 0.94 });
      playTone({ frequency: 1047, duration: 0.14, type: "triangle", volume: 0.082, delay: 0.28, brightness: 0.96 });
      return;
    }
  }
  if (name === "waka") {
    const isA = state.audio.wakaStep % 2 === 0;
    const accent = options.accent ? 1 : 0.58;
    playTone({
      frequency: isA ? 820 : 640,
      duration: 0.032,
      type: "square",
      volume: 0.072 * accent,
      attack: 0.002,
      release: 0.016,
      brightness: isA ? 0.94 : 0.82,
    });
    playTone({
      frequency: isA ? 410 : 320,
      duration: 0.025,
      type: "square",
      volume: 0.034 * accent,
      delay: 0.004,
      attack: 0.002,
      release: 0.014,
      brightness: 0.68,
    });
    state.audio.wakaStep += 1;
    return;
  }
  if (name === "frightened") {
    const pulseHigh = state.audio.frightenedPulse % 2 === 0;
    playTone({
      frequency: pulseHigh ? 294 : 220,
      duration: 0.06,
      type: "square",
      volume: 0.062,
      attack: 0.003,
      release: 0.034,
      brightness: pulseHigh ? 0.74 : 0.6,
    });
    playTone({
      frequency: pulseHigh ? 147 : 110,
      duration: 0.05,
      type: "square",
      volume: 0.028,
      delay: 0.005,
      attack: 0.003,
      release: 0.026,
      brightness: 0.42,
    });
    playTone({
      frequency: pulseHigh ? 588 : 440,
      duration: 0.038,
      type: "triangle",
      volume: 0.018,
      delay: 0.012,
      attack: 0.003,
      release: 0.02,
      brightness: 0.52,
    });
    state.audio.frightenedPulse += 1;
    return;
  }
  if (name === "ghost-hum") {
    const step = state.audio.ghostHumStep % 3;
    const base = step === 0 ? 110 : step === 1 ? 123 : 98;
    playTone({
      frequency: base,
      duration: 0.07,
      type: "square",
      volume: 0.022,
      attack: 0.003,
      release: 0.04,
      brightness: 0.26,
    });
    playTone({
      frequency: base * 2,
      duration: 0.05,
      type: "triangle",
      volume: 0.009,
      delay: 0.006,
      attack: 0.003,
      release: 0.028,
      brightness: 0.22,
    });
    state.audio.ghostHumStep += 1;
    return;
  }
  if (name === "start") {
    playTone({ frequency: 392, duration: 0.08, type: "square", volume: 0.09, delay: 0.0, brightness: 0.82 });
    playTone({ frequency: 494, duration: 0.08, type: "square", volume: 0.09, delay: 0.085, brightness: 0.84 });
    playTone({ frequency: 587, duration: 0.08, type: "square", volume: 0.092, delay: 0.17, brightness: 0.86 });
    playTone({ frequency: 784, duration: 0.1, type: "square", volume: 0.096, delay: 0.255, brightness: 0.88 });
    playTone({ frequency: 988, duration: 0.14, type: "square", volume: 0.1, delay: 0.355, brightness: 0.92 });
    return;
  }
  if (name === "pellet") {
    playTone({ frequency: 880, duration: 0.038, type: "square", volume: 0.07, attack: 0.003, release: 0.02, brightness: 0.92 });
    playTone({ frequency: 660, duration: 0.03, type: "square", volume: 0.04, delay: 0.008, attack: 0.003, release: 0.018, brightness: 0.84 });
    return;
  }
  if (name === "power") {
    playTone({ frequency: 330, duration: 0.07, type: "square", volume: 0.085, delay: 0.0, brightness: 0.75 });
    playTone({ frequency: 392, duration: 0.07, type: "square", volume: 0.085, delay: 0.07, brightness: 0.78 });
    playTone({ frequency: 494, duration: 0.09, type: "square", volume: 0.09, delay: 0.14, brightness: 0.8 });
    return;
  }
  if (name === "ghost") {
    playTone({ frequency: 523, duration: 0.05, type: "square", volume: 0.09, delay: 0.0, brightness: 0.85 });
    playTone({ frequency: 659, duration: 0.05, type: "square", volume: 0.09, delay: 0.05, brightness: 0.88 });
    playTone({ frequency: 784, duration: 0.07, type: "square", volume: 0.095, delay: 0.1, brightness: 0.9 });
    return;
  }
  if (name === "hit") {
    playTone({ frequency: 392, duration: 0.07, type: "square", volume: 0.078, delay: 0.0, brightness: 0.6 });
    playTone({ frequency: 349, duration: 0.07, type: "square", volume: 0.078, delay: 0.075, brightness: 0.56 });
    playTone({ frequency: 294, duration: 0.08, type: "square", volume: 0.082, delay: 0.15, brightness: 0.5 });
    playTone({ frequency: 247, duration: 0.085, type: "square", volume: 0.084, delay: 0.235, brightness: 0.46 });
    playTone({ frequency: 196, duration: 0.13, type: "square", volume: 0.09, delay: 0.325, brightness: 0.42 });
    return;
  }
  if (name === "win") {
    playTone({ frequency: 523, duration: 0.08, type: "square", volume: 0.085, delay: 0.0, brightness: 0.82 });
    playTone({ frequency: 659, duration: 0.08, type: "square", volume: 0.085, delay: 0.09, brightness: 0.84 });
    playTone({ frequency: 784, duration: 0.08, type: "square", volume: 0.09, delay: 0.18, brightness: 0.86 });
    playTone({ frequency: 1047, duration: 0.14, type: "square", volume: 0.1, delay: 0.27, brightness: 0.9 });
  }
}

async function toggleAudio() {
  state.audio.enabled = !state.audio.enabled;
  writeAudioEnabled(state.audio.enabled);
  syncAudioUi();
  if (state.audio.enabled) {
    await ensureAudioReady();
    playTone({ frequency: 988, duration: 0.06, type: "square", volume: 0.075, brightness: 0.9 });
  }
}

async function handleAudioStyleChange() {
  state.audio.style = elements.audioStyleSelect.value;
  writeAudioStyle(state.audio.style);
  syncAudioUi();
  await ensureAudioReady();
  playEffect("start");
}

const cloneMaze = () => MAZE.map((row) => row.split(""));
const isWall = (x, y) => y < 0 || y >= state.world.length || x < 0 || x >= state.world[0].length || state.world[y][x] === "#";
const createActor = (x, y, color) => ({ x, y, startX: x, startY: y, color, direction: { x: 0, y: 0 } });
const canMove = (x, y) => !isWall(x, y);

function initializeWorld() {
  state.world = cloneMaze();
  state.player = createActor(1, 1, "#facc15");
  state.ghosts = [createActor(7, 7, "#fb7185"), createActor(13, 1, "#60a5fa"), createActor(13, 13, "#c084fc")];
  state.world[state.player.y][state.player.x] = " ";
  state.ghosts.forEach((ghost) => { state.world[ghost.y][ghost.x] = " "; });
  state.runtime.direction = { x: 0, y: 0 };
  state.runtime.queuedDirection = { x: 0, y: 0 };
  state.game.lives = 3;
  state.game.frightenedUntil = 0;
  state.game.pelletsLeft = state.world.reduce((sum, row) => sum + row.filter((cell) => cell === "." || cell === "o").length, 0);
}

function persistGameData() {
  if (!state.auth.isLoggedIn) return;
  const previous = getUserData(state.auth.username);
  saveUserData(state.auth.username, { ...previous, username: state.auth.username, bestScore: state.game.bestScore, lastScore: state.game.lastScore, gamesPlayed: state.game.gamesPlayed, updatedAt: state.game.updatedAt, lastFinishedAt: state.game.lastFinishedAt, history: state.game.history.slice(0, 8) });
}

function renderHistory() {
  if (!state.auth.isLoggedIn) {
    elements.historyList.innerHTML = '<p class="history-empty">登入後會顯示最近對戰與登入紀錄。</p>';
    return;
  }
  const parts = [`<article class="history-item"><div class="history-head"><strong>登入成功</strong><span>${formatDate(state.auth.loginTime)}</span></div><div class="history-sub"><span>玩家 ${state.auth.username}</span><span>會話已建立</span></div></article>`];
  state.game.history.slice(0, 5).forEach((entry) => parts.push(`<article class="history-item"><div class="history-head"><strong>${entry.result}</strong><span>${entry.score} 分</span></div><div class="history-sub"><span>${formatDate(entry.finishedAt)}</span><span>耗時 ${entry.duration}s</span></div></article>`));
  elements.historyList.innerHTML = parts.join("");
}

function syncStats() {
  elements.userStatus.textContent = state.auth.isLoggedIn ? `${state.auth.username} ・ ${formatDate(state.auth.loginTime)}` : "尚未登入";
  elements.statUsername.textContent = state.auth.isLoggedIn ? state.auth.username : "-";
  elements.statLoginTime.textContent = formatDate(state.auth.loginTime);
  elements.statCurrentScore.textContent = String(state.game.currentScore);
  elements.statBestScore.textContent = String(state.game.bestScore);
  elements.statLastScore.textContent = String(state.game.lastScore);
  elements.statGamesPlayed.textContent = String(state.game.gamesPlayed);
  elements.statUpdatedAt.textContent = formatDate(state.game.updatedAt);
  elements.statLastFinishedAt.textContent = formatDate(state.game.lastFinishedAt);
  elements.livesBadge.textContent = `Lives ${state.game.lives}`;
  elements.pelletsBadge.textContent = `Pellets ${state.game.pelletsLeft}`;
  elements.logoutButton.disabled = !state.auth.isLoggedIn;
  elements.logoutButton.style.opacity = state.auth.isLoggedIn ? "1" : "0.55";
  renderHistory();
}

function syncControllerUi() {
  const config = getControllerConfig();
  elements.controllerTitle.textContent = config.title;
  elements.controllerStatus.textContent = state.controller.status;
  elements.controllerDetail.textContent = state.controller.detail;
  elements.controllerTip.textContent = config.tip;
  elements.controllerModeSelect.value = state.controller.mode;
  elements.connectControllerButton.disabled = state.controller.mode === "keyboard";
  elements.connectControllerButton.style.opacity = elements.connectControllerButton.disabled ? "0.55" : "1";
  elements.disconnectControllerButton.disabled = state.controller.mode === "keyboard" || state.controller.gamepadIndex === null;
  elements.disconnectControllerButton.style.opacity = elements.disconnectControllerButton.disabled ? "0.55" : "1";
}

function updateControllerStatus(status, detail, source = state.controller.source) {
  state.controller.status = status;
  state.controller.detail = detail;
  state.controller.source = source;
  syncControllerUi();
}

function updateOverlay(mode, title = "") {
  elements.gameOverlay.classList.remove("is-hidden");
  if (mode === "locked") {
    elements.overlayTitle.textContent = "請先登入";
    elements.overlayCopy.textContent = "登入後即可啟動 Pac-Man。你也可以先選擇 Keyboard、USB Gamepad 或 Magicsee 作為控制裝置。";
    elements.startButton.textContent = "開始遊戲";
    elements.startButton.disabled = true;
    return;
  }
  if (mode === "ready") {
    elements.overlayTitle.textContent = "準備進場";
    elements.overlayCopy.textContent = "遊戲速度已放慢為原本的三分之一。清空迷宮、善用能量豆，避開或反制鬼魂。";
    elements.startButton.textContent = "開始遊戲";
    elements.startButton.disabled = false;
    return;
  }
  elements.overlayTitle.textContent = title || "遊戲結束";
  elements.overlayCopy.textContent = `本局得分 ${state.game.currentScore}。登入狀態與歷史紀錄已同步到本地儲存。`;
  elements.startButton.textContent = "再玩一局";
  elements.startButton.disabled = false;
}

const hideOverlay = () => elements.gameOverlay.classList.add("is-hidden");

function drawMaze() {
  ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
  ctx.fillStyle = "#07101f";
  ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
  for (let y = 0; y < state.world.length; y += 1) {
    for (let x = 0; x < state.world[y].length; x += 1) {
      const cell = state.world[y][x];
      const drawX = x * TILE;
      const drawY = y * TILE;
      if (cell === "#") {
        ctx.fillStyle = "rgba(34, 211, 238, 0.16)";
        ctx.fillRect(drawX, drawY, TILE, TILE);
        ctx.strokeStyle = "rgba(34, 211, 238, 0.72)";
        ctx.lineWidth = 2;
        ctx.strokeRect(drawX + 1.5, drawY + 1.5, TILE - 3, TILE - 3);
      } else {
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.fillRect(drawX, drawY, TILE, TILE);
        if (cell === "." || cell === "o") {
          ctx.beginPath();
          ctx.fillStyle = cell === "o" ? "#f9a8d4" : "#f8fafc";
          ctx.shadowColor = cell === "o" ? "rgba(217, 70, 239, 0.7)" : "rgba(255, 255, 255, 0.4)";
          ctx.shadowBlur = cell === "o" ? 14 : 8;
          ctx.arc(drawX + TILE / 2, drawY + TILE / 2, cell === "o" ? 5 : 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
  }
}

function drawPacman() {
  const centerX = state.player.x * TILE + TILE / 2;
  const centerY = state.player.y * TILE + TILE / 2;
  const angle = Date.now() % 280 < 140 ? 0.22 : 0.03;
  let rotation = 0;
  if (state.runtime.direction.x === -1) rotation = Math.PI;
  else if (state.runtime.direction.y === -1) rotation = -Math.PI / 2;
  else if (state.runtime.direction.y === 1) rotation = Math.PI / 2;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.fillStyle = "#facc15";
  ctx.shadowColor = "rgba(250, 204, 21, 0.5)";
  ctx.shadowBlur = 16;
  ctx.arc(0, 0, TILE * 0.36, angle, Math.PI * 2 - angle);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
}

function drawGhost(ghost) {
  const centerX = ghost.x * TILE + TILE / 2;
  const centerY = ghost.y * TILE + TILE / 2;
  const frightened = Date.now() < state.game.frightenedUntil;
  const color = frightened ? "#93c5fd" : ghost.color;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.fillStyle = color;
  ctx.shadowColor = `${color}aa`;
  ctx.shadowBlur = frightened ? 18 : 10;
  ctx.beginPath();
  ctx.arc(0, -4, TILE * 0.3, Math.PI, 0);
  ctx.lineTo(TILE * 0.3, TILE * 0.28);
  ctx.lineTo(TILE * 0.14, TILE * 0.16);
  ctx.lineTo(0, TILE * 0.28);
  ctx.lineTo(-TILE * 0.14, TILE * 0.16);
  ctx.lineTo(-TILE * 0.3, TILE * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f8fafc";
  ctx.beginPath();
  ctx.arc(-5, -3, 3.5, 0, Math.PI * 2);
  ctx.arc(5, -3, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.shadowBlur = 0;
}

const renderScene = () => { drawMaze(); drawPacman(); state.ghosts.forEach(drawGhost); };

function collectAtPlayer() {
  const cell = state.world[state.player.y][state.player.x];
  if (cell === ".") {
    state.game.currentScore += 10;
    state.world[state.player.y][state.player.x] = " ";
    state.game.pelletsLeft -= 1;
    playEffect("pellet");
    playEffect("waka", { accent: true });
  } else if (cell === "o") {
    state.game.currentScore += 50;
    state.world[state.player.y][state.player.x] = " ";
    state.game.pelletsLeft -= 1;
    state.game.frightenedUntil = Date.now() + FRIGHTENED_MS;
    playEffect("power");
    playEffect("waka", { accent: true });
  }
  if (state.game.currentScore > state.game.bestScore) state.game.bestScore = state.game.currentScore;
}

function randomDirectionFrom(x, y, previous) {
  const options = Object.values(DIRECTION_MAP).filter((dir) => canMove(x + dir.x, y + dir.y));
  const filtered = options.filter((dir) => dir.x !== -previous.x || dir.y !== -previous.y);
  const pool = filtered.length ? filtered : options;
  return pool[Math.floor(Math.random() * pool.length)] || { x: 0, y: 0 };
}

function moveGhosts() {
  state.ghosts.forEach((ghost) => {
    const frightened = Date.now() < state.game.frightenedUntil;
    const previous = ghost.direction;
    let direction;
    if (frightened) {
      direction = randomDirectionFrom(ghost.x, ghost.y, previous);
    } else {
      const candidates = Object.values(DIRECTION_MAP).filter((dir) => canMove(ghost.x + dir.x, ghost.y + dir.y));
      candidates.sort((a, b) => (Math.abs(state.player.x - (ghost.x + a.x)) + Math.abs(state.player.y - (ghost.y + a.y))) - (Math.abs(state.player.x - (ghost.x + b.x)) + Math.abs(state.player.y - (ghost.y + b.y))));
      direction = candidates[0] || previous;
      if (direction.x === -previous.x && direction.y === -previous.y && candidates[1]) direction = candidates[1];
    }
    ghost.direction = direction;
    ghost.x += direction.x;
    ghost.y += direction.y;
  });
}

function resetActors() {
  state.player.x = state.player.startX;
  state.player.y = state.player.startY;
  state.runtime.direction = { x: 0, y: 0 };
  state.runtime.queuedDirection = { x: 0, y: 0 };
  state.game.frightenedUntil = 0;
  state.ghosts.forEach((ghost) => { ghost.x = ghost.startX; ghost.y = ghost.startY; ghost.direction = { x: 0, y: 0 }; });
}

function pushHistory(result) {
  const duration = state.runtime.startedAt ? Math.max(1, Math.round((Date.now() - state.runtime.startedAt) / 1000)) : 0;
  state.game.history.unshift({ result, score: state.game.currentScore, duration, finishedAt: new Date().toISOString() });
  state.game.history = state.game.history.slice(0, 8);
}

function endGame(result) {
  if (state.runtime.timerId) { clearInterval(state.runtime.timerId); state.runtime.timerId = null; }
  if (result === "win") {
    state.game.currentScore += WIN_BONUS;
    if (state.game.currentScore > state.game.bestScore) state.game.bestScore = state.game.currentScore;
  }
  state.game.isPlaying = false;
  state.runtime.endedAt = Date.now();
  state.game.lastScore = state.game.currentScore;
  state.game.gamesPlayed += 1;
  state.game.updatedAt = new Date().toISOString();
  state.game.lastFinishedAt = state.game.updatedAt;
  pushHistory(result === "win" ? "通關成功" : "遭遇鬼魂");
  persistGameData();
  syncStats();
  renderScene();
  playEffect(result === "win" ? "win" : "hit");
  updateOverlay("ended", result === "win" ? "你清空了迷宮" : "遊戲結束");
}

function handleCollisions() {
  for (const ghost of state.ghosts) {
    if (ghost.x !== state.player.x || ghost.y !== state.player.y) continue;
    if (Date.now() < state.game.frightenedUntil) {
      state.game.currentScore += 80;
      if (state.game.currentScore > state.game.bestScore) state.game.bestScore = state.game.currentScore;
      playEffect("ghost");
      ghost.x = ghost.startX; ghost.y = ghost.startY; ghost.direction = { x: 0, y: 0 };
      return;
    }
    state.game.lives -= 1;
    if (state.game.lives <= 0) { endGame("lose"); return; }
    playEffect("hit");
    resetActors();
    break;
  }
}

function tick() {
  const nextQueueX = state.player.x + state.runtime.queuedDirection.x;
  const nextQueueY = state.player.y + state.runtime.queuedDirection.y;
  if (canMove(nextQueueX, nextQueueY)) state.runtime.direction = { ...state.runtime.queuedDirection };
  const previousX = state.player.x;
  const previousY = state.player.y;
  const nextX = state.player.x + state.runtime.direction.x;
  const nextY = state.player.y + state.runtime.direction.y;
  if (canMove(nextX, nextY)) { state.player.x = nextX; state.player.y = nextY; }
  if (state.player.x !== previousX || state.player.y !== previousY) {
    playEffect("waka", { accent: false });
  }
  collectAtPlayer();
  moveGhosts();
  handleCollisions();
  if (!state.game.isPlaying) return;
  if (Date.now() < state.game.frightenedUntil) {
    playEffect("frightened");
  } else {
    playEffect("ghost-hum");
  }
  if (state.game.pelletsLeft <= 0) { endGame("win"); return; }
  state.game.updatedAt = new Date().toISOString();
  syncStats();
  renderScene();
}

async function startGame() {
  if (!state.auth.isLoggedIn) { updateOverlay("locked"); return; }
  if (state.runtime.timerId) clearInterval(state.runtime.timerId);
  initializeWorld();
  state.game.currentScore = 0;
  state.game.isPlaying = true;
  state.audio.wakaStep = 0;
  state.audio.frightenedPulse = 0;
  state.audio.ghostHumStep = 0;
  state.runtime.startedAt = Date.now();
  hideOverlay();
  syncStats();
  renderScene();
  await ensureAudioReady();
  playEffect("start");
  state.runtime.timerId = setInterval(tick, TICK_MS);
}

function loadUserIntoState(username, loginTime) {
  const data = getUserData(username);
  state.auth.isLoggedIn = true;
  state.auth.username = username;
  state.auth.loginTime = loginTime;
  state.game.currentScore = 0;
  state.game.bestScore = data.bestScore || 0;
  state.game.lastScore = data.lastScore || 0;
  state.game.gamesPlayed = data.gamesPlayed || 0;
  state.game.updatedAt = data.updatedAt || null;
  state.game.lastFinishedAt = data.lastFinishedAt || null;
  state.game.history = Array.isArray(data.history) ? data.history : [];
}

function handleLogin(rawUsername) {
  const username = rawUsername.trim();
  if (!username) { setMessage("請輸入使用者名稱。", "error"); return; }
  const now = new Date().toISOString();
  const existing = getUserData(username);
  const loginHistory = Array.isArray(existing.loginHistory) ? existing.loginHistory.slice(-9) : [];
  loginHistory.push(now);
  saveUserData(username, { ...existing, username, loginHistory });
  setCurrentUser({ username, loginTime: now });
  loadUserIntoState(username, now);
  syncStats();
  updateOverlay("ready");
  setMessage(`歡迎回來，${username}。資料已載入。`, "success");
  elements.usernameInput.value = username;
}

function handleLogout() {
  if (state.runtime.timerId) { clearInterval(state.runtime.timerId); state.runtime.timerId = null; }
  clearCurrentUser();
  state.auth = { isLoggedIn: false, username: "", loginTime: null };
  state.game = { ...state.game, isPlaying: false, currentScore: 0, bestScore: 0, lastScore: 0, gamesPlayed: 0, updatedAt: null, lastFinishedAt: null, history: [] };
  elements.usernameInput.value = "";
  setMessage("已登出，目前為訪客狀態。", "success");
  initializeWorld();
  syncStats();
  renderScene();
  updateOverlay("locked");
}

function queueDirection(directionName, source = state.controller.mode) {
  const direction = DIRECTION_MAP[directionName];
  if (!direction) return;
  if (state.controller.mode !== "keyboard" && source === "keyboard") return;
  if (state.controller.mode === "keyboard" && source !== "keyboard") return;
  state.runtime.queuedDirection = { ...direction };
}

function handleKeydown(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const directionName = KEY_TO_DIRECTION[event.key.toLowerCase()];
  if (!directionName) return;
  event.preventDefault();
  queueDirection(directionName, "keyboard");
}

function getGamepadDirection(gamepad) {
  if (!gamepad) return null;
  if (gamepad.buttons[12]?.pressed) return "up";
  if (gamepad.buttons[13]?.pressed) return "down";
  if (gamepad.buttons[14]?.pressed) return "left";
  if (gamepad.buttons[15]?.pressed) return "right";
  const xAxis = gamepad.axes[0] ?? 0;
  const yAxis = gamepad.axes[1] ?? 0;
  if (Math.abs(xAxis) > Math.abs(yAxis)) {
    if (xAxis <= -GAMEPAD_AXIS_THRESHOLD) return "left";
    if (xAxis >= GAMEPAD_AXIS_THRESHOLD) return "right";
  } else {
    if (yAxis <= -GAMEPAD_AXIS_THRESHOLD) return "up";
    if (yAxis >= GAMEPAD_AXIS_THRESHOLD) return "down";
  }
  return null;
}

const isStartButtonPressed = (gamepad) => Boolean(gamepad && (gamepad.buttons[0]?.pressed || gamepad.buttons[9]?.pressed || gamepad.buttons[7]?.pressed));
const findPreferredGamepad = () => (navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []).find((gamepad) => getControllerConfig().preferredMatcher(gamepad)) || null;

function stopGamepadPolling() {
  if (state.controller.frameId) { cancelAnimationFrame(state.controller.frameId); state.controller.frameId = null; }
}

function pollGamepad() {
  const gamepad = state.controller.gamepadIndex !== null ? navigator.getGamepads?.()[state.controller.gamepadIndex] : findPreferredGamepad();
  if (!gamepad) {
    const config = getControllerConfig();
    state.controller.gamepadIndex = null;
    state.controller.gamepadName = "";
    state.controller.lastGamepadDirection = null;
    state.controller.lastStartPressed = false;
    updateControllerStatus("Disconnected", config.missing, "keyboard");
    stopGamepadPolling();
    return;
  }
  state.controller.gamepadIndex = gamepad.index;
  state.controller.gamepadName = gamepad.id || "Gamepad";
  const directionName = getGamepadDirection(gamepad);
  if (directionName && directionName !== state.controller.lastGamepadDirection) queueDirection(directionName, `gamepad ${state.controller.gamepadName}`);
  state.controller.lastGamepadDirection = directionName;
  const startPressed = isStartButtonPressed(gamepad);
  if (startPressed && !state.controller.lastStartPressed && !state.game.isPlaying && state.auth.isLoggedIn) startGame();
  state.controller.lastStartPressed = startPressed;
  state.controller.frameId = requestAnimationFrame(pollGamepad);
}

function startGamepadPolling() {
  if (!state.controller.frameId) state.controller.frameId = requestAnimationFrame(pollGamepad);
}

function handleGamepadConnected(event) {
  const gamepad = event.gamepad;
  const config = getControllerConfig();
  if (state.controller.mode === "keyboard" || !config.preferredMatcher(gamepad)) return;
  state.controller.gamepadIndex = gamepad.index;
  state.controller.gamepadName = gamepad.id || "Gamepad";
  updateControllerStatus("Connected", `已偵測到 ${config.connectedLabel}: ${state.controller.gamepadName}。`, `gamepad ${state.controller.gamepadName}`);
  startGamepadPolling();
}

function handleGamepadDisconnected(event) {
  if (event.gamepad.index !== state.controller.gamepadIndex) return;
  const config = getControllerConfig();
  state.controller.gamepadIndex = null;
  state.controller.gamepadName = "";
  state.controller.lastGamepadDirection = null;
  state.controller.lastStartPressed = false;
  updateControllerStatus("Disconnected", config.disconnected, "keyboard");
  stopGamepadPolling();
}

function connectController() {
  if (state.controller.mode === "keyboard") { updateControllerStatus("Ready", CONTROLLER_MODES.keyboard.waiting, "keyboard"); return; }
  const preferredGamepad = findPreferredGamepad();
  const config = getControllerConfig();
  if (preferredGamepad) {
    state.controller.gamepadIndex = preferredGamepad.index;
    state.controller.gamepadName = preferredGamepad.id || "Gamepad";
    updateControllerStatus("Connected", `已使用 ${config.connectedLabel}: ${state.controller.gamepadName}。`, `gamepad ${state.controller.gamepadName}`);
    startGamepadPolling();
    return;
  }
  updateControllerStatus("Waiting", config.waiting, "keyboard");
}

function disconnectController() {
  const config = getControllerConfig();
  stopGamepadPolling();
  state.controller.gamepadIndex = null;
  state.controller.gamepadName = "";
  state.controller.lastGamepadDirection = null;
  state.controller.lastStartPressed = false;
  updateControllerStatus(state.controller.mode === "keyboard" ? "Ready" : "Disconnected", state.controller.mode === "keyboard" ? config.detail : config.cleared, "keyboard");
}

function handleControllerModeChange() {
  state.controller.mode = elements.controllerModeSelect.value;
  disconnectController();
}

function bootstrap() {
  state.audio.enabled = readAudioEnabled();
  state.audio.style = readAudioStyle();
  initializeWorld();
  renderScene();
  syncStats();
  syncControllerUi();
  syncAudioUi();
  const currentUser = getCurrentUser();
  if (currentUser && currentUser.username && currentUser.loginTime) {
    loadUserIntoState(currentUser.username, currentUser.loginTime);
    elements.usernameInput.value = currentUser.username;
    syncStats();
    updateOverlay("ready");
    setMessage(`已恢復 ${currentUser.username} 的登入狀態。`, "success");
  } else {
    updateOverlay("locked");
  }
  const initialGamepad = findPreferredGamepad();
  if (initialGamepad) handleGamepadConnected({ gamepad: initialGamepad });
}

elements.loginForm.addEventListener("submit", (event) => { event.preventDefault(); handleLogin(elements.usernameInput.value); });
elements.logoutButton.addEventListener("click", handleLogout);
elements.audioToggleButton.addEventListener("click", toggleAudio);
elements.audioStyleSelect.addEventListener("change", handleAudioStyleChange);
elements.startButton.addEventListener("click", startGame);
elements.connectControllerButton.addEventListener("click", connectController);
elements.disconnectControllerButton.addEventListener("click", disconnectController);
elements.controllerModeSelect.addEventListener("change", handleControllerModeChange);
window.addEventListener("keydown", handleKeydown);
window.addEventListener("gamepadconnected", handleGamepadConnected);
window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);

bootstrap();
