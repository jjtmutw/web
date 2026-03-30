const STORAGE_KEY = "voice_mqtt_desktop_settings";

const state = {
  client: null,
  recognition: null,
  isListening: false,
};

const elements = {
  brokerUrl: document.querySelector("#broker-url"),
  topic: document.querySelector("#topic"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  connectButton: document.querySelector("#connect-button"),
  disconnectButton: document.querySelector("#disconnect-button"),
  mqttStatus: document.querySelector("#mqtt-status"),
  languageSelect: document.querySelector("#language-select"),
  listenButton: document.querySelector("#listen-button"),
  stopButton: document.querySelector("#stop-button"),
  speechStatus: document.querySelector("#speech-status"),
  transcriptInput: document.querySelector("#transcript-input"),
  appendEnter: document.querySelector("#append-enter"),
  sendButton: document.querySelector("#send-button"),
  clearButton: document.querySelector("#clear-button"),
  log: document.querySelector("#log"),
};

function addLog(message, level = "info") {
  const row = document.createElement("div");
  row.className = "log-entry";
  const stamp = new Date().toLocaleTimeString("zh-TW", { hour12: false });
  row.innerHTML = `<strong>[${stamp}]</strong> ${message}`;

  if (level === "error") {
    row.style.color = "#ffb3b3";
  }

  elements.log.prepend(row);
}

function saveSettings() {
  const settings = {
    brokerUrl: elements.brokerUrl.value.trim(),
    topic: elements.topic.value.trim(),
    username: elements.username.value.trim(),
    password: elements.password.value,
    language: elements.languageSelect.value,
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
    elements.brokerUrl.value = settings.brokerUrl || "";
    elements.topic.value = settings.topic || "jj/voice/input";
    elements.username.value = settings.username || "";
    elements.password.value = settings.password || "";
    elements.languageSelect.value = settings.language || "zh-TW";
    elements.appendEnter.checked = settings.appendEnter !== false;
  } catch {
    addLog("無法載入本機設定，已使用預設值。", "error");
  }
}

function setMqttStatus(text) {
  elements.mqttStatus.textContent = text;
}

function setSpeechStatus(text) {
  elements.speechStatus.textContent = text;
}

function hasSpeechApi() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function currentPayload() {
  return JSON.stringify({
    text: normalizeText(elements.transcriptInput.value),
    append_enter: elements.appendEnter.checked,
    source: "mobile-web",
    timestamp: new Date().toISOString(),
  });
}

function connectMqtt() {
  if (typeof mqtt === "undefined") {
    addLog("MQTT 前端函式庫沒有載入成功。", "error");
    return;
  }

  const brokerUrl = elements.brokerUrl.value.trim();
  const topic = elements.topic.value.trim();

  if (!brokerUrl || !topic) {
    addLog("請先輸入 Broker URL 和 Topic。", "error");
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
    setMqttStatus(`已連線到 MQTT，可發送到 Topic：${topic}`);
    addLog(`MQTT 連線成功，Topic：${topic}`);
  });

  client.on("reconnect", () => {
    setMqttStatus("MQTT 重新連線中...");
    addLog("MQTT 正在重新連線...");
  });

  client.on("error", (error) => {
    setMqttStatus("MQTT 連線錯誤，請檢查 Broker 設定。");
    addLog(`MQTT 錯誤：${error.message}`, "error");
  });

  client.on("close", () => {
    setMqttStatus("MQTT 已中斷連線。");
    addLog("MQTT 已中斷連線。");
  });
}

function disconnectMqtt() {
  if (state.client) {
    state.client.end(true);
    state.client = null;
  }
  setMqttStatus("MQTT 已手動中斷。");
}

function createRecognition() {
  if (!hasSpeechApi()) {
    setSpeechStatus("目前瀏覽器不支援語音辨識 API。建議使用 Android Chrome。");
    addLog("瀏覽器不支援 SpeechRecognition。", "error");
    return null;
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = elements.languageSelect.value;
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isListening = true;
    setSpeechStatus("正在聽取語音...");
    addLog("語音辨識已開始。");
  };

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const segment = event.results[i][0]?.transcript || "";
      if (event.results[i].isFinal) {
        finalText += segment;
      } else {
        interimText += segment;
      }
    }

    const merged = normalizeText(finalText || interimText);
    elements.transcriptInput.value = merged;
    setSpeechStatus(finalText ? "辨識完成，可以送出。" : "辨識中...");
  };

  recognition.onerror = (event) => {
    state.isListening = false;
    setSpeechStatus(`語音辨識錯誤：${event.error}`);
    addLog(`語音辨識錯誤：${event.error}`, "error");
  };

  recognition.onend = () => {
    state.isListening = false;
    setSpeechStatus("語音辨識已停止。");
    addLog("語音辨識已停止。");
  };

  return recognition;
}

function startListening() {
  if (!state.recognition) {
    state.recognition = createRecognition();
  }

  if (!state.recognition || state.isListening) {
    return;
  }

  elements.transcriptInput.value = "";
  state.recognition.lang = elements.languageSelect.value;
  saveSettings();
  state.recognition.start();
}

function stopListening() {
  if (state.recognition && state.isListening) {
    state.recognition.stop();
  }
}

function sendText() {
  const topic = elements.topic.value.trim();
  const text = normalizeText(elements.transcriptInput.value);

  if (!state.client || !state.client.connected) {
    addLog("MQTT 尚未連線。", "error");
    return;
  }

  if (!topic || !text) {
    addLog("請確認 Topic 與文字內容不為空。", "error");
    return;
  }

  saveSettings();

  state.client.publish(topic, currentPayload(), { qos: 0, retain: false }, (error) => {
    if (error) {
      addLog(`發送失敗：${error.message}`, "error");
      return;
    }

    addLog(`已發送文字到 ${topic}：${text}`);
  });
}

function bootstrap() {
  loadSettings();
  addLog("系統已就緒。先連線 MQTT，再開始語音辨識。");

  if (!hasSpeechApi()) {
    addLog("此瀏覽器可能不支援語音辨識。", "error");
  }
}

elements.connectButton.addEventListener("click", connectMqtt);
elements.disconnectButton.addEventListener("click", disconnectMqtt);
elements.listenButton.addEventListener("click", startListening);
elements.stopButton.addEventListener("click", stopListening);
elements.sendButton.addEventListener("click", sendText);
elements.clearButton.addEventListener("click", () => {
  elements.transcriptInput.value = "";
  addLog("已清空文字內容。");
});

bootstrap();
