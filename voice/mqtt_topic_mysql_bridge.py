import json
import time
import threading
from typing import Optional, Any, Dict, Tuple

import paho.mqtt.client as mqtt
from mysql.connector import pooling


# =========================
# 設定區：請改 MySQL 帳密
# =========================
CONFIG = {
    "mqtt": {
        "host": "broker.emqx.io",
        "port": 1883,
        "username": None,
        "password": None,
        "client_id": "mqtt-bridge-python",
        "subscribe_topics": [
            ("JJ/#", 0),  # 只聽 JJ/ 開頭
        ],
        "publish_qos": 0,
        "retain": False,
    },
    "mysql": {
        "host": "127.0.0.1",
        "port": 3306,
        "user": "jj",               # <- 改成你的 MySQL 帳號
        "password": "jamesjian",    # <- 改成你的 MySQL 密碼
        "database": "mqtt_bridge",
        "pool_name": "mqtt_bridge_pool",
        "pool_size": 5,
    },
    "behavior": {
        # 防迴圈 tag
        "bridge_tag_key": "__bridge__",

        # 收到 payload 只要含 __bridge__ 就忽略（最保險）
        "skip_any_bridge_tag": True,

        # RAW 發佈到 JJ/ 範圍時，因為沒有 tag，可能自咬：建議 True
        "block_raw_to_subscribe_range": True,
        "subscribe_prefix": "JJ/",

        # 快取/去重
        "cache_ttl_sec": 10,
        "dedup_ttl_sec": 2,

        "log_unmatched": True,
    }
}


# =========================
# 小工具：去重（避免 broker 重送）
# =========================
class DedupWindow:
    def __init__(self, ttl_sec: int):
        self.ttl = ttl_sec
        self._lock = threading.Lock()
        self._seen: Dict[Tuple[str, str], float] = {}

    def seen_recently(self, topic: str, payload: str) -> bool:
        now = time.time()
        key = (topic, payload)
        with self._lock:
            expired = [k for k, ts in self._seen.items() if now > ts]
            for k in expired:
                self._seen.pop(k, None)

            if key in self._seen:
                return True

            self._seen[key] = now + self.ttl
            return False


# =========================
# 小工具：mapping cache
# =========================
class MappingCache:
    def __init__(self, ttl_sec: int):
        self.ttl = ttl_sec
        self._lock = threading.Lock()
        self._cache: Dict[Tuple[str, str], Tuple[float, dict]] = {}

    def get(self, in_topic: str, in_payload: str) -> Optional[dict]:
        now = time.time()
        key = (in_topic, in_payload)
        with self._lock:
            item = self._cache.get(key)
            if not item:
                return None
            expire_ts, mapping = item
            if now > expire_ts:
                self._cache.pop(key, None)
                return None
            return mapping

    def set(self, in_topic: str, in_payload: str, mapping: dict):
        with self._lock:
            self._cache[(in_topic, in_payload)] = (time.time() + self.ttl, mapping)


