# main.py
# ------------------------------------------------------------
# MQTT JSON IN (voice text) -> Intent classification (intent_clf.joblib)
# + Slot extraction (device/channel/brightness) -> MQTT JSON OUT (IoT command)
#
# IN  topic: JJ/voice/in
# IN  payload (JSON object):
#   {
#     "text": "關閉第二個裝置的第二個燈",
#     "device": "DEV_A" | "DEV_B",        # optional (force)
#     "reply_to": "JJ/voice/out",         # optional
#     "req_id": "1001",                   # optional
#     "user": "jj"                        # optional
#   }
#
# OUT:
#   publish to device cmd_topic with JSON payload:
#     {"payload":"s2_off","src":"nlp-bridge"}
#
# Reply (JSON) to reply_to (default JJ/voice/out) includes parse + cmd info.
# ------------------------------------------------------------
import time
import hashlib

import json
import re
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple

import joblib
import paho.mqtt.client as mqtt

# =========================
# MQTT Broker
# =========================
MQTT_HOST = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_KEEPALIVE = 60
MQTT_USERNAME = None
MQTT_PASSWORD = None

DEFAULT_QOS = 1
DEFAULT_RETAIN = False

# =========================
# MQTT Topics (INPUT/REPLY)
# =========================
VOICE_IN_TOPIC = "JJ/voice/in"
DEFAULT_REPLY_TOPIC = "JJ/voice/out"

# Avoid loop (optional)
BRIDGE_SRC_TAG = "nlp-bridge"  # set "" to disable

# =========================
# Devices (2 devices)
# =========================
DEVICES = {
    "DEV_A": {
        "device_id": "JJ/LED001",
        "cmd_topic": "JJ/LED001",
        "state_topic": "JJ/LED001/state",
        "out_format": "JSON",        # force JSON for both devices
        "json_key": "payload",
        "keywords": [
            "一號裝置", "第一裝置", "第一個裝置", "裝置一", "設備一", "第一台", "一號設備",
            "LED001", "001", "A",
            # 你也可以保留情境詞（例如客廳）
            "客廳", "大燈"
        ],
    },
    "DEV_B": {
        "device_id": "JJ/LED002",
        "cmd_topic": "JJ/LED002",
        "state_topic": "JJ/LED002/state",
        "out_format": "JSON",        # force JSON for both devices
        "json_key": "payload",
        "keywords": [
            "二號裝置", "第二裝置", "第二個裝置", "裝置二", "設備二", "第二台", "二號設備",
            "LED002", "002", "B",
            # 你也可以保留情境詞（例如臥室）
            "臥室", "房間"
        ],
    }
}
DEFAULT_DEVICE_KEY = "DEV_A"

# =========================
# Intent Model (5 intents)
# =========================
MODEL_PATH = "intent_clf.joblib"
ALLOWED_INTENTS = {"toggle", "turn_on", "turn_off", "set_brightness", "query_state"}

# Model confidence threshold (if predict_proba exists)
INTENT_CONF_THRESHOLD = 0.65

def load_model(path: str):
    try:
        return joblib.load(path)
    except Exception:
        return None

MODEL = load_model(MODEL_PATH)

# =========================
# Command mapping
# =========================
def build_payload(intent: str, channel: int, brightness: Optional[int]) -> str:
    if channel < 1 or channel > 4:
        raise ValueError("channel must be 1..4")

    if intent == "toggle":
        return f"s{channel}_toggle"
    if intent == "turn_on":
        return f"s{channel}_on"
    if intent == "turn_off":
        return f"s{channel}_off"
    if intent == "set_brightness":
        if brightness is None:
            raise ValueError("brightness is required")
        b = max(0, min(100, int(brightness)))
        return f"s{channel}_bri_{b}"
    raise ValueError(f"unsupported intent: {intent}")

def format_out_payload(cmd: str, device_cfg: dict) -> str:
    # Always JSON in this version
    key = device_cfg.get("json_key") or "payload"
    obj = {key: cmd}
    if BRIDGE_SRC_TAG:
        obj["src"] = BRIDGE_SRC_TAG
    return json.dumps(obj, ensure_ascii=False)

# =========================
# Slot Extraction
# =========================
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "1": 1, "2": 2, "3": 3, "4": 4}

