# nlu_parser.py (FINAL + ALL-LIGHTS)
# ------------------------------------------------------------
# Subscribe: JJ/voice/in  JSON {"text":"...","req_id":"..","user":"..","reply_to":"JJ/voice/out"}
# Publish:   reply_to (default JJ/voice/out)
#
# Slots:
#   area, device_type(light/fan/ac/scene/board),
#   device_index: 1..6 or "all"
#   action: turn_on/turn_off/toggle/query_state/set_brightness/board_marquee/board_status
#   brightness (optional)
#   value (board)
# ------------------------------------------------------------

import json
import os
import re
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple, List

import joblib
import paho.mqtt.client as mqtt

MQTT_HOST = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_KEEPALIVE = 60
MQTT_USERNAME = None
MQTT_PASSWORD = None

VOICE_IN_TOPIC = "JJ/voice/in"
DEFAULT_REPLY_TOPIC = "JJ/voice/out"

DEFAULT_QOS = 1
DEFAULT_RETAIN = False

MODEL_PATH = "intent_clf.joblib"
ALLOWED_ACTIONS = {
    "toggle", "turn_on", "turn_off", "set_brightness", "query_state",
    "board_marquee", "board_status"
}
ACTION_CONF_THRESHOLD = 0.55


def load_model(path: str):
    try:
        return joblib.load(path)
    except Exception:
        return None


MODEL = load_model(MODEL_PATH)

BASE = os.path.dirname(os.path.abspath(__file__))
SLOTS_PATH = os.path.join(BASE, "slots.json")

with open(SLOTS_PATH, "r", encoding="utf-8") as f:
    SLOTS = json.load(f)

AREA_SYNONYMS: Dict[str, List[str]] = SLOTS.get("areas", {})
DEVICE_TYPE_SYNONYMS: Dict[str, List[str]] = SLOTS.get("device_types", {})
ACTION_GUARD: Dict[str, List[str]] = SLOTS.get("actions", {})

DEFAULTS = SLOTS.get("defaults", {}) or {}
SCENE_DEFAULT_ACTION = DEFAULTS.get("scene_action", "turn_on")
BOARD_DEFAULT_ACTION = DEFAULTS.get("board_action", "board_marquee")
SCENE_NAME_ACTIONS = SLOTS.get("scene_name_actions", {}) or {}

print("[SLOTS] loaded from:", SLOTS_PATH)

CN_NUM = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6,
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6
}

# "所有/全部/全..." -> all
ALL_RE = re.compile(r"(全部|所有|全(部)?)(?:的)?", re.IGNORECASE)

INDEX_NEAR_DEVICE_RE = re.compile(
    r"(?:第\s*)?([一二三四五六123456])\s*(?:盞|號|个|個|台|臺)?\s*"
    r"(燈|電燈|燈光|LED|led|風扇|電扇|冷氣|空調|aircon|ac|布告欄|電子布告欄|公布欄|看板|公告欄|board)",
    re.IGNORECASE
)

INDEX_LED_RE = re.compile(r"(?:LED|led|s)\s*([1-6])", re.IGNORECASE)
INDEX_LOOSE_RE = re.compile(r"(?:第\s*)?([一二三四五六123456])\s*(?:盞|號|个|個|台|臺)", re.IGNORECASE)

SCENE_INDEX_RE = re.compile(r"(?:場景|情境|模式|scene|mode)\s*([一二三四五六123456])", re.IGNORECASE)
BOARD_INDEX_RE = re.compile(r"(?:電子布告欄|布告欄|公布欄|看板|公告欄|board)\s*([一二三四五六123456])", re.IGNORECASE)

SCENE_NAME_TO_INDEX: Dict[str, int] = {
    "上課模式": 1,
    "下課模式": 2,
    "會議模式": 3,
    "休息模式": 4,
    "展示模式": 5
}

BRIGHTNESS_PATTERNS = [
    re.compile(r"(?:亮度|明亮|brightness)\s*(?:到|調到|調整到|設為|為)?\s*(\d{1,3})\s*%?"),
    re.compile(r"(?:調亮|調暗|變亮|變暗)\s*(\d{1,3})\s*%?")
]

BOARD_TEXT_RE = re.compile(
    r"(?:跑馬燈|滾動顯示|滾動|顯示|公告|寫|marquee)\s*[:：]?\s*(.+)$",
    re.IGNORECASE
)

BOARD_STATUS_RE = re.compile(
    r"(?:看板狀態|布告欄狀態|公布欄狀態|狀態設為|status\s*設為|status設為|status)\s*[:：]?\s*(.+)$",
    re.IGNORECASE
)


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
    m2 = re.search(r"(?:到|調到|設到|設為)\s*(\d{1,3})\s*%?", t)
    if m2:
        v = int(m2.group(1))
        if 0 <= v <= 100:
            return v
    return None


