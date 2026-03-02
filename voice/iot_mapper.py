# iot_mapper.py (FINAL FULL)
# ------------------------------------------------------------
# Subscribe: JJ/voice/out  (from nlu_parser)
# Publish:
#   - IoT commands -> mapping.publish.iot_cmd_topic (default JJ/iot/cmd)
#       {"device":"JJ/LED001","switch":"s2","cmd":"off","value"?}
#   - Board/other MQTT -> entry.topic with entry.payload
#
# Features:
# 1) Board filtering:
#    - action=board_status  -> only publish topics containing "/status"
#    - action=board_marquee -> only publish topics containing "/marquee"
#
# 2) All-lights:
#    - if slots.device_index == "all" -> lookup routes[area][device_type]["all"]
#
# 3) Default first device:
#    - if device_type in ("light","fan","ac") AND no device_index specified -> default to "1"
#
# Payload template context supports:
#   {cmd},{text},{area},{device_type},{device_index},{req_id},{user},{value}
# ------------------------------------------------------------

import json
import os
import re
from typing import Any, Dict, Optional, List, Tuple

import paho.mqtt.client as mqtt

# =========================
# MQTT Broker
# =========================
MQTT_HOST = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_KEEPALIVE = 60
MQTT_USERNAME = None
MQTT_PASSWORD = None

IN_TOPIC = "JJ/voice/out"
DEFAULT_QOS = 1
DEFAULT_RETAIN = False

# =========================
# Load mapping.json
# =========================
BASE = os.path.dirname(os.path.abspath(__file__))
MAPPING_PATH = os.path.join(BASE, "mapping.json")


def load_mapping() -> Dict[str, Any]:
    with open(MAPPING_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


MAPPING = load_mapping()
ALIASES = MAPPING.get("aliases", {}) or {}
AREA_ALIAS = (ALIASES.get("areas") or {})
DT_ALIAS = (ALIASES.get("device_types") or {})
ACTION_ALIAS = (ALIASES.get("actions") or {})

PUBLISH_CFG = (MAPPING.get("publish") or {})
OUT_TOPIC = PUBLISH_CFG.get("iot_cmd_topic", "JJ/iot/cmd")
QOS = int(PUBLISH_CFG.get("qos", DEFAULT_QOS))
RETAIN = bool(PUBLISH_CFG.get("retain", DEFAULT_RETAIN))

ROUTES = MAPPING.get("routes", {}) or {}

# =========================
# Scene inference (numeric + named)
# =========================
SCENE_NUM_RE = re.compile(r"(?:場景|情境|模式|scene|mode)\s*([一二三四五六0-9]{1,2})", re.IGNORECASE)
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6}
SCENE_NAME_TO_INDEX: Dict[str, int] = {
    "上課模式": 1,
    "下課模式": 2,
    "會議模式": 3,
    "休息模式": 4,
    "展示模式": 5
}


def infer_scene_name_from_text(text: str, area: Optional[str]) -> Optional[str]:
    if not text:
        return None
    if area and area in ROUTES and "scene" in ROUTES[area]:
        for k in ROUTES[area]["scene"].keys():
            if isinstance(k, str) and k and k in text:
                return k
    for name in SCENE_NAME_TO_INDEX.keys():
        if name in text:
            return name
    return None


def infer_scene_index_from_text(text: str) -> Optional[int]:
    if not text:
        return None
    for name, idx in SCENE_NAME_TO_INDEX.items():
        if name in text:
            return idx
    m = SCENE_NUM_RE.search(text)
    if m:
        token = m.group(1)
        if token.isdigit():
            return int(token)
        if token in CN_NUM:
            return CN_NUM[token]
    return None


# =========================
# Normalization
# =========================
def norm_area(area: Optional[str]) -> Optional[str]:
    if not area:
        return None
    return AREA_ALIAS.get(area, area)


def norm_device_type(dt: Optional[str]) -> Optional[str]:
    if not dt:
        return None
    return DT_ALIAS.get(dt, dt)


def norm_action(action: Optional[str]) -> Optional[str]:
    if not action:
        return None
    return ACTION_ALIAS.get(action, action)


def norm_index(idx: Any) -> Optional[int]:
    if idx is None:
        return None
    if isinstance(idx, int):
        return idx
    if isinstance(idx, str):
        s = idx.strip()
        if s.isdigit():
            return int(s)
        if s in CN_NUM:
            return CN_NUM[s]
    return None


# =========================
# Lookup
# =========================
def lookup_entries(area: str, device_type: str, key: str) -> List[Dict[str, Any]]:
    entry = ROUTES[area][device_type][key]
    if isinstance(entry, list):
        return entry
    if isinstance(entry, dict):
        return [entry]
    raise KeyError("invalid mapping entry type")


# =========================
# Build publish messages
# =========================
def format_payload_template(payload: Any, ctx: Dict[str, Any]) -> str:
    if isinstance(payload, (dict, list)):
        return json.dumps(payload, ensure_ascii=False)
    s = str(payload)
    try:
        return s.format(**ctx)
    except Exception:
        return s


def build_iot_cmd(device: str, sw: str, cmd: str, value: Optional[Any]) -> Dict[str, Any]:
    out = {"device": device, "switch": sw, "cmd": cmd}
    if cmd == "brightness":
        if value is None:
            raise ValueError("brightness requires value")
        b = max(0, min(100, int(value)))
        out["value"] = b
    return out