# Detect device phrase (supports: 第二裝置 / 第二個裝置 / 二號裝置 / 裝置二 / 第2裝置 / 設備二 ...)
DEVICE_PHRASE_RE = re.compile(
    r"(第?\s*(一|二|1|2)\s*(?:號|个|個)?\s*(?:台|臺)?\s*(?:裝置|設備|device))|"
    r"((?:裝置|設備)\s*(一|二|1|2))",
    re.IGNORECASE
)

# Brightness patterns
BRIGHTNESS_PATTERNS = [
    re.compile(r"(?:亮度|明亮|brightness)\s*(?:到|調到|調整到|設為|為)?\s*(\d{1,3})\s*%?"),
    re.compile(r"(?:調亮|調暗|變亮|變暗)\s*(\d{1,3})\s*%?"),
]

def detect_device_key(text: str) -> str:
    t = text.strip()

    # 1) strong device phrase match first
    m = DEVICE_PHRASE_RE.search(t)
    if m:
        # groups: (1)(2) or (3)(4)
        g = m.group(2) or m.group(4)
        if g in ["2", "二"]:
            return "DEV_B"
        if g in ["1", "一"]:
            return "DEV_A"

    # 2) keywords scan
    for k, cfg in DEVICES.items():
        for kw in cfg.get("keywords", []):
            if kw and kw in t:
                return k

    return DEFAULT_DEVICE_KEY

def extract_brightness(text: str) -> Optional[int]:
    t = text.strip()
    for pat in BRIGHTNESS_PATTERNS:
        m = pat.search(t)
        if m:
            try:
                v = int(m.group(1))
                return max(0, min(100, v))
            except Exception:
                return None

    # also support "調到 80"
    m2 = re.search(r"(?:到|調到|設到|設為)\s*(\d{1,3})\s*%?", t)
    if m2:
        v = int(m2.group(1))
        if 0 <= v <= 100:
            return v
    return None

def extract_channel(text: str) -> int:
    t = text.strip()

    # IMPORTANT: remove device phrase first (avoid "第二裝置" -> channel=2)
    t_wo_device = DEVICE_PHRASE_RE.sub(" ", t)

    # 1) prefer patterns near 灯/LED
    pat_near_light = re.compile(
        r"(?:第\s*)?([一二三四1234])\s*(?:盞|號|个|個)\s*(?:燈|led|LED)",
        re.IGNORECASE
    )
    m = pat_near_light.search(t_wo_device)
    if m:
        s = m.group(1)
        return CN_NUM.get(s, 1)

    # 2) LED3 / s3
    pat_led = re.compile(r"(?:LED|led|s)\s*([1234])", re.IGNORECASE)
    m = pat_led.search(t_wo_device)
    if m:
        return int(m.group(1))

    # 3) fallback (loose) but AFTER removing device phrase
    pat_loose = re.compile(r"(?:第\s*)?([一二三四1234])\s*(?:盞|號|个|個)?", re.IGNORECASE)
    m = pat_loose.search(t_wo_device)
    if m:
        s = m.group(1)
        return CN_NUM.get(s, 1)

    return 1

# =========================
# Intent Prediction: model + hard guard + confidence fallback
# =========================
def rule_intent(text: str) -> Optional[str]:
    t = text.strip()

    # toggle first
    if any(x in t for x in ["切換", "切一下", "toggle", "翻轉"]):
        return "toggle"

    # brightness
    if any(x in t for x in ["亮度", "明亮", "brightness", "調亮", "調暗", "變亮", "變暗"]) or extract_brightness(t) is not None:
        return "set_brightness"

    # turn_off MUST be before turn_on
    if any(x in t for x in ["關閉", "關掉", "關燈", "OFF", "off"]):
        return "turn_off"
    if "關" in t and "開關" not in t:
        return "turn_off"

    # turn_on strong words
    if any(x in t for x in ["打開", "開啟", "開燈", "ON", "on"]):
        return "turn_on"
    # single char "開" last, and must not include "關"
    if "開" in t and "關" not in t:
        return "turn_on"

    # query
    if any(x in t for x in ["狀態", "是開的嗎", "有開嗎", "開了沒"]):
        return "query_state"

    return None