def extract_area(text: str) -> Optional[str]:
    t = text.strip()
    candidates: List[Tuple[str, str]] = []
    for canonical, syns in AREA_SYNONYMS.items():
        for s in syns:
            if s and s in t:
                candidates.append((canonical, s))
    if not candidates:
        return None
    candidates.sort(key=lambda x: len(x[1]), reverse=True)
    return candidates[0][0]


def extract_device_type(text: str) -> Optional[str]:
    t = text.strip()
    candidates: List[Tuple[str, str]] = []
    for canonical, syns in DEVICE_TYPE_SYNONYMS.items():
        for s in syns:
            if s and s in t:
                candidates.append((canonical, s))
    if not candidates:
        return None
    candidates.sort(key=lambda x: len(x[1]), reverse=True)
    return candidates[0][0]


def extract_scene_index_by_name(text: str) -> Optional[int]:
    for name, idx in SCENE_NAME_TO_INDEX.items():
        if name in text:
            return idx
    return None


def extract_device_index(text: str) -> Optional[Any]:
    t = text.strip()

    # 0) ALL scope first: "辦公室所有的燈 / 全部燈 / 全開"
    if ALL_RE.search(t):
        return "all"

    # 1) named scene modes -> index
    idx_named = extract_scene_index_by_name(t)
    if idx_named is not None:
        return idx_named

    # 2) scene index
    m = SCENE_INDEX_RE.search(t)
    if m:
        return CN_NUM.get(m.group(1))

    # 3) board index
    m = BOARD_INDEX_RE.search(t)
    if m:
        return CN_NUM.get(m.group(1))

    # 4) "第二個燈/第一個布告欄"
    m = INDEX_NEAR_DEVICE_RE.search(t)
    if m:
        return CN_NUM.get(m.group(1))

    # 5) LED3 / s3
    m = INDEX_LED_RE.search(t)
    if m:
        try:
            return int(m.group(1))
        except Exception:
            pass

    # 6) loose number
    m = INDEX_LOOSE_RE.search(t)
    if m:
        return CN_NUM.get(m.group(1))

    return None


def extract_board_value(text: str, action: str) -> Optional[str]:
    t = text.strip()
    m = BOARD_STATUS_RE.search(t) if action == "board_status" else BOARD_TEXT_RE.search(t)
    if not m:
        return None
    s = m.group(1).strip()
    s = re.sub(r"[。！!？?]+$", "", s).strip()
    return s if s else None


def guard_action(text: str) -> Optional[str]:
    t = text.strip()

    # board actions priority
    if any(k in t for k in (ACTION_GUARD.get("board_status") or [])):
        return "board_status"
    if any(k in t for k in (ACTION_GUARD.get("board_marquee") or [])):
        return "board_marquee"

    # toggle
    if any(k in t for k in (ACTION_GUARD.get("toggle") or [])):
        return "toggle"

    # brightness
    if any(k in t for k in (ACTION_GUARD.get("set_brightness") or [])) or extract_brightness(t) is not None:
        return "set_brightness"

    # off before on
    if any(k in t for k in ["關閉", "關掉", "關燈", "OFF", "off", "全關"]):
        return "turn_off"
    if "關" in t and "開關" not in t:
        return "turn_off"

    if any(k in t for k in ["打開", "開啟", "開燈", "ON", "on", "全開"]):
        return "turn_on"
    if "開" in t and "關" not in t:
        return "turn_on"

    if any(k in t for k in (ACTION_GUARD.get("query_state") or [])):
        return "query_state"

    return None


def _model_predict_with_confidence(text: str) -> Tuple[Optional[str], Optional[float]]:
    if MODEL is None:
        return None, None

    try:
        pred = MODEL.predict([text])[0]
    except Exception:
        return None, None

    if pred not in ALLOWED_ACTIONS:
        return None, None

    try:
        proba = MODEL.predict_proba([text])[0]
        return pred, float(max(proba))
    except Exception:
        return pred, None


def predict_action(text: str) -> Tuple[str, Optional[str], Optional[float], bool]:
    t = text.strip()

    g = guard_action(t)
    if g in ALLOWED_ACTIONS:
        mp, mc = _model_predict_with_confidence(t)
        return g, mp, mc, True

    mp, mc = _model_predict_with_confidence(t)
    if mp is None:
        return "query_state", None, None, False

    if mc is not None:
        if mc >= ACTION_CONF_THRESHOLD:
            return mp, mp, mc, False
        g2 = guard_action(t)
        if g2 in ALLOWED_ACTIONS:
            return g2, mp, mc, True
        return "query_state", mp, mc, False

    return mp, mp, None, False


@dataclass
class ParsedNLU:
    text: str
    reply_to: str
    req_id: Optional[str]
    user: Optional[str]
    slots: Dict[str, Any]
    model_pred: Optional[str]
    model_conf: Optional[float]
    used_guard: bool
    notes: List[str]


def parse_incoming_json(payload_bytes: bytes) -> Dict[str, Any]:
    s = payload_bytes.decode("utf-8", errors="replace").strip()
    try:
        obj = json.loads(s)
    except Exception:
        raise ValueError("VOICE payload must be JSON")
    if not isinstance(obj, dict):
        raise ValueError("VOICE JSON must be an object")
    return obj