def build_publish_messages(entry: Dict[str, Any], fallback_cmd: str, ctx: Dict[str, Any], slots_brightness: Optional[Any]) -> Tuple[str, str]:
    # direct mqtt publish entry (boards, etc.)
    if "topic" in entry:
        topic = entry["topic"]
        payload = entry.get("payload", "")
        return topic, format_payload_template(payload, ctx)

    # IoT cmd entry
    device = entry["device"]
    sw = entry["switch"]
    cmd = entry.get("cmd", fallback_cmd)

    # value priority: entry.value > slots_brightness (for brightness)
    value = entry.get("value", slots_brightness)
    out_obj = build_iot_cmd(device, sw, cmd, value)
    return OUT_TOPIC, json.dumps(out_obj, ensure_ascii=False)


def board_topic_allowed(action: str, topic: str) -> bool:
    """
    Filter board publishes so status & marquee don't show the same content.
    """
    t = (topic or "").lower()
    if action == "board_status":
        return "/status" in t
    if action == "board_marquee":
        return "/marquee" in t
    return True


# =========================
# MQTT Bridge
# =========================
class MapperBridge:
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
        client.subscribe(IN_TOPIC, qos=QOS)
        print(f"[SUB] {IN_TOPIC}")
        print(f"[OUT] IoT cmd -> {OUT_TOPIC} (qos={QOS} retain={RETAIN})")

    def publish(self, topic: str, payload: str):
        print(f"[PUB] topic={topic} qos={QOS} payload={payload}")
        self.client.publish(topic, payload, qos=QOS, retain=RETAIN)

    def on_message(self, client, userdata, msg):
        if msg.topic != IN_TOPIC:
            return
        self.handle_in(msg.payload)

    def handle_in(self, payload_bytes: bytes):
        raw = payload_bytes.decode("utf-8", errors="replace").strip()
        try:
            data = json.loads(raw)
        except Exception:
            print("[SKIP] incoming not JSON")
            return

        if not isinstance(data, dict):
            print("[SKIP] incoming JSON not object")
            return

        if data.get("ok") is False:
            print("[SKIP] upstream ok=false")
            return

        slots = data.get("slots") or {}
        if not isinstance(slots, dict):
            print("[SKIP] slots missing/invalid")
            return

        text = data.get("text") or ""
        req_id = data.get("req_id")
        user = data.get("user")

        area = norm_area(slots.get("area"))
        device_type = norm_device_type(slots.get("device_type"))
        action = norm_action(slots.get("action"))

        device_index_raw = slots.get("device_index")
        device_index = norm_index(device_index_raw)

        brightness = slots.get("brightness")
        value = slots.get("value")

        missing = []
        if not area:
            missing.append("area")
        if not device_type:
            missing.append("device_type")
        if not action:
            missing.append("action")

        # Scene inference (optional)
        scene_name = None
        if device_type == "scene":
            scene_name = infer_scene_name_from_text(text, area)
            if device_index is None:
                device_index = infer_scene_index_from_text(text)

 
        # ===============================
        # DEFAULT FIRST DEVICE (index=1)
        # If user didn't say "第幾個"，default to 1 for light/fan/ac/board.
        if device_index_raw is None and device_type in ("light", "fan", "ac", "board"):
            device_index_raw = 1
            device_index = 1
            print("[DEFAULT] device_index -> 1")


        # ===============================
        # key selection (supports "all")
        # ===============================
        if device_index_raw == "all":
            key = "all"
        else:
            if device_index is None:
                missing.append("device_index")
                key = ""
            else:
                key = str(device_index)

        if missing:
            print(f"[MISS] req_id={req_id} missing {missing} text='{text}' slots={slots}")
            return

        # ctx for payload templates
        ctx = {
            "cmd": action,
            "text": text,
            "area": area,
            "device_type": device_type,
            "device_index": device_index_raw if device_index_raw is not None else device_index,
            "req_id": req_id if req_id is not None else "",
            "user": user if user is not None else "",
            "value": value if value is not None else ""
        }

        # lookup mapping entries
        try:
            entries = lookup_entries(area, device_type, key)
            used_key = key
        except KeyError:
            # try named scene key
            if device_type == "scene" and scene_name:
                try:
                    entries = lookup_entries(area, device_type, scene_name)
                    used_key = scene_name
                except KeyError:
                    print(f"[NO_MAP] req_id={req_id} area={area} type={device_type} key={key}/{scene_name} text='{text}'")
                    return
            else:
                print(f"[NO_MAP] req_id={req_id} area={area} type={device_type} key={key} text='{text}'")
                return

        # publish each entry
        published = 0
        for i, ent in enumerate(entries, start=1):
            try:
                topic, payload_str = build_publish_messages(ent, action, ctx, brightness)

                # board filter: only one of status/marquee per action
                if device_type == "board" and "topic" in ent:
                    if not board_topic_allowed(action, topic):
                        continue

            except Exception as e:
                print(f"[ERR] req_id={req_id} entry#{i} build failed: {e} entry={ent}")
                continue

            self.publish(topic, payload_str)
            published += 1

        print(f"[OK] req_id={req_id} published={published} area={area} type={device_type} key={used_key} action={action}")

    def run(self):
        self.client.connect(MQTT_HOST, MQTT_PORT, MQTT_KEEPALIVE)
        self.client.loop_forever()


def main():
    print(f"[LOAD] {MAPPING_PATH}")
    MapperBridge().run()


if __name__ == "__main__":
    main()