def _model_predict_with_confidence(text: str) -> Tuple[Optional[str], Optional[float]]:
    if MODEL is None:
        return None, None

    try:
        pred = MODEL.predict([text])[0]
    except Exception:
        return None, None

    if pred not in ALLOWED_INTENTS:
        return None, None

    # If model supports predict_proba
    try:
        proba = MODEL.predict_proba([text])[0]
        conf = float(max(proba))
        return pred, conf
    except Exception:
        # No probability available
        return pred, None

def predict_intent(text: str) -> Tuple[str, Optional[str], Optional[float]]:
    """
    Returns: (intent, model_pred, model_conf)
    intent is the final decision.
    """
    t = text.strip()

    # A) hard guard
    guard = rule_intent(t)
    if guard in ALLOWED_INTENTS:
        pred, conf = _model_predict_with_confidence(t)
        return guard, pred, conf

    # B) model
    pred, conf = _model_predict_with_confidence(t)
    if pred is None:
        return "query_state", None, None

    # C) if confidence exists, apply threshold
    if conf is not None:
        if conf >= INTENT_CONF_THRESHOLD:
            return pred, pred, conf
        # low confidence: fallback to rule, else safe default
        fb = rule_intent(t)
        if fb in ALLOWED_INTENTS:
            return fb, pred, conf
        return "query_state", pred, conf

    # D) no confidence available: accept model pred (guard already checked strong words)
    return pred, pred, None

# =========================
# Parse + Execute
# =========================
@dataclass
class ParsedCommand:
    text: str
    intent: str
    device_key: str
    device_id: str
    channel: int
    brightness: Optional[int]
    reply_to: str
    req_id: Optional[str]
    user: Optional[str]
    model_pred: Optional[str]
    model_conf: Optional[float]

def parse_incoming_json(payload_bytes: bytes) -> Dict[str, Any]:
    s = payload_bytes.decode("utf-8", errors="replace").strip()
    try:
        obj = json.loads(s)
    except Exception:
        raise ValueError("VOICE payload must be JSON")
    if not isinstance(obj, dict):
        raise ValueError("VOICE JSON must be an object")
    return obj

def parse_command(obj: Dict[str, Any]) -> ParsedCommand:
    text = str(obj.get("text", "")).strip()
    if not text:
        raise ValueError("missing 'text' in JSON")

    reply_to = str(obj.get("reply_to") or DEFAULT_REPLY_TOPIC)
    req_id = obj.get("req_id")
    user = obj.get("user")

    forced_device = obj.get("device")
    if forced_device in DEVICES:
        device_key = forced_device
    else:
        device_key = detect_device_key(text)

    device_cfg = DEVICES[device_key]
    intent, model_pred, model_conf = predict_intent(text)

    channel = extract_channel(text)
    brightness = extract_brightness(text) if intent == "set_brightness" else None

    return ParsedCommand(
        text=text,
        intent=intent,
        device_key=device_key,
        device_id=device_cfg["device_id"],
        channel=channel,
        brightness=brightness,
        reply_to=reply_to,
        req_id=str(req_id) if req_id is not None else None,
        user=str(user) if user is not None else None,
        model_pred=model_pred,
        model_conf=model_conf
    )