def run_nlu(obj: Dict[str, Any]) -> ParsedNLU:
    text = str(obj.get("text", "")).strip()
    if not text:
        raise ValueError("missing 'text' in JSON")

    reply_to = str(obj.get("reply_to") or DEFAULT_REPLY_TOPIC)
    req_id = obj.get("req_id")
    user = obj.get("user")

    notes: List[str] = []

    area = extract_area(text)
    if area is None:
        notes.append("area_not_found")

    device_type = extract_device_type(text)

    if device_type is None:
        if any(k in text for k in ["場景", "情境", "模式", "scene", "mode"]):
            device_type = "scene"
            notes.append("device_type_forced_scene")
        elif any(k in text for k in ["電子布告欄", "布告欄", "公布欄", "看板", "公告欄", "跑馬燈", "board", "marquee"]):
            device_type = "board"
            notes.append("device_type_forced_board")

    if device_type is None:
        notes.append("device_type_not_found")

    device_index = extract_device_index(text)
    if device_index is None:
        notes.append("device_index_not_found")

    action, model_pred, model_conf, used_guard = predict_action(text)

    if device_type == "scene":
        g = guard_action(text)
        if g is None and action == "query_state":
            chosen = None
            for name, a in SCENE_NAME_ACTIONS.items():
                if name in text:
                    chosen = a
                    break
            if chosen is None:
                chosen = SCENE_DEFAULT_ACTION
            action = chosen
            notes.append(f"scene_default_action={action}")

    if device_type == "board":
        g = guard_action(text)
        if g is None and action == "query_state":
            action = BOARD_DEFAULT_ACTION
            notes.append(f"board_default_action={action}")

    brightness = None
    value = None

    if action == "set_brightness":
        brightness = extract_brightness(text)
        if brightness is None:
            notes.append("brightness_not_found")

    if device_type == "board" and action in ("board_marquee", "board_status"):
        value = extract_board_value(text, action)
        if value is None:
            notes.append("board_value_not_found")

    slots: Dict[str, Any] = {
        "area": area,
        "device_type": device_type,
        "device_index": device_index,
        "action": action
    }
    if brightness is not None:
        slots["brightness"] = brightness
    if value is not None:
        slots["value"] = value

    return ParsedNLU(
        text=text,
        reply_to=reply_to,
        req_id=str(req_id) if req_id is not None else None,
        user=str(user) if user is not None else None,
        slots=slots,
        model_pred=model_pred,
        model_conf=model_conf,
        used_guard=used_guard,
        notes=notes,
    )


class NLUBridge:
    def __init__(self):
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        except Exception:
            self.client = mqtt.Client()

        if MQTT_USERNAME:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        ok = (reason_code == 0)
        print(f"[MQTT] connected={ok} reason_code={reason_code}")
        client.subscribe(VOICE_IN_TOPIC, qos=1)

    def publish(self, topic: str, payload: str, qos: int = DEFAULT_QOS, retain: bool = DEFAULT_RETAIN):
        print(f"[PUB] topic={topic} qos={qos} payload={payload}")
        self.client.publish(topic, payload, qos=qos, retain=retain)

    def reply(self, topic: str, obj: Dict[str, Any]):
        self.publish(topic, json.dumps(obj, ensure_ascii=False), qos=1, retain=False)

    def on_message(self, client, userdata, msg):
        if msg.topic != VOICE_IN_TOPIC:
            return
        self.handle_voice(msg.payload)

    def handle_voice(self, payload_bytes: bytes):
        try:
            obj = parse_incoming_json(payload_bytes)
            parsed = run_nlu(obj)

            print(f"[IN] {parsed.text}")
            print(f"[SLOTS] {parsed.slots} notes={parsed.notes}")

            out = {
                "ok": True,
                "req_id": parsed.req_id,
                "user": parsed.user,
                "text": parsed.text,
                "slots": parsed.slots,
                "model": {
                    "pred": parsed.model_pred,
                    "conf": parsed.model_conf,
                    "used_guard": parsed.used_guard
                },
                "notes": parsed.notes
            }
            self.reply(parsed.reply_to, out)

        except Exception as e:
            self.reply(DEFAULT_REPLY_TOPIC, {"ok": False, "error": str(e)})

    def run(self):
        self.client.connect(MQTT_HOST, MQTT_PORT, MQTT_KEEPALIVE)
        self.client.loop_forever()


def main():
    if MODEL is None:
        print("[WARN] 找不到 intent_clf.joblib，action 主要依賴規則護欄（仍可用）。")
    else:
        print("[OK] 已載入 intent_clf.joblib（action=模型+護欄）。")

    print(f"VOICE_IN_TOPIC: {VOICE_IN_TOPIC}")
    print(f"DEFAULT_REPLY_TOPIC: {DEFAULT_REPLY_TOPIC}")
    NLUBridge().run()


if __name__ == "__main__":
    main()
