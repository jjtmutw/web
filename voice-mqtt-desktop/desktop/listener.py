import json
import logging
import pathlib
import socket
import time
from urllib.parse import urlparse
from typing import Any

import keyboard
import paho.mqtt.client as mqtt
import pyperclip


BASE_DIR = pathlib.Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"Missing config file: {CONFIG_PATH}. Copy config.example.json to config.json first."
        )

    with CONFIG_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def normalize_host(raw_host: str) -> str:
    host = raw_host.strip()
    if not host:
        raise ValueError("MQTT host is empty. Please set a valid broker hostname or IP in config.json.")

    # If the user pasted a URL like ws://broker:8083/mqtt or mqtt://broker,
    # extract only the hostname because paho-mqtt expects host and port separately.
    if "://" in host:
        parsed = urlparse(host)
        if not parsed.hostname:
            raise ValueError(
                "Invalid MQTT host format. Use only the broker hostname or IP in config.json, "
                'for example "test.mosquitto.org" or "192.168.1.10".'
            )
        return parsed.hostname

    if "/" in host:
        raise ValueError(
            "Invalid MQTT host in config.json. Do not include a path like /mqtt; "
            "set only the broker hostname or IP."
        )

    return host


def paste_text(text: str, append_enter: bool, paste_hotkey: str) -> None:
    if not text:
        logging.warning("Received empty text; skipping paste.")
        return

    pyperclip.copy(text)
    time.sleep(0.05)
    keyboard.send(paste_hotkey)

    if append_enter:
        time.sleep(0.05)
        keyboard.send("enter")


def parse_payload(payload: bytes, append_enter_default: bool) -> tuple[str, bool]:
    raw_text = payload.decode("utf-8", errors="replace").strip()
    if not raw_text:
        return "", append_enter_default

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError:
        return raw_text, append_enter_default

    text = str(data.get("text", "")).strip()
    append_enter = bool(data.get("append_enter", append_enter_default))
    return text, append_enter


def on_connect(
    client: mqtt.Client,
    userdata: dict[str, Any],
    flags: dict[str, Any],
    reason_code: int,
    properties: Any = None,
) -> None:
    topic = userdata["topic"]
    logging.info("Connected to MQTT broker. Subscribing to topic: %s", topic)
    client.subscribe(topic)


def on_message(client: mqtt.Client, userdata: dict[str, Any], message: mqtt.MQTTMessage) -> None:
    paste_hotkey = userdata["paste_hotkey"]
    append_enter_default = userdata["append_enter_default"]
    text, append_enter = parse_payload(message.payload, append_enter_default)

    if not text:
        logging.warning("Received empty payload on topic %s", message.topic)
        return

    logging.info("Received text on %s: %s", message.topic, text)
    paste_text(text, append_enter, paste_hotkey)


def build_client(config: dict[str, Any]) -> mqtt.Client:
    userdata = {
        "topic": config["topic"],
        "paste_hotkey": config.get("paste_hotkey", "ctrl+v"),
        "append_enter_default": config.get("append_enter_default", True),
    }

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, userdata=userdata)

    username = config.get("username", "")
    password = config.get("password", "")
    if username:
        client.username_pw_set(username, password)

    if config.get("use_tls", False):
        client.tls_set()

    client.on_connect = on_connect
    client.on_message = on_message
    return client


def main() -> None:
    config = load_config()
    client = build_client(config)
    host = normalize_host(str(config.get("host", "")))
    port = int(config.get("port", 1883))
    keepalive = int(config.get("keepalive", 60))

    logging.info("Starting desktop paste listener.")
    logging.info("Focus a text field before sending voice input from the phone.")

    try:
        client.connect(
            host=host,
            port=port,
            keepalive=keepalive,
        )
    except socket.gaierror as error:
        raise SystemExit(
            f"Cannot resolve MQTT host '{host}'. Check desktop/config.json and replace the example host "
            f"with your real broker hostname or LAN IP. Original error: {error}"
        ) from error
    except ConnectionRefusedError as error:
        raise SystemExit(
            f"MQTT broker refused the connection to {host}:{port}. "
            "Check the port, TLS setting, username/password, and whether the broker allows TCP MQTT."
        ) from error
    except TimeoutError as error:
        raise SystemExit(
            f"Timed out connecting to MQTT broker at {host}:{port}. "
            "Check network reachability, firewall rules, and broker address."
        ) from error

    client.loop_forever()


if __name__ == "__main__":
    main()
