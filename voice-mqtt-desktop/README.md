# Voice MQTT Desktop Paste

This is a standalone project for turning phone speech into text pasted on a computer:

1. A phone browser performs speech recognition.
2. The recognized text is published to MQTT over WebSocket.
3. A Python program on the computer subscribes to the MQTT topic.
4. When a message arrives, the program copies the text to the clipboard and pastes it into the currently focused cursor position.

## Why this design

This avoids ESP32 hardware and also works better for Chinese text, because the desktop helper pastes Unicode text through the clipboard instead of simulating only ASCII key presses.

## Folder layout

- `web/`: mobile web page for speech recognition and MQTT publishing
- `desktop/`: Python listener that subscribes to MQTT and pastes incoming text

## Tested target workflow

- Phone: Android Chrome or Edge
- Computer: Windows
- MQTT broker: any broker that supports
  - WebSocket for the web page
  - normal MQTT TCP for the Python client

## Example setup

- WebSocket URL for phone: `wss://broker.example.com:8084/mqtt`
- TCP host for desktop: `broker.example.com`
- TCP port for desktop: `8883` or `1883`
- Topic: `jj/voice/input`

## Python dependencies

Install these packages in your Python environment:

- `paho-mqtt`
- `pyperclip`
- `keyboard`

Example:

```powershell
pip install -r requirements.txt
```

## Important notes

- The desktop program pastes into whatever window currently has focus.
- Test in Notepad first.
- On Windows, `Ctrl+V` paste is used by default.
- Some browsers require HTTPS for speech recognition features.
- The web page uses browser-native speech recognition, so support depends on the mobile browser.

## Quick start

1. Open `desktop/config.example.json` and copy it to `desktop/config.json`.
2. Fill in your MQTT broker, topic, and credentials in `config.json`.
3. Run the desktop helper:

```powershell
python listener.py
```

4. Serve the `web/` folder from a local HTTPS host.
5. Open the page on your phone.
6. Enter the same broker and topic settings.
7. Connect MQTT, tap the microphone button, and speak.
8. Focus any text field on the computer, then send text from the phone.

## Security reminder

Anyone who can publish to your configured MQTT topic can cause text to be pasted on your computer. Use authentication and a private topic.
