const STORAGE_KEYS = {
  currentUser: "ag_current_user",
  userPrefix: "ag_user_data_",
};

const GAME = {
  tileCount: 21,
  tileSize: 20,
  tickMs: 220,
};

const GAMEPAD_AXIS_THRESHOLD = 0.55;

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
  },
  snake: {
    cells: [],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: { x: 10, y: 10 },
    timerId: null,
  },
  controller: {
    source: "keyboard",
    status: "Disconnected",
    detail: "Plug your USB gamepad into the computer, then click connect or press any button on the pad.",
    gamepadIndex: null,
    gamepadName: "",
    frameId: null,
    lastGamepadDirection: null,
    lastStartPressed: false,
  },
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  usernameInput: document.querySelector("#username-input"),
  loginMessage: document.querySelector("#login-message"),
  logoutButton: document.querySelector("#logout-button"),
  userStatus: document.querySelector("#user-status"),
  statUsername: document.querySelector("#stat-username"),
  statLoginTime: document.querySelector("#stat-login-time"),
  statCurrentScore: document.querySelector("#stat-current-score"),
  statBestScore: document.querySelector("#stat-best-score"),
  statLastScore: document.querySelector("#stat-last-score"),
  statGamesPlayed: document.querySelector("#stat-games-played"),
  statUpdatedAt: document.querySelector("#stat-updated-at"),
  canvas: document.querySelector("#game-canvas"),
  gameOverlay: document.querySelector("#game-overlay"),
  overlayTitle: document.querySelector("#overlay-title"),
  overlayCopy: document.querySelector("#overlay-copy"),
  startButton: document.querySelector("#start-button"),
  controllerStatus: document.querySelector("#controller-status"),
  controllerDetail: document.querySelector("#controller-detail"),
  connectControllerButton: document.querySelector("#connect-controller-button"),
  disconnectControllerButton: document.querySelector("#disconnect-controller-button"),
};

const ctx = elements.canvas.getContext("2d");

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
  const value = readJson(getUserDataKey(username));
  return value || createDefaultUserData(username);
}

