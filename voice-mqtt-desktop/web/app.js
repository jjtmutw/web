const STORAGE_KEY = "voice_mqtt_desktop_settings";
const DOWNLOAD_URL = "https://jjtmutw.github.io/web/voice-mqtt-desktop/web/";
const LISTENER_DOWNLOAD_URL = "https://jjtmutw.github.io/web/voice-mqtt-desktop/dist/voice-mqtt-listener.zip";

const state = {
  client: null,
  scanner: null,
  isScanning: false,
  lastScanText: "",
  audioContext: null,
};

const elements = {
  brokerUrl: document.querySelector("#broker-url"),
  topicUser: document.querySelector("#topic-user"),
  topic: document.querySelector("#topic"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  connectButton: document.querySelector("#connect-button"),
  disconnectButton: document.querySelector("#disconnect-button"),
  mqttStatus: document.querySelector("#mqtt-status"),
  startScanButton: document.querySelector("#start-scan-button"),
  stopScanButton: document.querySelector("#stop-scan-button"),
  scanStatus: document.querySelector("#scan-status"),
  scannerCard: document.querySelector("#scanner-card"),
  transcriptInput: document.querySelector("#transcript-input"),
  appendEnter: document.querySelector("#append-enter"),
  sendButton: document.querySelector("#send-button"),
  clearButton: document.querySelector("#clear-button"),
  remoteButtons: document.querySelectorAll("[data-key-command]"),
  downloadQrcode: document.querySelector("#download-qrcode"),
  listenerDownloadQrcode: document.querySelector("#download-qrcode-listener"),
};

function renderQrcode(container, url) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (typeof QRCode === "undefined") {
    const fallback = document.createElement("a");
    fallback.href = url;
    fallback.target = "_blank";
    fallback.rel = "noreferrer";
    fallback.className = "download-link";
    fallback.textContent = url;
    container.append(fallback);
    return;
  }

  new QRCode(container, {
    text: url,
    width: 188,
    height: 188,
    colorDark: "#0f172a",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });
}

function renderDownloadQrcode() {
  renderQrcode(elements.downloadQrcode, DOWNLOAD_URL);
  renderQrcode(elements.listenerDownloadQrcode, LISTENER_DOWNLOAD_URL);
}

function normalizeTopicUser(value) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function buildTopic(user) {
  const normalizedUser = normalizeTopicUser(user);
  return normalizedUser ? `${normalizedUser}/input` : "";
}

function syncTopicFromUser() {
  elements.topic.value = buildTopic(elements.topicUser.value);
}

function inferTopicUser(settings) {
  if (settings.topicUser) {
    return settings.topicUser;
  }

  const legacyTopic = (settings.topic || "").trim();
  if (legacyTopic.endsWith("/input")) {
    return legacyTopic.slice(0, -"/input".length);
  }

  return "jj";
}

function saveSettings() {
  syncTopicFromUser();

  const settings = {
    brokerUrl: elements.brokerUrl.value.trim(),
    topicUser: normalizeTopicUser(elements.topicUser.value),
    topic: elements.topic.value.trim(),
    username: elements.username.value.trim(),
    password: elements.password.value,
    appendEnter: elements.appendEnter.checked,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const settings = JSON.parse(raw);
    elements.brokerUrl.value = settings.brokerUrl || "wss://broker.emqx.io:8084/mqtt";
    elements.topicUser.value = inferTopicUser(settings);
    syncTopicFromUser();
    elements.username.value = settings.username || "";
    elements.password.value = settings.password || "";
    elements.appendEnter.checked = settings.appendEnter !== false;
  } catch {
    setMqttStatus("設定讀取失敗，已使用預設值。");
  }
}

function setMqttStatus(text) {
  elements.mqttStatus.textContent = text;
}

function setScanStatus(text) {
  elements.scanStatus.textContent = text;
}

