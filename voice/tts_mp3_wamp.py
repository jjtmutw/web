import time
import json
import uuid
import shutil
import subprocess
from pathlib import Path

import paho.mqtt.client as mqtt
from gtts import gTTS

# =========================
# 設定區
# =========================
MQTT_HOST = "broker.emqx.io"
MQTT_PORT = 1883

TOPIC_IN  = "JJ/tts/cmd"
TOPIC_OUT = "JJ/speaker/cmd"

WEB_TTS_DIR = r"C:\wamp64\www\tts"
PUBLIC_BASE_URL = "http://3.114.197.59/tts"

# 永遠只用同一個檔案（覆蓋）
FIXED_FILENAME = "serv4you.mp3"

GTTS_LANG = "zh-TW"

# 速度：1.0=原速；1.15~1.35 通常很自然
# 需要 ffmpeg 才能生效（下面會自動偵測，沒有就跳過加速）
SPEECH_SPEED = 1.15

CLIENT_ID = "tts_bridge_" + uuid.uuid4().hex[:8]


def ensure_dir():
    Path(WEB_TTS_DIR).mkdir(parents=True, exist_ok=True)

def ffmpeg_exists() -> bool:
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        return True
    except Exception:
        return False

def speedup_mp3_inplace(mp3_path: Path, speed: float):
    """
    使用 ffmpeg atempo 加速（0.5~2.0）
    Windows 請先安裝 ffmpeg 並加入 PATH
    """
    if speed <= 0:
        return
    if speed == 1.0:
        return
    if not (0.5 <= speed <= 2.0):
        raise ValueError("SPEECH_SPEED 必須在 0.5 ~ 2.0 之間")

    tmp_out = mp3_path.with_suffix(".tmp.mp3")

    # -y 覆蓋、atempo 改速度
    cmd = ["ffmpeg", "-y", "-i", str(mp3_path), "-filter:a", f"atempo={speed}", str(tmp_out)]
    p = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if p.returncode != 0 or not tmp_out.exists():
        raise RuntimeError("ffmpeg 加速失敗（請確認 ffmpeg 已安裝且可在命令列使用）")

    # 以加速後檔案覆蓋原檔
    tmp_out.replace(mp3_path)

def gen_fixed_mp3_and_url(text: str) -> str:
    """
    永遠輸出同一檔案 FIXED_FILENAME（覆蓋寫入）
    回傳公開 URL
    """
    ensure_dir()
    out_path = Path(WEB_TTS_DIR) / FIXED_FILENAME

    # 先寫到暫存檔，再原子替換，避免音箱抓到半寫入的檔
    tmp_path = out_path.with_suffix(".gen.tmp.mp3")

    gTTS(text=text, lang=GTTS_LANG, slow=False).save(str(tmp_path))

    # 可選：加速
    if ffmpeg_exists():
        speedup_mp3_inplace(tmp_path, SPEECH_SPEED)

    # 原子替換
    tmp_path.replace(out_path)

    return f"{PUBLIC_BASE_URL.rstrip('/')}/{FIXED_FILENAME}"

def parse_incoming(payload_bytes: bytes):
    """
    input 支援：
    {"dev_id":"all","text":"..."}
    {"device_id":"...","text":"..."}
    {"dev_id":"...","params":{"text":"..."}}
    """
    try:
        doc = json.loads(payload_bytes.decode("utf-8", errors="ignore"))
    except Exception:
        return None

    dev_id = doc.get("dev_id") or doc.get("device_id") or "all"
    if not isinstance(dev_id, str):
        dev_id = "all"
    dev_id = dev_id.strip() or "all"

    text = ""
    if isinstance(doc.get("text"), str):
        text = doc["text"]
    elif isinstance(doc.get("params"), dict) and isinstance(doc["params"].get("text"), str):
        text = doc["params"]["text"]

    text = (text or "").strip()
    if not text:
        return None

    return {"dev_id": dev_id, "text": text}

def build_speaker_cmd(dev_id: str, url: str) -> str:
    # 完全符合你音箱端格式
    return json.dumps({"dev_id": dev_id, "url": url}, ensure_ascii=False)

mqttc = mqtt.Client(client_id=CLIENT_ID, protocol=mqtt.MQTTv311)

def on_connect(client, userdata, flags, rc):
    client.subscribe(TOPIC_IN, qos=1)

def on_message(client, userdata, msg):
    parsed = parse_incoming(msg.payload)
    if not parsed:
        return

    dev_id = parsed["dev_id"]
    text = parsed["text"]

    try:
        url = gen_fixed_mp3_and_url(text)
    except Exception as e:
        # 出錯時也用同格式回報（url 留空）
        err = {"dev_id": dev_id, "url": "", "error": str(e)}
        client.publish(TOPIC_OUT, json.dumps(err, ensure_ascii=False), qos=1, retain=False)
        return

    client.publish(TOPIC_OUT, build_speaker_cmd(dev_id, url), qos=1, retain=False)

def main():
    ensure_dir()

    # 檢查可寫
    test_file = Path(WEB_TTS_DIR) / "_write_test.tmp"
    try:
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)
    except Exception as e:
        raise SystemExit(f"[FATAL] WEB_TTS_DIR 無法寫入：{WEB_TTS_DIR}\n原因：{e}")

    mqttc.on_connect = on_connect
    mqttc.on_message = on_message
    mqttc.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
    mqttc.loop_forever()

if __name__ == "__main__":
    main()