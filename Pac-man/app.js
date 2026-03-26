const STORAGE_KEYS = {
  currentUser: "ag_pacman_current_user",
  userPrefix: "ag_pacman_user_data_",
};

const GAMEPAD_AXIS_THRESHOLD = 0.55;
const TILE = 28;
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

const GAME = {
  tickMs: 480,
  frightenedMs: 5600,
  winBonus: 120,
};

const DIRECTION_MAP = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const KEY_TO_DIRECTION = {
  arrowup: "up",
  w: "up",
  arrowdown: "down",
  s: "down",
  arrowleft: "left",
  a: "left",
  arrowright: "right",
  d: "right",
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
    tip: "支援方向鍵區、左類比與常見 A / Start 鍵。建議使用 Chrome 或 Edge。",
    waiting: "尚未偵測到 USB Gamepad。請插入裝置後按一下任意按鍵，再重新連接。",
    missing: "沒有找到 USB Gamepad。請確認裝置已連接並被瀏覽器辨識。",
    disconnected: "USB Gamepad 已斷開，請重新插入或重新配對。",
    cleared: "USB Gamepad 連線已清除。",
    connectedLabel: "USB gamepad",
    preferredMatcher: () => true,
  },
  magicsee: {
    title: "Magicsee",
    detail: "若你使用 Magicsee 控制器，請先配對或接上裝置，再點擊連接控制器。",
    tip: "Magicsee 可能被瀏覽器辨識為一般 gamepad，若有偵測到可直接使用方向鍵區或左類比。",
    waiting: "尚未偵測到 Magicsee。請確認裝置已連接，按一下任意按鍵後再重新連接。",
    missing: "沒有找到 Magicsee 控制器。請確認電源與連線狀態。",
    disconnected: "Magicsee 已斷開，請重新連接後再試。",
    cleared: "Magicsee 連線已清除。",
    connectedLabel: "Magicsee controller",
    preferredMatcher: (gamepad) => /magicsee/i.test(gamepad.id),
  },
};