function hasQrScannerApi() {
  return typeof Html5Qrcode !== "undefined";
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function ensureConnected() {
  if (!state.client || !state.client.connected) {
    setMqttStatus("尚未連線 MQTT，請先連線。");
    return false;
  }

  return true;
}

function buildTextPayload(text, source = "mobile-web") {
  return JSON.stringify({
    action: "text",
    text: normalizeText(text),
    append_enter: elements.appendEnter.checked,
    source,
    timestamp: new Date().toISOString(),
  });
}

function buildKeyPayload(key) {
  return JSON.stringify({
    action: "key",
    key,
    source: "mobile-remote",
    timestamp: new Date().toISOString(),
  });
}

function publishRaw(payload, onSuccessMessage) {
  syncTopicFromUser();
  const topic = elements.topic.value.trim();

  if (!ensureConnected()) {
    return false;
  }

  if (!topic) {
    setMqttStatus("Topic 不可空白。");
    return false;
  }

  saveSettings();

  state.client.publish(topic, payload, { qos: 0, retain: false }, (error) => {
    if (error) {
      setMqttStatus(`送出失敗：${error.message}`);
      return;
    }

    setMqttStatus(onSuccessMessage);
  });

  return true;
}

function publishText(text, source = "mobile-web") {
  const normalized = normalizeText(text);
  if (!normalized) {
    setMqttStatus("請先輸入內容。");
    return false;
  }

  return publishRaw(buildTextPayload(normalized, source), `已送出文字到 ${elements.topic.value.trim()}`);
}

function publishKeyCommand(key) {
  return publishRaw(buildKeyPayload(key), `已送出按鍵：${key}`);
}

function connectMqtt() {
  if (typeof mqtt === "undefined") {
    setMqttStatus("MQTT 函式庫未載入。");
    return;
  }

  const brokerUrl = elements.brokerUrl.value.trim();
  syncTopicFromUser();
  const topic = elements.topic.value.trim();

  if (!brokerUrl || !topic) {
    setMqttStatus("請填入 Broker URL 與 Topic。");
    return;
  }

  saveSettings();

  if (state.client) {
    state.client.end(true);
    state.client = null;
  }

  setMqttStatus("正在連線 MQTT...");

  const options = {
    clean: true,
    connectTimeout: 5000,
    clientId: `voice_web_${Math.random().toString(16).slice(2, 10)}`,
  };

  if (elements.username.value.trim()) {
    options.username = elements.username.value.trim();
  }

  if (elements.password.value) {
    options.password = elements.password.value;
  }

  const client = mqtt.connect(brokerUrl, options);
  state.client = client;

  client.on("connect", () => {
    setMqttStatus(`已連線 MQTT，可送出到 ${topic}`);
  });

  client.on("reconnect", () => {
    setMqttStatus("MQTT 重新連線中...");
  });

  client.on("error", (error) => {
    setMqttStatus(`MQTT 錯誤：${error.message}`);
  });

  client.on("close", () => {
    setMqttStatus("MQTT 已中斷。");
  });
}

function disconnectMqtt() {
  if (state.client) {
    state.client.end(true);
    state.client = null;
  }

  setMqttStatus("MQTT 已中斷。");
}

function getAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return null;
  }

  if (!state.audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass();
  }

  return state.audioContext;
}

async function playSuccessDoubleBeep() {
  const audioContext = getAudioContext();
  if (!audioContext) {
    return;
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  const beepAt = (startTime, startFreq, endFreq) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(startFreq, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(endFreq, startTime + 0.08);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.55, startTime + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.18);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + 0.18);
  };

  const now = audioContext.currentTime;
  beepAt(now, 1760, 2200);
  beepAt(now + 0.24, 1568, 2093);
}

function flashCard(element) {
  if (!element) {
    return;
  }

  element.classList.remove("success-flash");
  void element.offsetWidth;
  element.classList.add("success-flash");
}

function handleScanSuccess(decodedText) {
  const normalized = normalizeText(decodedText);
  if (!normalized || normalized === state.lastScanText) {
    return;
  }

  state.lastScanText = normalized;
  elements.transcriptInput.value = normalized;
  setScanStatus("掃描成功，內容已帶入文字框。");
  flashCard(elements.scannerCard);
  playSuccessDoubleBeep().catch(() => {});
}

async function startScanner() {
  if (state.isScanning) {
    return;
  }

  if (!hasQrScannerApi()) {
    setScanStatus("掃描模組未載入。");
    return;
  }

  state.lastScanText = "";
  if (!state.scanner) {
    state.scanner = new Html5Qrcode("scanner");
  }

  try {
    await state.scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 240, height: 240 },
        aspectRatio: 1.333334,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
        ],
      },
      handleScanSuccess,
      () => {}
    );

    state.isScanning = true;
    setScanStatus("相機已開啟，請對準 QR Code 或條碼。");
  } catch (error) {
    state.isScanning = false;
    setScanStatus(`無法啟動相機：${error.message}`);
  }
}

async function stopScanner() {
  if (!state.scanner || !state.isScanning) {
    return;
  }

  try {
    await state.scanner.stop();
    await state.scanner.clear();
    state.isScanning = false;
    state.scanner = null;
    setScanStatus("掃描已停止。");
  } catch (error) {
    setScanStatus(`停止掃描失敗：${error.message}`);
  }
}

function sendText() {
  publishText(elements.transcriptInput.value, "mobile-web");
}

function clearContent() {
  elements.transcriptInput.value = "";
  elements.transcriptInput.focus();
}

function handleRemoteButtonClick(event) {
  const button = event.currentTarget;
  const key = button.dataset.keyCommand;
  if (!key) {
    return;
  }

  publishKeyCommand(key);
}

function bootstrap() {
  loadSettings();
  syncTopicFromUser();
  renderDownloadQrcode();

  if (!hasQrScannerApi()) {
    setScanStatus("掃描模組未載入。");
  }
}

elements.topicUser.addEventListener("input", syncTopicFromUser);
elements.connectButton.addEventListener("click", connectMqtt);
elements.disconnectButton.addEventListener("click", disconnectMqtt);
elements.startScanButton.addEventListener("click", startScanner);
elements.stopScanButton.addEventListener("click", stopScanner);
elements.sendButton.addEventListener("click", sendText);
elements.clearButton.addEventListener("click", clearContent);
elements.remoteButtons.forEach((button) => {
  button.addEventListener("click", handleRemoteButtonClick);
});

window.addEventListener("beforeunload", () => {
  if (state.client) {
    state.client.end(true);
  }

  if (state.scanner && state.isScanning) {
    state.scanner.stop().catch(() => {});
  }
});

bootstrap();