# =========================
# MQTT Bridge (compat old/new paho-mqtt)
# =========================
class Bridge:
    def __init__(self):
        # Compatibility: paho-mqtt 2.x has CallbackAPIVersion, older doesn't
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        except Exception:
            self.client = mqtt.Client()

        if MQTT_USERNAME:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

        
        self.recent_cmd = {}   # key -> last_ts
        self.dedupe_window_sec = 3.0


        self.last_states: Dict[str, str] = {}
        self.connected = False

    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        # Some old versions use different callback signature; accept properties=None
        self.connected = (reason_code == 0)
        print(f"[MQTT] connected={self.connected} reason_code={reason_code}")
        client.subscribe(VOICE_IN_TOPIC, qos=1)
        for _, cfg in DEVICES.items():
            st = cfg.get("state_topic")
            if st:
                client.subscribe(st, qos=1)

    def publish(self, topic: str, payload: str, qos: int = DEFAULT_QOS, retain: bool = DEFAULT_RETAIN):
        print(f"[PUB] topic={topic} qos={qos} payload={payload}")
        self.client.publish(topic, payload, qos=qos, retain=retain)

    def reply(self, topic: str, obj: Dict[str, Any]):
        self.publish(topic, json.dumps(obj, ensure_ascii=False), qos=1, retain=False)

    def on_message(self, client, userdata, msg):
        if msg.topic == VOICE_IN_TOPIC:
            self.handle_voice(msg.payload)
            return

        payload = msg.payload.decode("utf-8", errors="replace")
        self.last_states[msg.topic] = payload
        print(f"[STATE] {msg.topic} -> {payload}")

    def handle_voice(self, payload_bytes: bytes):
        try:
            obj = parse_incoming_json(payload_bytes)
            parsed = parse_command(obj)

            device_cfg = DEVICES[parsed.device_key]

            print(f"[IN] {parsed.text}")
            if parsed.model_conf is not None:
                print(f"[MODEL] pred={parsed.model_pred} conf={parsed.model_conf:.3f}")
            else:
                print(f"[MODEL] pred={parsed.model_pred} conf=None")
            print(f"[PARSE] intent={parsed.intent} device={parsed.device_id} ch={parsed.channel} bri={parsed.brightness}")

            base_reply = {
                "ok": True,
                "req_id": parsed.req_id,
                "user": parsed.user,
                "text": parsed.text,
                "device_id": parsed.device_id,
                "intent": parsed.intent,
                "channel": parsed.channel,
                "brightness": parsed.brightness,
                "model_pred": parsed.model_pred,
                "model_conf": parsed.model_conf,
            }

            # query_state: no actuation
            if parsed.intent == "query_state":
                st = device_cfg.get("state_topic")
                last = self.last_states.get(st) if st else None
                base_reply.update({
                    "type": "query_state",
                    "state_topic": st,
                    "last_state": last,
                })
                self.reply(parsed.reply_to, base_reply)
                return

            # brightness must exist
            if parsed.intent == "set_brightness" and parsed.brightness is None:
                self.reply(parsed.reply_to, {
                    "ok": False,
                    "req_id": parsed.req_id,
                    "user": parsed.user,
                    "error": "missing_brightness",
                    "hint": "需要亮度數字，例如：把第二個裝置的第一號燈亮度調到30"
                })
                return

            # build and publish cmd
            cmd = build_payload(parsed.intent, parsed.channel, parsed.brightness)
            out_payload = format_out_payload(cmd, device_cfg)

            # --- dedupe: same (device_id + cmd) within window -> ignore ---
            key_raw = f"{parsed.device_id}|{cmd}"
            key = hashlib.md5(key_raw.encode("utf-8")).hexdigest()
            now = time.time()

            last = self.recent_cmd.get(key)
            if last is not None and (now - last) < self.dedupe_window_sec:
                print(f"[DEDUPE] ignore duplicate cmd within {self.dedupe_window_sec}s: {key_raw}")
                base_reply.update({
                    "type": "deduped",
                    "cmd": cmd,
                    "cmd_topic": device_cfg["cmd_topic"],
                    "sent": None,
                })
                self.reply(parsed.reply_to, base_reply)
                return

            self.recent_cmd[key] = now

            print(f"[CMD] topic={device_cfg['cmd_topic']} cmd={cmd} out_format=JSON")
            self.publish(device_cfg["cmd_topic"], out_payload, qos=DEFAULT_QOS, retain=DEFAULT_RETAIN)

            base_reply.update({
                "type": "actuation",
                "cmd": cmd,
                "cmd_topic": device_cfg["cmd_topic"],
                "sent": out_payload,
            })
            self.reply(parsed.reply_to, base_reply)

        except Exception as e:
            self.reply(DEFAULT_REPLY_TOPIC, {"ok": False, "error": str(e)})

    def run(self):
        self.client.connect(MQTT_HOST, MQTT_PORT, MQTT_KEEPALIVE)
        self.client.loop_forever()

def main():
    if MODEL is None:
        print("[提示] 找不到 intent_clf.joblib，將使用規則護欄（仍可用，但模型效果會更好）。")
    else:
        print("[OK] 已載入 intent_clf.joblib")

    print(f"VOICE_IN_TOPIC: {VOICE_IN_TOPIC}")
    print(f"DEFAULT_REPLY_TOPIC: {DEFAULT_REPLY_TOPIC}")
    Bridge().run()

if __name__ == "__main__":
    main()