const state = {
  auth: {
    isLoggedIn: false,
    username: "",
    loginTime: null,
  },
  game: {
    isPlaying: false,
    currentScore: 0,
    bestScore: 0,
    lastScore: 0,
    gamesPlayed: 0,
    updatedAt: null,
    lastFinishedAt: null,
    history: [],
    lives: 3,
    pelletsLeft: 0,
    frightenedUntil: 0,
  },
  runtime: {
    timerId: null,
    startedAt: null,
    endedAt: null,
    direction: { x: 0, y: 0 },
    queuedDirection: { x: 0, y: 0 },
  },
  controller: {
    mode: "keyboard",
    source: "keyboard",
    status: "Ready",
    detail: CONTROLLER_MODES.keyboard.detail,
    gamepadIndex: null,
    gamepadName: "",
    frameId: null,
    lastGamepadDirection: null,
    lastStartPressed: false,
  },
  world: null,
  player: null,
  ghosts: [],
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  usernameInput: document.querySelector("#username-input"),
  loginMessage: document.querySelector("#login-message"),
  logoutButton: document.querySelector("#logout-button"),
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

function getControllerConfig() {
  return CONTROLLER_MODES[state.controller.mode];
}

function getUserDataKey(username) {
  return `${STORAGE_KEYS.userPrefix}${username}`;
}

function createDefaultUserData(username) {
  return {
    username,
    loginHistory: [],
    bestScore: 0,
    lastScore: 0,
    gamesPlayed: 0,
    updatedAt: null,
    lastFinishedAt: null,
    history: [],
  };
}

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getCurrentUser() {
  return readJson(STORAGE_KEYS.currentUser);
}

function setCurrentUser(payload) {
  writeJson(STORAGE_KEYS.currentUser, payload);
}

function clearCurrentUser() {
  window.localStorage.removeItem(STORAGE_KEYS.currentUser);
}

function getUserData(username) {
  return readJson(getUserDataKey(username)) || createDefaultUserData(username);
}

function saveUserData(username, payload) {
  writeJson(getUserDataKey(username), payload);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  try {
    return new Intl.DateTimeFormat("zh-TW", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function setMessage(text, type = "") {
  elements.loginMessage.textContent = text;
  elements.loginMessage.className = "inline-message";
  if (type) {
    elements.loginMessage.classList.add(type === "error" ? "is-error" : "is-success");
  }
}

function cloneMaze() {
  return MAZE.map((row) => row.split(""));
}

function isWall(x, y) {
  if (y < 0 || y >= state.world.length || x < 0 || x >= state.world[0].length) {
    return true;
  }

  return state.world[y][x] === "#";
}

function createActor(x, y, color) {
  return {
    x,
    y,
    startX: x,
    startY: y,
    color,
    direction: { x: 0, y: 0 },
  };
}

function countPellets() {
  return state.world.reduce(
    (total, row) => total + row.filter((cell) => cell === "." || cell === "o").length,
    0
  );
}

function initializeWorld() {
  state.world = cloneMaze();
  state.player = createActor(1, 1, "#facc15");
  state.ghosts = [
    createActor(7, 7, "#fb7185"),
    createActor(13, 1, "#60a5fa"),
    createActor(13, 13, "#c084fc"),
  ];

  state.world[state.player.y][state.player.x] = " ";
  state.ghosts.forEach((ghost) => {
    state.world[ghost.y][ghost.x] = " ";
  });

  state.runtime.direction = { x: 0, y: 0 };
  state.runtime.queuedDirection = { x: 0, y: 0 };
  state.game.lives = 3;
  state.game.frightenedUntil = 0;
  state.game.pelletsLeft = countPellets();
}

function persistGameData() {
  if (!state.auth.isLoggedIn) {
    return;
  }

  const previous = getUserData(state.auth.username);
  saveUserData(state.auth.username, {
    ...previous,
    username: state.auth.username,
    bestScore: state.game.bestScore,
    lastScore: state.game.lastScore,
    gamesPlayed: state.game.gamesPlayed,
    updatedAt: state.game.updatedAt,
    lastFinishedAt: state.game.lastFinishedAt,
    history: state.game.history.slice(0, 8),
  });
}

function renderHistory() {
  if (!state.auth.isLoggedIn) {
    elements.historyList.innerHTML = '<p class="history-empty">登入後會顯示最近對戰與登入紀錄。</p>';
    return;
  }

  const items = [];

  if (state.auth.loginTime) {
    items.push(`
      <article class="history-item">
        <div class="history-head">
          <strong>登入成功</strong>
          <span>${formatDate(state.auth.loginTime)}</span>
        </div>
        <div class="history-sub">
          <span>玩家 ${state.auth.username}</span>
          <span>會話已建立</span>
        </div>
      </article>
    `);
  }

  state.game.history.slice(0, 5).forEach((entry) => {
    items.push(`
      <article class="history-item">
        <div class="history-head">
          <strong>${entry.result}</strong>
          <span>${entry.score} 分</span>
        </div>
        <div class="history-sub">
          <span>${formatDate(entry.finishedAt)}</span>
          <span>耗時 ${entry.duration}s</span>
        </div>
      </article>
    `);
  });

  elements.historyList.innerHTML = items.join("");
}

function syncStats() {
  elements.userStatus.textContent = state.auth.isLoggedIn
    ? `${state.auth.username} ・ ${formatDate(state.auth.loginTime)}`
    : "尚未登入";
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
  elements.connectControllerButton.style.opacity =
    elements.connectControllerButton.disabled ? "0.55" : "1";
  elements.disconnectControllerButton.disabled =
    state.controller.mode === "keyboard" || state.controller.gamepadIndex === null;
  elements.disconnectControllerButton.style.opacity =
    elements.disconnectControllerButton.disabled ? "0.55" : "1";
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

  if (mode === "ended") {
    elements.overlayTitle.textContent = title || "遊戲結束";
    elements.overlayCopy.textContent = `本局得分 ${state.game.currentScore}。登入狀態與歷史紀錄已同步到本地儲存。`;
    elements.startButton.textContent = "再玩一局";
    elements.startButton.disabled = false;
  }
}

function hideOverlay() {
  elements.gameOverlay.classList.add("is-hidden");
}

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
        continue;
      }

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

function drawPacman() {
  const centerX = state.player.x * TILE + TILE / 2;
  const centerY = state.player.y * TILE + TILE / 2;
  const angle = Date.now() % 280 < 140 ? 0.22 : 0.03;
  let rotation = 0;

  if (state.runtime.direction.x === -1) {
    rotation = Math.PI;
  } else if (state.runtime.direction.y === -1) {
    rotation = -Math.PI / 2;
  } else if (state.runtime.direction.y === 1) {
    rotation = Math.PI / 2;
  }

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

function renderScene() {
  drawMaze();
  drawPacman();
  state.ghosts.forEach(drawGhost);
}

function canMove(x, y) {
  return !isWall(x, y);
}

function queueDirection(directionName, source = state.controller.mode) {
  const direction = DIRECTION_MAP[directionName];
  if (!direction) {
    return;
  }

  if (state.controller.mode !== "keyboard" && source === "keyboard") {
    return;
  }

  if (state.controller.mode === "keyboard" && source !== "keyboard") {
    return;
  }

  state.runtime.queuedDirection = { ...direction };
}

function tryApplyQueuedDirection() {
  const nextX = state.player.x + state.runtime.queuedDirection.x;
  const nextY = state.player.y + state.runtime.queuedDirection.y;
  if (canMove(nextX, nextY)) {
    state.runtime.direction = { ...state.runtime.queuedDirection };
  }
}

function collectAtPlayer() {
  const cell = state.world[state.player.y][state.player.x];

  if (cell === ".") {
    state.game.currentScore += 10;
    state.world[state.player.y][state.player.x] = " ";
    state.game.pelletsLeft -= 1;
  } else if (cell === "o") {
    state.game.currentScore += 50;
    state.world[state.player.y][state.player.x] = " ";
    state.game.pelletsLeft -= 1;
    state.game.frightenedUntil = Date.now() + GAME.frightenedMs;
  }

  if (state.game.currentScore > state.game.bestScore) {
    state.game.bestScore = state.game.currentScore;
  }
}

function randomDirectionFrom(x, y, previous) {
  const options = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ].filter((direction) => canMove(x + direction.x, y + direction.y));

  const filtered = options.filter(
    (direction) => direction.x !== -previous.x || direction.y !== -previous.y
  );

  const pool = filtered.length > 0 ? filtered : options;
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
      const candidates = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ].filter((candidate) => canMove(ghost.x + candidate.x, ghost.y + candidate.y));

      candidates.sort((a, b) => {
        const distA = Math.abs(state.player.x - (ghost.x + a.x)) + Math.abs(state.player.y - (ghost.y + a.y));
        const distB = Math.abs(state.player.x - (ghost.x + b.x)) + Math.abs(state.player.y - (ghost.y + b.y));
        return distA - distB;
      });

      direction = candidates[0] || previous;
      if (direction.x === -previous.x && direction.y === -previous.y && candidates[1]) {
        direction = candidates[1];
      }
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

  state.ghosts.forEach((ghost) => {
    ghost.x = ghost.startX;
    ghost.y = ghost.startY;
    ghost.direction = { x: 0, y: 0 };
  });
}

function pushHistory(result) {
  const duration = state.runtime.startedAt
    ? Math.max(1, Math.round((Date.now() - state.runtime.startedAt) / 1000))
    : 0;

  state.game.history.unshift({
    result,
    score: state.game.currentScore,
    duration,
    finishedAt: new Date().toISOString(),
  });
  state.game.history = state.game.history.slice(0, 8);
}

function endGame(result) {
  if (state.runtime.timerId) {
    window.clearInterval(state.runtime.timerId);
    state.runtime.timerId = null;
  }

  if (result === "win") {
    state.game.currentScore += GAME.winBonus;
    if (state.game.currentScore > state.game.bestScore) {
      state.game.bestScore = state.game.currentScore;
    }
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
  updateOverlay("ended", result === "win" ? "你清空了迷宮" : "遊戲結束");
}

function handleCollisions() {
  for (const ghost of state.ghosts) {
    if (ghost.x !== state.player.x || ghost.y !== state.player.y) {
      continue;
    }

    if (Date.now() < state.game.frightenedUntil) {
      state.game.currentScore += 80;
      if (state.game.currentScore > state.game.bestScore) {
        state.game.bestScore = state.game.currentScore;
      }
      ghost.x = ghost.startX;
      ghost.y = ghost.startY;
      ghost.direction = { x: 0, y: 0 };
      return;
    }

    state.game.lives -= 1;
    if (state.game.lives <= 0) {
      endGame("lose");
      return;
    }

    resetActors();
    break;
  }
}

function tick() {
  tryApplyQueuedDirection();

  const nextX = state.player.x + state.runtime.direction.x;
  const nextY = state.player.y + state.runtime.direction.y;
  if (canMove(nextX, nextY)) {
    state.player.x = nextX;
    state.player.y = nextY;
  }

  collectAtPlayer();
  moveGhosts();
  handleCollisions();

  if (!state.game.isPlaying) {
    return;
  }

  if (state.game.pelletsLeft <= 0) {
    endGame("win");
    return;
  }

  state.game.updatedAt = new Date().toISOString();
  syncStats();
  renderScene();
}

function startGame() {
  if (!state.auth.isLoggedIn) {
    updateOverlay("locked");
    return;
  }

  if (state.runtime.timerId) {
    window.clearInterval(state.runtime.timerId);
  }

  initializeWorld();
  state.game.currentScore = 0;
  state.game.isPlaying = true;
  state.runtime.startedAt = Date.now();
  hideOverlay();
  syncStats();
  renderScene();
  state.runtime.timerId = window.setInterval(tick, GAME.tickMs);
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
  if (!username) {
    setMessage("請輸入使用者名稱。", "error");
    return;
  }

  const now = new Date().toISOString();
  const existing = getUserData(username);
  const loginHistory = Array.isArray(existing.loginHistory) ? existing.loginHistory.slice(-9) : [];
  loginHistory.push(now);

  saveUserData(username, {
    ...existing,
    username,
    loginHistory,
  });

  setCurrentUser({ username, loginTime: now });
  loadUserIntoState(username, now);
  syncStats();
  updateOverlay("ready");
  setMessage(`歡迎回來，${username}。資料已載入。`, "success");
  elements.usernameInput.value = username;
}

function handleLogout() {
  if (state.runtime.timerId) {
    window.clearInterval(state.runtime.timerId);
    state.runtime.timerId = null;
  }

  clearCurrentUser();
  state.auth.isLoggedIn = false;
  state.auth.username = "";
  state.auth.loginTime = null;
  state.game.isPlaying = false;
  state.game.currentScore = 0;
  state.game.bestScore = 0;
  state.game.lastScore = 0;
  state.game.gamesPlayed = 0;
  state.game.updatedAt = null;
  state.game.lastFinishedAt = null;
  state.game.history = [];
  elements.usernameInput.value = "";
  setMessage("已登出，目前為訪客狀態。", "success");
  initializeWorld();
  syncStats();
  renderScene();
  updateOverlay("locked");
}

function directionFromKey(key) {
  return KEY_TO_DIRECTION[key.toLowerCase()] || null;
}

function handleKeydown(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }

  const directionName = directionFromKey(event.key);
  if (!directionName) {
    return;
  }

  event.preventDefault();
  queueDirection(directionName, "keyboard");
}

function getGamepadDirection(gamepad) {
  if (!gamepad) {
    return null;
  }

  if (gamepad.buttons[12]?.pressed) {
    return "up";
  }
  if (gamepad.buttons[13]?.pressed) {
    return "down";
  }
  if (gamepad.buttons[14]?.pressed) {
    return "left";
  }
  if (gamepad.buttons[15]?.pressed) {
    return "right";
  }

  const xAxis = gamepad.axes[0] ?? 0;
  const yAxis = gamepad.axes[1] ?? 0;

  if (Math.abs(xAxis) > Math.abs(yAxis)) {
    if (xAxis <= -GAMEPAD_AXIS_THRESHOLD) {
      return "left";
    }
    if (xAxis >= GAMEPAD_AXIS_THRESHOLD) {
      return "right";
    }
  } else {
    if (yAxis <= -GAMEPAD_AXIS_THRESHOLD) {
      return "up";
    }
    if (yAxis >= GAMEPAD_AXIS_THRESHOLD) {
      return "down";
    }
  }

  return null;
}

function isStartButtonPressed(gamepad) {
  if (!gamepad) {
    return false;
  }

  return Boolean(gamepad.buttons[0]?.pressed || gamepad.buttons[9]?.pressed || gamepad.buttons[7]?.pressed);
}

function findPreferredGamepad() {
  const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  if (!gamepads.length) {
    return null;
  }

  const config = getControllerConfig();
  return gamepads.find((gamepad) => config.preferredMatcher(gamepad)) || null;
}

function stopGamepadPolling() {
  if (state.controller.frameId) {
    window.cancelAnimationFrame(state.controller.frameId);
    state.controller.frameId = null;
  }
}

function pollGamepad() {
  const gamepad = state.controller.gamepadIndex !== null
    ? navigator.getGamepads?.()[state.controller.gamepadIndex]
    : findPreferredGamepad();

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
  if (directionName && directionName !== state.controller.lastGamepadDirection) {
    queueDirection(directionName, `gamepad ${state.controller.gamepadName}`);
  }
  state.controller.lastGamepadDirection = directionName;

  const startPressed = isStartButtonPressed(gamepad);
  if (startPressed && !state.controller.lastStartPressed && !state.game.isPlaying && state.auth.isLoggedIn) {
    startGame();
  }
  state.controller.lastStartPressed = startPressed;

  state.controller.frameId = window.requestAnimationFrame(pollGamepad);
}

function startGamepadPolling() {
  if (state.controller.frameId) {
    return;
  }

  state.controller.frameId = window.requestAnimationFrame(pollGamepad);
}

function handleGamepadConnected(event) {
  const gamepad = event.gamepad;
  const config = getControllerConfig();
  if (state.controller.mode === "keyboard" || !config.preferredMatcher(gamepad)) {
    return;
  }

  state.controller.gamepadIndex = gamepad.index;
  state.controller.gamepadName = gamepad.id || "Gamepad";
  updateControllerStatus(
    "Connected",
    `已偵測到 ${config.connectedLabel}: ${state.controller.gamepadName}。可用方向鍵區、左類比或開始鍵操作。`,
    `gamepad ${state.controller.gamepadName}`
  );
  startGamepadPolling();
}

function handleGamepadDisconnected(event) {
  if (event.gamepad.index !== state.controller.gamepadIndex) {
    return;
  }

  const config = getControllerConfig();
  state.controller.gamepadIndex = null;
  state.controller.gamepadName = "";
  state.controller.lastGamepadDirection = null;
  state.controller.lastStartPressed = false;
  updateControllerStatus("Disconnected", config.disconnected, "keyboard");
  stopGamepadPolling();
}

function connectController() {
  if (state.controller.mode === "keyboard") {
    updateControllerStatus("Ready", CONTROLLER_MODES.keyboard.waiting, "keyboard");
    return;
  }

  const preferredGamepad = findPreferredGamepad();
  const config = getControllerConfig();

  if (preferredGamepad) {
    state.controller.gamepadIndex = preferredGamepad.index;
    state.controller.gamepadName = preferredGamepad.id || "Gamepad";
    updateControllerStatus(
      "Connected",
      `已使用 ${config.connectedLabel}: ${state.controller.gamepadName}。可直接開始遊戲。`,
      `gamepad ${state.controller.gamepadName}`
    );
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
  updateControllerStatus(
    state.controller.mode === "keyboard" ? "Ready" : "Disconnected",
    state.controller.mode === "keyboard" ? config.detail : config.cleared,
    "keyboard"
  );
}

function handleControllerModeChange() {
  state.controller.mode = elements.controllerModeSelect.value;
  disconnectController();
}

function bootstrap() {
  initializeWorld();
  renderScene();
  syncStats();
  syncControllerUi();

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
  if (initialGamepad) {
    handleGamepadConnected({ gamepad: initialGamepad });
  }
}

elements.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleLogin(elements.usernameInput.value);
});

elements.logoutButton.addEventListener("click", handleLogout);
elements.startButton.addEventListener("click", startGame);
elements.connectControllerButton.addEventListener("click", connectController);
elements.disconnectControllerButton.addEventListener("click", disconnectController);
elements.controllerModeSelect.addEventListener("change", handleControllerModeChange);

window.addEventListener("keydown", handleKeydown);
window.addEventListener("gamepadconnected", handleGamepadConnected);
window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);

bootstrap();