function saveUserData(username, payload) {
  writeJson(getUserDataKey(username), payload);
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date(value));
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}/${map.month}/${map.day} ${map.hour}:${map.minute} 台北時間`;
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

function syncStats() {
  elements.userStatus.textContent = state.auth.isLoggedIn
    ? `${state.auth.username} - ${formatDate(state.auth.loginTime)}`
    : "Not signed in";
  elements.statUsername.textContent = state.auth.isLoggedIn ? state.auth.username : "-";
  elements.statLoginTime.textContent = formatDate(state.auth.loginTime);
  elements.statCurrentScore.textContent = String(state.game.currentScore);
  elements.statBestScore.textContent = String(state.game.bestScore);
  elements.statLastScore.textContent = String(state.game.lastScore);
  elements.statGamesPlayed.textContent = String(state.game.gamesPlayed);
  elements.statUpdatedAt.textContent = formatDate(state.game.updatedAt);
  elements.logoutButton.disabled = !state.auth.isLoggedIn;
  elements.logoutButton.style.opacity = state.auth.isLoggedIn ? "1" : "0.55";
}

function syncControllerUi() {
  elements.controllerStatus.textContent = state.controller.status;
  elements.controllerDetail.textContent = state.controller.detail;
  elements.disconnectControllerButton.disabled = state.controller.gamepadIndex === null;
  elements.disconnectControllerButton.style.opacity =
    elements.disconnectControllerButton.disabled ? "0.55" : "1";
}

function updateControllerStatus(status, detail, source = state.controller.source) {
  state.controller.status = status;
  state.controller.detail = detail;
  state.controller.source = source;
  syncControllerUi();
}

function updateOverlay(mode, score = 0) {
  elements.gameOverlay.classList.remove("is-hidden");

  if (mode === "locked") {
    elements.overlayTitle.textContent = "Sign in first";
    elements.overlayCopy.textContent =
      "After sign-in, start the game and control the snake with keyboard or a USB gamepad.";
    elements.startButton.textContent = "Sign in to play";
    elements.startButton.disabled = true;
    return;
  }

  if (mode === "ready") {
    elements.overlayTitle.textContent = "Ready";
    elements.overlayCopy.textContent =
      "Use arrow keys, WASD, or your USB gamepad to control the snake.";
    elements.startButton.textContent = "Start game";
    elements.startButton.disabled = false;
    return;
  }

  if (mode === "ended") {
    elements.overlayTitle.textContent = "Game over";
    elements.overlayCopy.textContent = `Score: ${score}. Press start game to try again.`;
    elements.startButton.textContent = "Play again";
    elements.startButton.disabled = false;
  }
}

function hideOverlay() {
  elements.gameOverlay.classList.add("is-hidden");
}

function renderBoard() {
  const width = GAME.tileCount * GAME.tileSize;
  const height = width;

  ctx.clearRect(0, 0, width, height);

  for (let y = 0; y < GAME.tileCount; y += 1) {
    for (let x = 0; x < GAME.tileCount; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "rgba(15, 23, 42, 0.9)" : "rgba(30, 41, 59, 0.88)";
      ctx.fillRect(x * GAME.tileSize, y * GAME.tileSize, GAME.tileSize, GAME.tileSize);
    }
  }

  ctx.fillStyle = "#d946ef";
  ctx.shadowColor = "rgba(217, 70, 239, 0.75)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(
    state.snake.food.x * GAME.tileSize + GAME.tileSize / 2,
    state.snake.food.y * GAME.tileSize + GAME.tileSize / 2,
    GAME.tileSize * 0.34,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.shadowBlur = 0;

  state.snake.cells.forEach((cell, index) => {
    ctx.fillStyle = index === 0 ? "#67e8f9" : "#22d3ee";
    ctx.fillRect(
      cell.x * GAME.tileSize + 2,
      cell.y * GAME.tileSize + 2,
      GAME.tileSize - 4,
      GAME.tileSize - 4
    );
  });
}

function placeFood() {
  const occupied = new Set(state.snake.cells.map((cell) => `${cell.x},${cell.y}`));

  let next = null;
  while (!next || occupied.has(`${next.x},${next.y}`)) {
    next = {
      x: Math.floor(Math.random() * GAME.tileCount),
      y: Math.floor(Math.random() * GAME.tileCount),
    };
  }

  state.snake.food = next;
}

function persistGameData() {
  if (!state.auth.isLoggedIn) {
    return;
  }

  const data = getUserData(state.auth.username);
  const payload = {
    ...data,
    bestScore: state.game.bestScore,
    lastScore: state.game.lastScore,
    gamesPlayed: state.game.gamesPlayed,
    updatedAt: state.game.updatedAt,
  };

  saveUserData(state.auth.username, payload);
}

function endGame() {
  if (state.snake.timerId) {
    window.clearInterval(state.snake.timerId);
    state.snake.timerId = null;
  }

  state.game.isPlaying = false;
  state.game.lastScore = state.game.currentScore;
  state.game.gamesPlayed += 1;
  state.game.updatedAt = new Date().toISOString();
  if (state.game.currentScore > state.game.bestScore) {
    state.game.bestScore = state.game.currentScore;
  }

  persistGameData();
  syncStats();
  updateOverlay("ended", state.game.currentScore);
}

function tick() {
  state.snake.direction = { ...state.snake.nextDirection };
  const head = state.snake.cells[0];
  const nextHead = {
    x: head.x + state.snake.direction.x,
    y: head.y + state.snake.direction.y,
  };

  const hitWall =
    nextHead.x < 0 ||
    nextHead.y < 0 ||
    nextHead.x >= GAME.tileCount ||
    nextHead.y >= GAME.tileCount;

  const hitSelf = state.snake.cells.some((cell) => cell.x === nextHead.x && cell.y === nextHead.y);

  if (hitWall || hitSelf) {
    endGame();
    renderBoard();
    return;
  }

  state.snake.cells.unshift(nextHead);

  if (nextHead.x === state.snake.food.x && nextHead.y === state.snake.food.y) {
    state.game.currentScore += 10;
    if (state.game.currentScore > state.game.bestScore) {
      state.game.bestScore = state.game.currentScore;
    }
    state.game.updatedAt = new Date().toISOString();
    placeFood();
    persistGameData();
    syncStats();
  } else {
    state.snake.cells.pop();
  }

  renderBoard();
}

function startGame() {
  if (!state.auth.isLoggedIn) {
    updateOverlay("locked");
    return;
  }

  if (state.snake.timerId) {
    window.clearInterval(state.snake.timerId);
  }

  state.game.isPlaying = true;
  state.game.currentScore = 0;
  state.snake.cells = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ];
  state.snake.direction = { x: 1, y: 0 };
  state.snake.nextDirection = { x: 1, y: 0 };
  placeFood();
  hideOverlay();
  syncStats();
  renderBoard();
  state.snake.timerId = window.setInterval(tick, GAME.tickMs);
}

function loadUserIntoState(username, loginTime) {
  const data = getUserData(username);
  state.auth.isLoggedIn = true;
  state.auth.username = username;
  state.auth.loginTime = loginTime;
  state.game.currentScore = 0;
  state.game.bestScore = data.bestScore;
  state.game.lastScore = data.lastScore;
  state.game.gamesPlayed = data.gamesPlayed;
  state.game.updatedAt = data.updatedAt;
}

function handleLogin(usernameInput) {
  const username = usernameInput.trim();
  if (!username) {
    setMessage("Enter a username.", "error");
    return;
  }

  const now = new Date().toISOString();
  const data = getUserData(username);
  const loginHistory = Array.isArray(data.loginHistory) ? data.loginHistory.slice(-9) : [];
  loginHistory.push(now);

  saveUserData(username, {
    ...data,
    username,
    loginHistory,
    updatedAt: data.updatedAt,
  });
  setCurrentUser({ username, loginTime: now });
  loadUserIntoState(username, now);
  syncStats();
  updateOverlay("ready");
  setMessage(`Welcome back, ${username}.`, "success");
  elements.usernameInput.value = username;
}

function handleLogout() {
  if (state.snake.timerId) {
    window.clearInterval(state.snake.timerId);
    state.snake.timerId = null;
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
  elements.usernameInput.value = "";
  setMessage("You are signed out.", "success");
  syncStats();
  updateOverlay("locked");
  renderBoard();
}

function isReverseDirection(next, current) {
  return next.x === -current.x && next.y === -current.y;
}

function queueDirection(directionName, source = "keyboard") {
  const next = DIRECTION_MAP[directionName];
  if (!next || !state.game.isPlaying) {
    return;
  }

  const current = state.snake.direction;
  if (isReverseDirection(next, current)) {
    return;
  }

  state.snake.nextDirection = { ...next };
  if (source !== "keyboard") {
    updateControllerStatus(
      "Connected",
      `${source} sent ${directionName.toUpperCase()} input.`,
      source
    );
  }
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

  return Boolean(
    gamepad.buttons[0]?.pressed ||
    gamepad.buttons[9]?.pressed ||
    gamepad.buttons[7]?.pressed
  );
}

function findPreferredGamepad() {
  const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  if (!gamepads.length) {
    return null;
  }

  return gamepads[0];
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
    state.controller.gamepadIndex = null;
    state.controller.gamepadName = "";
    state.controller.lastGamepadDirection = null;
    state.controller.lastStartPressed = false;
    updateControllerStatus(
      "Disconnected",
      "No USB gamepad was found. Plug the controller in and press any button.",
      "keyboard"
    );
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
  state.controller.gamepadIndex = gamepad.index;
  state.controller.gamepadName = gamepad.id || "Gamepad";
  updateControllerStatus(
    "Connected",
    `Detected USB gamepad: ${state.controller.gamepadName}. Use D-pad or left stick. Press A or Start to begin.`,
    `gamepad ${state.controller.gamepadName}`
  );
  startGamepadPolling();
}

function handleGamepadDisconnected(event) {
  if (event.gamepad.index !== state.controller.gamepadIndex) {
    return;
  }

  state.controller.gamepadIndex = null;
  state.controller.gamepadName = "";
  state.controller.lastGamepadDirection = null;
  state.controller.lastStartPressed = false;
  updateControllerStatus(
    "Disconnected",
    "USB gamepad disconnected. Plug it back in and press any button so the browser can detect it again.",
    "keyboard"
  );
  stopGamepadPolling();
}

async function connectController() {
  const preferredGamepad = findPreferredGamepad();
  if (preferredGamepad) {
    state.controller.gamepadIndex = preferredGamepad.index;
    state.controller.gamepadName = preferredGamepad.id || "Gamepad";
    updateControllerStatus(
      "Connected",
      `Using detected USB gamepad: ${state.controller.gamepadName}. Press A or Start to begin.`,
      `gamepad ${state.controller.gamepadName}`
    );
    startGamepadPolling();
    return;
  }

  updateControllerStatus(
    "Waiting",
    "No USB gamepad detected yet. Plug it in, press any button, then click connect again.",
    "keyboard"
  );
}

async function disconnectController() {
  stopGamepadPolling();
  state.controller.gamepadIndex = null;
  state.controller.gamepadName = "";
  state.controller.lastGamepadDirection = null;
  state.controller.lastStartPressed = false;

  updateControllerStatus(
    "Disconnected",
    "Controller connection was cleared. Plug the USB gamepad in again when needed.",
    "keyboard"
  );
}

function bootstrap() {
  renderBoard();
  syncStats();
  syncControllerUi();

  const currentUser = getCurrentUser();
  if (currentUser && currentUser.username && currentUser.loginTime) {
    loadUserIntoState(currentUser.username, currentUser.loginTime);
    elements.usernameInput.value = currentUser.username;
    syncStats();
    updateOverlay("ready");
    setMessage(`Loaded saved session for ${currentUser.username}.`, "success");
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
elements.connectControllerButton.addEventListener("click", () => {
  connectController();
});
elements.disconnectControllerButton.addEventListener("click", () => {
  disconnectController();
});

window.addEventListener("keydown", handleKeydown);
window.addEventListener("gamepadconnected", handleGamepadConnected);
window.addEventListener("gamepaddisconnected", handleGamepadDisconnected);

bootstrap();