# =========================
# DB Repo：支援 EXACT / ANY_PAYLOAD
# =========================
class MappingRepository:
    def __init__(self, pool: pooling.MySQLConnectionPool):
        self.pool = pool

    def find_mapping(self, in_topic: str, in_payload: str) -> Optional[dict]:
        """
        match_mode:
          - EXACT: topic + payload 完全相同
          - ANY_PAYLOAD: 只比 topic，不管 payload
        查詢優先序：EXACT 優先，找不到才用 ANY_PAYLOAD
        """
        conn = self.pool.get_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                SELECT out_topic, out_payload, out_format,
                       json_payload_key, json_extra, json_bridge_mode,
                       match_mode
                FROM topic_payload_map
                WHERE enabled=1
                  AND in_topic=%s
                  AND (
                        (match_mode='EXACT' AND in_payload=%s)
                     OR (match_mode='ANY_PAYLOAD')
                  )
                ORDER BY CASE WHEN match_mode='EXACT' THEN 0 ELSE 1 END
                LIMIT 1
                """,
                (in_topic, in_payload),
            )
            row = cur.fetchone()
            if not row:
                return None

            (out_topic, out_payload, out_format,
             json_payload_key, json_extra, json_bridge_mode,
             match_mode) = row

            # mysql-connector 可能把 JSON 欄位回傳成 str 或 dict
            extra_obj: Optional[Any] = None
            if json_extra is None:
                extra_obj = None
            elif isinstance(json_extra, (dict, list)):
                extra_obj = json_extra
            else:
                try:
                    extra_obj = json.loads(str(json_extra))
                except Exception:
                    extra_obj = None

            return {
                "out_topic": out_topic,
                "out_payload": out_payload,
                "out_format": (out_format or "RAW").upper(),          # RAW / JSON
                "json_payload_key": json_payload_key,                # e.g. value/cmd/state
                "json_extra": extra_obj,                             # dict/None
                "json_bridge_mode": (json_bridge_mode or "TAG").upper(),  # TAG / NONE
                "match_mode": (match_mode or "EXACT").upper(),       # EXACT / ANY_PAYLOAD
            }
        finally:
            try:
                cur.close()
            except Exception:
                pass
            conn.close()


# =========================
# MQTT Bridge 主體
# =========================
class MqttBridge:
    def __init__(self):
        # DB pool
        self.db_pool = pooling.MySQLConnectionPool(**CONFIG["mysql"])
        self.repo = MappingRepository(self.db_pool)
        self.cache = MappingCache(CONFIG["behavior"]["cache_ttl_sec"])
        self.dedup = DedupWindow(CONFIG["behavior"]["dedup_ttl_sec"])

        # MQTT
        mcfg = CONFIG["mqtt"]
        self.client = mqtt.Client(client_id=mcfg["client_id"], clean_session=True)
        if mcfg["username"]:
            self.client.username_pw_set(mcfg["username"], mcfg["password"])

        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect

    def start(self):
        mcfg = CONFIG["mqtt"]
        self.client.connect(mcfg["host"], mcfg["port"], keepalive=60)
        self.client.loop_forever(retry_first_connection=True)

    def on_connect(self, client, userdata, flags, rc):
        print(f"[MQTT] Connected rc={rc}")
        if rc != 0:
            return
        for t, qos in CONFIG["mqtt"]["subscribe_topics"]:
            client.subscribe(t, qos=qos)
            print(f"[MQTT] Subscribed: {t} qos={qos}")

    def on_disconnect(self, client, userdata, rc):
        print(f"[MQTT] Disconnected rc={rc}")

    @staticmethod
    def normalize_payload(payload_bytes: bytes) -> str:
        try:
            return payload_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return payload_bytes.decode("latin-1")

    def is_bridge_payload(self, payload_str: str) -> bool:
        """只要 payload 是 JSON 且含 __bridge__ 就視為 bridge 訊息"""
        tag_key = CONFIG["behavior"]["bridge_tag_key"]
        try:
            obj = json.loads(payload_str)
        except Exception:
            return False
        return isinstance(obj, dict) and (tag_key in obj)

    def build_out_json(
        self,
        in_topic: str,
        in_payload: str,
        out_payload: str,
        json_payload_key: Optional[str],
        json_extra: Optional[Any],
        json_bridge_mode: str,
    ) -> str:
        """
        JSON 結構：
          - 主要值放在 json_payload_key（預設 payload）
          - json_extra (dict) 會 merge 進去
          - json_bridge_mode='TAG' 才會加 __bridge__
        """
        tag_key = CONFIG["behavior"]["bridge_tag_key"]
        payload_key = (json_payload_key or "payload").strip() or "payload"

        out_obj: Dict[str, Any] = {payload_key: out_payload}

        if isinstance(json_extra, dict):
            out_obj.update(json_extra)

        if json_bridge_mode == "TAG":
            out_obj[tag_key] = {
                "id": CONFIG["mqtt"]["client_id"],
                "ts": int(time.time()),
                "src_topic": in_topic,
                "src_payload": in_payload,
            }

        return json.dumps(out_obj, ensure_ascii=False)

    @staticmethod
    def apply_templates(text: Optional[str], in_topic: str, in_payload: str) -> str:
        """
        支援 out_payload/out_topic 的模板：
          - {in_topic}
          - {in_payload}
        """
        s = text or ""
        return s.replace("{in_topic}", in_topic).replace("{in_payload}", in_payload)

    def on_message(self, client, userdata, msg):
        in_topic = msg.topic
        in_payload = self.normalize_payload(msg.payload)

        # 防迴圈：收到帶 __bridge__ 的訊息直接忽略
        if CONFIG["behavior"]["skip_any_bridge_tag"] and self.is_bridge_payload(in_payload):
            return

        # 去重（避免短時間重送）
        if self.dedup.seen_recently(in_topic, in_payload):
            return

        # 查 mapping（cache -> DB）
        mapping = self.cache.get(in_topic, in_payload)
        if not mapping:
            mapping = self.repo.find_mapping(in_topic, in_payload)
            if mapping:
                self.cache.set(in_topic, in_payload, mapping)

        if not mapping:
            if CONFIG["behavior"]["log_unmatched"]:
                print(f"[MISS] {in_topic} -> {in_payload}")
            return

        # 取出規則
        out_topic = mapping["out_topic"]
        out_payload = mapping["out_payload"]
        out_format = mapping["out_format"]
        json_payload_key = mapping["json_payload_key"]
        json_extra = mapping["json_extra"]
        json_bridge_mode = mapping["json_bridge_mode"]

        # 支援 out_topic / out_payload 使用模板
        out_topic = self.apply_templates(out_topic, in_topic, in_payload)
        out_payload = self.apply_templates(out_payload, in_topic, in_payload)

        # RAW 發佈到 JJ/ 範圍，可能自咬（因為沒 tag）
        if (
            out_format == "RAW"
            and CONFIG["behavior"]["block_raw_to_subscribe_range"]
            and out_topic.startswith(CONFIG["behavior"]["subscribe_prefix"])
        ):
            print(f"[BLOCK] RAW publish to JJ/: out_topic='{out_topic}'. "
                  f"Use out_format='JSON' with json_bridge_mode='TAG', or change out_topic, "
                  f"or narrow subscribe range.")
            return

        # 組 payload
        if out_format == "JSON":
            payload_to_send = self.build_out_json(
                in_topic=in_topic,
                in_payload=in_payload,
                out_payload=out_payload,
                json_payload_key=json_payload_key,
                json_extra=json_extra,
                json_bridge_mode=json_bridge_mode,
            )
        else:
            payload_to_send = out_payload

        # 發佈
        qos = CONFIG["mqtt"]["publish_qos"]
        retain = CONFIG["mqtt"]["retain"]
        res = client.publish(out_topic, payload_to_send, qos=qos, retain=retain)

        if res.rc == mqtt.MQTT_ERR_SUCCESS:
            print(f"[OK] ({in_topic}='{in_payload}') -> ({out_topic} format={out_format})")
        else:
            print(f"[ERR] publish rc={res.rc} ({out_topic})")


if __name__ == "__main__":
    MqttBridge().start()
