# ==========================================
# LINE Notification Center v2.3 FINAL (SQLite)
# - LINE Webhook: /line/callback
# - LINE Login bind phone: /line/login (+ /line/login/start, /line/login/callback)
# - Member center (user token): /member?t=...
# - Member center (admin view/search): /member?phone=... or /member?line_id=...
# - Admin console: /admin (push / edit / view / delete) + /admin/export.csv
# - API push (GET): /api/push?id=... | phone=... | group=... | name=... (fuzzy + multi)
# ==========================================

import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import time
import urllib.parse
from functools import wraps
from typing import Any, Dict, List, Optional, Tuple

import requests
from flask import Flask, Response, abort, redirect, request, url_for

# -----------------------------
# Paths
# -----------------------------
APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(APP_DIR, "line_center.db")
CONFIG_PATH = os.path.join(APP_DIR, "config.json")

# -----------------------------
# LINE endpoints
# -----------------------------
LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push"
LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply"

LINE_LOGIN_AUTH_URL = "https://access.line.me/oauth2/v2.1/authorize"
LINE_LOGIN_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token"
LINE_LOGIN_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify"

app = Flask(__name__)

# ==========================================
# VERSION INFO
# ==========================================
APP_VERSION = "2.3.1-MYSQL-ENTERPRISE-DROPDOWN"


# -----------------------------
# Config
# -----------------------------
def load_config() -> Dict[str, Any]:
    if not os.path.exists(CONFIG_PATH):
        return {}
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

CFG = load_config()

# Messaging API (OA)
CHANNEL_SECRET = (CFG.get("channel_secret") or "").strip()
ACCESS_TOKEN = (CFG.get("channel_access_token") or "").strip()

# LINE Login
LINE_LOGIN_CHANNEL_ID = (CFG.get("line_login_channel_id") or "").strip()
LINE_LOGIN_CHANNEL_SECRET = (CFG.get("line_login_channel_secret") or "").strip()

# Base URL
SITE_BASE_URL = (CFG.get("site_base_url") or "https://test.prof-jj.com").strip()
MEMBER_BASE_URL = (CFG.get("member_base_url") or SITE_BASE_URL).strip()
# member page should be https (LINE Login redirect best practice)
if MEMBER_BASE_URL.startswith("http://"):
    MEMBER_BASE_URL = "https://" + MEMBER_BASE_URL[len("http://") :]

# Admin Basic Auth
ADMIN_USER = (CFG.get("admin_user") or "admin").strip()
ADMIN_PASS = (CFG.get("admin_pass") or "admin").strip()

# API key for /api/*
API_KEY = (CFG.get("api_key") or "").strip()

# Optional auto reply (off by default)
ENABLE_AUTO_REPLY = bool(CFG.get("enable_auto_reply", False))
AUTO_REPLY_TEXT = (CFG.get("auto_reply_text") or "收到 ✅").strip()

# -----------------------------
# In-memory login/session tokens
# -----------------------------
_LOGIN_STATE: Dict[str, Dict[str, Any]] = {}     # state -> {phone, nonce, ts}
_MEMBER_TOKENS: Dict[str, Dict[str, Any]] = {}   # token -> {phone, line_id, ts}
LOGIN_STATE_TTL_SEC = 10 * 60
MEMBER_TOKEN_TTL_SEC = 30 * 60


def _cleanup_by_ttl(store: Dict[str, Dict[str, Any]], ttl: int) -> None:
    now = int(time.time())
    expired = [k for k, v in store.items() if now - int(v.get("ts", 0)) > ttl]
    for k in expired:
        store.pop(k, None)


# -----------------------------
# Utilities
# -----------------------------
def normalize_tw_phone(phone: str) -> str:
    """
    Accept: 09xxxxxxxx, 9xxxxxxxx, +8869xxxxxxxx, 8869xxxxxxxx, with spaces/hyphens
    Return: 09xxxxxxxx or ""
    """
    p = (phone or "").strip()
    p = p.replace(" ", "").replace("-", "")
    if not p:
        return ""
    if p.startswith("+"):
        p = p[1:]
    p = re.sub(r"\D+", "", p)

    if p.startswith("886"):
        p = "0" + p[3:]

    if len(p) == 9 and p.startswith("9"):
        p = "0" + p

    if len(p) == 10 and p.startswith("09"):
        return p
    return ""


def is_valid_email(email: str) -> bool:
    e = (email or "").strip()
    if not e:
        return False
    return re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e) is not None


def parse_csv_list(raw: str) -> List[str]:
    return [x.strip() for x in (raw or "").split(",") if x.strip()]


def uniq_preserve(seq: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in seq:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def fmt_ts(ts: Any) -> str:
    try:
        return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(int(ts)))
    except Exception:
        return ""


# -----------------------------
# DB + migrations
# -----------------------------
def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _table_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table})")
    return [r[1] for r in cur.fetchall()]


def init_db() -> None:
    conn = db()
    cur = conn.cursor()

    # identities
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS identities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_type TEXT NOT NULL,
            line_id TEXT NOT NULL UNIQUE,
            phone TEXT,
            note TEXT,
            created_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL
        )
        """
    )
    cols = _table_columns(conn, "identities")
    if "phone" not in cols:
        cur.execute("ALTER TABLE identities ADD COLUMN phone TEXT")
    if "note" not in cols:
        cur.execute("ALTER TABLE identities ADD COLUMN note TEXT")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_identities_phone ON identities(phone)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_identities_line_id ON identities(line_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_identities_last_seen ON identities(last_seen)")

    # members
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS members (
            phone TEXT PRIMARY KEY,
            name TEXT,
            email TEXT,
            group_name TEXT,
            remark TEXT,
            line_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    mcols = _table_columns(conn, "members")
    if "group_name" not in mcols:
        cur.execute("ALTER TABLE members ADD COLUMN group_name TEXT")
    if "remark" not in mcols:
        cur.execute("ALTER TABLE members ADD COLUMN remark TEXT")
    if "line_id" not in mcols:
        cur.execute("ALTER TABLE members ADD COLUMN line_id TEXT")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_members_name ON members(name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_members_line_id ON members(line_id)")

    conn.commit()
    conn.close()


def upsert_identity(id_type: str, line_id: str) -> None:
    now = int(time.time())
    conn = db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO identities (id_type, line_id, created_at, last_seen)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(line_id) DO UPDATE SET
            id_type=excluded.id_type,
            last_seen=excluded.last_seen
        """,
        (id_type, line_id, now, now),
    )
    conn.commit()
    conn.close()


def bind_phone(line_id: str, phone: str, note: str = "") -> None:
    now = int(time.time())
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE identities SET phone=?, note=?, last_seen=? WHERE line_id=?",
        (phone, note, now, line_id),
    )
    conn.commit()
    conn.close()


def list_identities(q: str = "", limit: int = 500) -> List[sqlite3.Row]:
    conn = db()
    cur = conn.cursor()
    if q:
        like = f"%{q}%"
        cur.execute(
            """
            SELECT * FROM identities
            WHERE line_id LIKE ? OR phone LIKE ? OR note LIKE ?
            ORDER BY last_seen DESC
            LIMIT ?
            """,
            (like, like, like, limit),
        )
    else:
        cur.execute(
            """
            SELECT * FROM identities
            ORDER BY last_seen DESC
            LIMIT ?
            """,
            (limit,),
        )
    rows = cur.fetchall()
    conn.close()
    return rows


def get_identity_by_line_id(line_id: str) -> Optional[sqlite3.Row]:
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM identities WHERE line_id=? LIMIT 1", (line_id,))
    row = cur.fetchone()
    conn.close()
    return row


def get_identity_by_phone(phone: str) -> Optional[sqlite3.Row]:
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM identities WHERE phone=? AND id_type='user' ORDER BY last_seen DESC LIMIT 1",
        (phone,),
    )
    row = cur.fetchone()
    conn.close()
    return row


def delete_identity(line_id: str) -> None:
    conn = db()
    cur = conn.cursor()
    cur.execute("DELETE FROM identities WHERE line_id=?", (line_id,))
    conn.commit()
    conn.close()


def upsert_member(phone: str, name: str, email: str, group_name: str, remark: str, line_id: str) -> None:
    now = int(time.time())
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT phone FROM members WHERE phone=? LIMIT 1", (phone,))
    exists = cur.fetchone() is not None
    if not exists:
        cur.execute(
            """
            INSERT INTO members (phone, name, email, group_name, remark, line_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (phone, name, email, group_name, remark, line_id, now, now),
        )
    else:
        cur.execute(
            """
            UPDATE members
            SET name=?, email=?, group_name=?, remark=?, line_id=?, updated_at=?
            WHERE phone=?
            """,
            (name, email, group_name, remark, line_id, now, phone),
        )
    conn.commit()
    conn.close()


def get_member(phone: str) -> Optional[sqlite3.Row]:
    conn = db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM members WHERE phone=? LIMIT 1", (phone,))
    row = cur.fetchone()
    conn.close()
    return row


def get_members_map(phones: List[str]) -> Dict[str, sqlite3.Row]:
    phones = [p for p in phones if p]
    if not phones:
        return {}
    conn = db()
    cur = conn.cursor()
    qmarks = ",".join(["?"] * len(phones))
    cur.execute(f"SELECT * FROM members WHERE phone IN ({qmarks})", phones)
    rows = cur.fetchall()
    conn.close()
    return {r["phone"]: r for r in rows}


def find_phones_by_group_fuzzy(group_terms: List[str]) -> List[str]:
    group_terms = [g.strip() for g in group_terms if g.strip()]
    if not group_terms:
        return []
    conn = db()
    cur = conn.cursor()
    phones: List[str] = []
    for g in group_terms:
        cur.execute(
            """
            SELECT phone FROM members
            WHERE group_name LIKE ?
              AND phone IS NOT NULL AND phone <> ''
            """,
            (f"%{g}%",),
        )
        phones.extend([r["phone"] for r in cur.fetchall()])
    conn.close()
    return phones


def find_phones_by_name_fuzzy(name_terms: List[str]) -> List[str]:
    name_terms = [n.strip() for n in name_terms if n.strip()]
    if not name_terms:
        return []
    conn = db()
    cur = conn.cursor()
    phones: List[str] = []
    for n in name_terms:
        cur.execute(
            """
            SELECT phone FROM members
            WHERE name LIKE ?
              AND phone IS NOT NULL AND phone <> ''
            """,
            (f"%{n}%",),
        )
        phones.extend([r["phone"] for r in cur.fetchall()])
    conn.close()
    return phones


# -----------------------------
# Auth helpers
# -----------------------------
def check_basic_auth(auth_header: str) -> bool:
    if not auth_header.startswith("Basic "):
        return False
    try:
        raw = base64.b64decode(auth_header.split(" ", 1)[1]).decode("utf-8")
        user, pw = raw.split(":", 1)
        return user == ADMIN_USER and pw == ADMIN_PASS
    except Exception:
        return False


def require_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not check_basic_auth(auth):
            return Response("Unauthorized", 401, {"WWW-Authenticate": 'Basic realm="LINE Center"'})
        return f(*args, **kwargs)

    return wrapper


def require_api_key_get() -> Optional[Response]:
    key = (request.args.get("key") or "").strip()
    if not API_KEY:
        return Response("Server missing api_key in config.json", status=500)
    if key != API_KEY:
        return Response(
            json.dumps({"ok": False, "error": "invalid api key"}, ensure_ascii=False),
            status=403,
            mimetype="application/json",
        )
    return None


# -----------------------------
# LINE signature verify
# -----------------------------
def verify_line_signature(body_bytes: bytes, signature_b64: str) -> bool:
    if not CHANNEL_SECRET or not signature_b64:
        return False
    mac = hmac.new(CHANNEL_SECRET.encode("utf-8"), body_bytes, hashlib.sha256).digest()
    expected = base64.b64encode(mac).decode("utf-8")
    return hmac.compare_digest(expected, signature_b64)


# -----------------------------
# LINE Messaging API calls
# -----------------------------
def line_headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {ACCESS_TOKEN}", "Content-Type": "application/json"}


def push_text(to_id: str, text: str) -> Tuple[bool, str]:
    if not ACCESS_TOKEN:
        return False, "Missing channel_access_token"
    payload = {"to": to_id, "messages": [{"type": "text", "text": text}]}
    r = requests.post(LINE_PUSH_URL, headers=line_headers(), json=payload, timeout=15)
    if r.status_code != 200:
        return False, f"{r.status_code} {r.text}"
    return True, "ok"


def reply_text(reply_token: str, text: str) -> Tuple[bool, str]:
    if not ACCESS_TOKEN:
        return False, "Missing channel_access_token"
    payload = {"replyToken": reply_token, "messages": [{"type": "text", "text": text}]}
    r = requests.post(LINE_REPLY_URL, headers=line_headers(), json=payload, timeout=15)
    if r.status_code != 200:
        return False, f"{r.status_code} {r.text}"
    return True, "ok"


# =========================================================
# Routes
# =========================================================
@app.get("/health")
def health():
    return {"ok": True, "version": APP_VERSION, "ts": int(time.time())}


# -----------------------------
# Webhook (Messaging API)
# -----------------------------
@app.post("/line/callback")
def line_callback():
    body = request.get_data()
    sig = request.headers.get("X-Line-Signature", "")
    if not verify_line_signature(body, sig):
        abort(403)

    data = json.loads(body.decode("utf-8"))
    events = data.get("events", [])

    for ev in events:
        src = ev.get("source") or {}
        user_id = src.get("userId")
        group_id = src.get("groupId")
        room_id = src.get("roomId")

        if user_id:
            upsert_identity("user", user_id)
        if group_id:
            upsert_identity("group", group_id)
        if room_id:
            upsert_identity("room", room_id)

        if ENABLE_AUTO_REPLY and ev.get("type") == "message":
            rt = ev.get("replyToken")
            if rt:
                reply_text(rt, AUTO_REPLY_TEXT)

    return "OK"


# =========================================================
# LINE Login + Phone binding
# =========================================================
@app.get("/line/login")
def line_login_page():
    if not LINE_LOGIN_CHANNEL_ID or not LINE_LOGIN_CHANNEL_SECRET:
        return Response(
            "<html><meta charset='utf-8'><body>"
            "<h3>LINE Login 尚未設定</h3>"
            "<p>請在 config.json 填入 line_login_channel_id / line_login_channel_secret。</p>"
            "</body></html>",
            mimetype="text/html",
            status=500,
        )

    html = f"""
    <html>
    <head>
      <meta charset="utf-8">
      <title>用 LINE 綁定手機</title>
      <style>
        body{{font-family:Arial,'Microsoft JhengHei';margin:24px;max-width:640px}}
        input{{padding:10px;font-size:16px;width:100%;box-sizing:border-box}}
        button{{padding:10px 14px;font-size:16px;cursor:pointer;margin-top:10px}}
        .hint{{color:#666;font-size:13px;line-height:1.6;margin-top:8px}}
        .card{{border:1px solid #ddd;border-radius:12px;padding:16px}}
        a{{color:#0b65c2}}
      </style>
    </head>
    <body>
      <h2>用 LINE 綁定手機</h2>
      <div class="hint">
        流程：輸入手機 → LINE 登入 → 自動跳轉會員中心填資料
      </div>
      <div class="card" style="margin-top:12px">
        <form method="post" action="/line/login/start">
          <label>手機號碼（例如 0912345678）</label><br>
          <input name="phone" placeholder="0912345678" required>
          <div class="hint">
            綁定完成後會自動跳到 <b>/member</b>（建議走 HTTPS）。
          </div>
          <button type="submit">下一步：用 LINE 登入並綁定</button>
        </form>
      </div>

      
    </body>
    </html>
    """
    return Response(html, mimetype="text/html")


@app.post("/line/login/start")
def line_login_start():
    if not LINE_LOGIN_CHANNEL_ID or not LINE_LOGIN_CHANNEL_SECRET:
        return "Missing LINE Login channel config", 500

    _cleanup_by_ttl(_LOGIN_STATE, LOGIN_STATE_TTL_SEC)

    phone_raw = (request.form.get("phone") or "").strip()
    phone = normalize_tw_phone(phone_raw)
    if not phone:
        return Response(
            "<html><meta charset='utf-8'><body>"
            "<h3>手機格式不正確</h3>"
            "<p>請輸入 09 開頭的 10 碼手機，例如 0912345678。</p>"
            "<p><a href='/line/login'>返回</a></p>"
            "</body></html>",
            mimetype="text/html",
            status=400,
        )

    state = secrets.token_urlsafe(16)
    nonce = secrets.token_urlsafe(16)
    _LOGIN_STATE[state] = {"phone": phone, "nonce": nonce, "ts": int(time.time())}

    redirect_uri = f"{SITE_BASE_URL}/line/login/callback"
    params = {
        "response_type": "code",
        "client_id": LINE_LOGIN_CHANNEL_ID,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": "openid profile",
        "nonce": nonce,
    }
    url = LINE_LOGIN_AUTH_URL + "?" + urllib.parse.urlencode(params)
    return redirect(url)


@app.get("/line/login/callback")
def line_login_callback():
    code = (request.args.get("code") or "").strip()
    state = (request.args.get("state") or "").strip()

    st = _LOGIN_STATE.pop(state, None)
    if not st:
        return Response(
            "<html><meta charset='utf-8'><body><h3>綁定失敗</h3>"
            "<p>state 無效或已過期，請重新操作。</p>"
            "<p><a href='/line/login'>返回</a></p></body></html>",
            mimetype="text/html",
            status=400,
        )

    phone = st.get("phone") or ""
    redirect_uri = f"{SITE_BASE_URL}/line/login/callback"

    # Exchange token
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": LINE_LOGIN_CHANNEL_ID,
        "client_secret": LINE_LOGIN_CHANNEL_SECRET,
    }
    r = requests.post(LINE_LOGIN_TOKEN_URL, data=data, timeout=15)
    if r.status_code != 200:
        return Response(
            f"<html><meta charset='utf-8'><body><h3>綁定失敗</h3>"
            f"<p>Token exchange failed: {r.status_code}</p><pre>{r.text}</pre>"
            f"<p><a href='/line/login'>返回</a></p></body></html>",
            mimetype="text/html",
            status=400,
        )

    tok = r.json()
    id_token = tok.get("id_token")
    if not id_token:
        return Response("Missing id_token", status=400)

    # Verify id_token to get sub(userId)
    vr = requests.post(
        LINE_LOGIN_VERIFY_URL,
        data={"id_token": id_token, "client_id": LINE_LOGIN_CHANNEL_ID},
        timeout=15,
    )
    if vr.status_code != 200:
        return Response(
            f"<html><meta charset='utf-8'><body><h3>綁定失敗</h3>"
            f"<p>id_token verify failed: {vr.status_code}</p><pre>{vr.text}</pre>"
            f"<p><a href='/line/login'>返回</a></p></body></html>",
            mimetype="text/html",
            status=400,
        )

    v = vr.json()
    user_id = v.get("sub")
    if not user_id:
        return Response("Missing sub(userId)", status=400)

    # Record identity and bind phone
    upsert_identity("user", user_id)
    bind_phone(user_id, phone, note="bound via LINE Login")

    # Create member token and redirect to /member (HTTPS recommended)
    _cleanup_by_ttl(_MEMBER_TOKENS, MEMBER_TOKEN_TTL_SEC)
    t = secrets.token_urlsafe(18)
    _MEMBER_TOKENS[t] = {"phone": phone, "line_id": user_id, "ts": int(time.time())}

    return redirect(f"{MEMBER_BASE_URL}/member?t={urllib.parse.quote(t)}")


# =========================================================
# Member Center (user token) + Admin view/search
# =========================================================
@app.get("/member")
def member_center():
    # 1) token-based member center (for normal users)
    t = (request.args.get("t") or "").strip()
    msg = (request.args.get("msg") or "").strip()

    if t:
        _cleanup_by_ttl(_MEMBER_TOKENS, MEMBER_TOKEN_TTL_SEC)
        st = _MEMBER_TOKENS.get(t)
        if not st:
            return Response(
                "<html><meta charset='utf-8'><body style='font-family:Arial,Microsoft JhengHei;margin:24px'>"
                "<h3>連結已失效</h3>"
                "<p>請重新執行「用 LINE 綁定手機」流程。</p>"
                "<p><a href='/line/login'>重新綁定</a></p>"
                "</body></html>",
                mimetype="text/html",
                status=400,
            )

        phone = st["phone"]
        line_id = st["line_id"]
        m = get_member(phone)

        name_val = (m["name"] if m and m["name"] else "")
        email_val = (m["email"] if m and m["email"] else "")
        group_val = (m["group_name"] if m and m["group_name"] else "")

        group_options = [
            "114下創客產品實作",
            "114下物聯網概論",
            "114下大數據實作",
            "其他"
        ]
        options_html = ""
        for g in group_options:
            selected = "selected" if g == group_val else ""
            options_html += f'<option value="{g}" {selected}>{g}</option>'

        if group_val and group_val not in group_options:
            options_html = f'<option value="{group_val}" selected>（已存）{group_val}</option>' + options_html

        remark_val = (m["remark"] if m and m["remark"] else "")

        html = f"""
        <html>
        <head>
          <meta charset="utf-8">
          <title>會員中心</title>
          <style>
            body{{font-family:Arial,'Microsoft JhengHei';margin:24px;max-width:760px}}
            .card{{border:1px solid #ddd;border-radius:14px;padding:16px}}
            label{{display:block;margin-top:12px;margin-bottom:6px}}
            input{{padding:10px;font-size:16px;width:100%;box-sizing:border-box}}
            textarea{{padding:10px;font-size:16px;width:100%;box-sizing:border-box;min-height:90px}}
            button{{padding:10px 14px;font-size:16px;cursor:pointer;margin-top:14px}}
            .hint{{color:#666;font-size:13px;line-height:1.6;margin-top:6px}}
            .ok{{padding:10px;border:1px solid #cfe8cf;background:#f3fbf3;border-radius:10px;margin-bottom:10px}}
            code{{background:#f6f6f6;padding:2px 6px;border-radius:6px}}
          </style>
        </head>
        <body>
          <h2>會員中心</h2>
          {("<div class='ok'>"+msg+"</div>") if msg else ""}

          <div class="card">
            <div class="hint">
              已完成 LINE 綁定 ✅<br>
              手機：<b>{phone}</b><br>
              （debug）LINE userId：<code>{line_id}</code>
            </div>

            
    <div style="background:#f2f8ff;border:1px solid #cfe6ff;padding:12px 14px;border-radius:10px;margin:12px 0;line-height:1.7;">
      <div style="font-weight:700;font-size:16px;margin-bottom:6px;">學生註冊說明</div>
      <ul style="margin:0;padding-left:18px;">
        <li>請先在下方<strong>選擇課程群組</strong>（必填）。</li>
        <li>請填寫<strong>真實姓名</strong>（必填），以便課程點名與通知。</li>
        <li><strong>Email</strong> 建議填寫（選填），方便課程聯繫與補充通知。</li>
        <li>填寫完成後按「儲存」即可完成註冊。</li>
      </ul>
    </div>

<form method="post" action="/member/save">
              <input type="hidden" name="t" value="{t}">

              <label>姓名</label>
              <input name="name" value="{name_val}" placeholder="請輸入姓名" required>

              <label>Email</label>
              <input name="email" value="{email_val}" placeholder="name@example.com" required>

              <label>群組</label>
              <div class="hint">請填寫「上課班級、群組」例如：醫管三甲</div>
              <select name="group_name" style="padding:10px;font-size:16px;width:100%;box-sizing:border-box">{options_html}</select>

              <label>註記</label>
              <div class="hint">請填寫「上課班級、群組、使用目的等」</div>
              <textarea name="remark" placeholder="上課班級、群組、使用目的等">{remark_val}</textarea>

              <button type="submit">儲存資料</button>
            </form>

            <div class="hint" style="margin-top:12px">
              
          </div>
        </body>
        </html>
        """
        return Response(html, mimetype="text/html")

    # 2) admin view/search mode (no token)
    auth = request.headers.get("Authorization", "")
    is_admin = check_basic_auth(auth)

    phone_q = normalize_tw_phone(request.args.get("phone") or "")
    line_q = (request.args.get("line_id") or "").strip()

    if not is_admin:
        return Response(
            "<html><meta charset='utf-8'><body style='font-family:Arial,Microsoft JhengHei;margin:24px'>"
            "<h3>需要管理者權限</h3>"
            "<p>此頁在沒有 t=token 時，僅提供管理者查詢。</p>"
            "<p><a href='/line/login'>一般使用者請走 /line/login 綁定流程</a></p>"
            "</body></html>",
            mimetype="text/html",
            status=401,
        )

    # if line_id provided, find phone
    if (not phone_q) and line_q:
        ident = get_identity_by_line_id(line_q)
        if ident:
            phone_q = normalize_tw_phone(ident["phone"] or "")

    if not phone_q and not line_q:
        html = """
        <html><head><meta charset="utf-8"><title>會員查詢</title>
        <style>
          body{font-family:Arial,'Microsoft JhengHei';margin:24px;max-width:760px}
          input{padding:10px;font-size:16px;width:100%;box-sizing:border-box}
          button{padding:10px 14px;font-size:16px;cursor:pointer;margin-top:10px}
          .card{border:1px solid #ddd;border-radius:14px;padding:16px}
          .hint{color:#666;font-size:13px;line-height:1.6;margin-top:6px}
          .btn{display:inline-block;padding:6px 10px;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:#333;background:#fff}
        </style></head>
        <body>
          <a class="btn" href="/admin">← 返回 Admin</a>
          <h2>會員中心（管理者查詢）</h2>
          <div class="card">
            <form method="get" action="/member">
              <label>用手機查詢</label>
              <input name="phone" placeholder="0912345678">
              <div class="hint">或用 line_id 查詢：在網址加 <b>?line_id=Uxxxx</b></div>
              <button type="submit">查詢</button>
            </form>
          </div>
        </body></html>
        """
        return Response(html, mimetype="text/html")

    m = get_member(phone_q) if phone_q else None
    ident = get_identity_by_line_id(line_q) if line_q else (get_identity_by_phone(phone_q) if phone_q else None)

    html = f"""
    <html><head><meta charset="utf-8"><title>會員查詢結果</title>
    <style>
      body{{font-family:Arial,'Microsoft JhengHei';margin:24px;max-width:860px}}
      .btn{{display:inline-block;padding:6px 10px;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:#333;background:#fff;margin-right:8px}}
      pre{{background:#f6f6f6;padding:12px;border-radius:10px;white-space:pre-wrap}}
    </style></head>
    <body>
      <a class="btn" href="/admin">← 返回 Admin</a>
      <a class="btn" href="/member">重新查詢</a>
      <h2>會員中心（管理者查詢）</h2>
      <pre>
Identity:
  line_id: {(ident["line_id"] if ident else "")}
  phone: {(ident["phone"] if ident else "")}
  note: {(ident["note"] if ident else "")}
  created_at: {fmt_ts(ident["created_at"]) if ident else ""}
  last_seen: {fmt_ts(ident["last_seen"]) if ident else ""}

Member:
  phone: {phone_q}
  name: {(m["name"] if m else "")}
  email: {(m["email"] if m else "")}
  group_name: {(m["group_name"] if m else "")}
  remark: {(m["remark"] if m else "")}
      </pre>
    </body></html>
    """
    return Response(html, mimetype="text/html")


@app.post("/member/save")
def member_save():
    t = (request.form.get("t") or "").strip()
    name = (request.form.get("name") or "").strip()
    email = (request.form.get("email") or "").strip()
    group_name = (request.form.get("group_name") or "").strip()
    remark = (request.form.get("remark") or "").strip()

    _cleanup_by_ttl(_MEMBER_TOKENS, MEMBER_TOKEN_TTL_SEC)
    st = _MEMBER_TOKENS.get(t)
    if not st:
        return Response("Token expired. Please re-bind via /line/login.", status=400)

    phone = st["phone"]
    line_id = st["line_id"]

    if not name:
        return redirect(f"{MEMBER_BASE_URL}/member?t={urllib.parse.quote(t)}&msg={urllib.parse.quote('❌ 姓名不可空白')}")
    if not is_valid_email(email):
        return redirect(f"{MEMBER_BASE_URL}/member?t={urllib.parse.quote(t)}&msg={urllib.parse.quote('❌ Email 格式不正確')}")

    upsert_member(phone, name, email, group_name, remark, line_id)

    # Update identities.note for admin readability
    note = f"{name}<{email}>"
    if group_name:
        note += f"｜群組:{group_name}"
    if remark:
        note += f"｜{remark}"

    conn = db()
    cur = conn.cursor()
    cur.execute(
        "UPDATE identities SET note=? WHERE phone=? AND id_type='user'",
        (note, phone),
    )
    conn.commit()
    conn.close()

    return redirect(f"{MEMBER_BASE_URL}/member?t={urllib.parse.quote(t)}&msg={urllib.parse.quote('✅ 已儲存會員資料')}")


# =========================================================
# Admin Console
# =========================================================
@app.get("/admin")
@require_admin
def admin_home():
    q = (request.args.get("q") or "").strip()
    msg = (request.args.get("msg") or "").strip()

    rows = list_identities(q)
    phones = [r["phone"] for r in rows if r["phone"]]
    members_map = get_members_map(phones)

    html = []
    html.append("<html><head><meta charset='utf-8'><title>LINE 通知中心 v2.3</title>")
    html.append(
        """
        <style>
          body{font-family:Arial,'Microsoft JhengHei';margin:24px}
          table{border-collapse:collapse;width:100%}
          th,td{border:1px solid #ddd;padding:8px;vertical-align:top}
          th{background:#f4f4f4}
          input[type=text]{padding:6px}
          button{padding:6px 10px;cursor:pointer}
          .mono{font-family:Consolas,monospace}
          .topbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0}
          .btn{display:inline-block;padding:6px 10px;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:#333;background:#fff}
          .danger{border:1px solid #c33;color:#c33;background:#fff}
          .hint{color:#666;font-size:13px;line-height:1.6}
        </style>
        """
    )
    html.append("</head><body>")
    html.append("<h2>LINE 通知中心 v2.3 - Admin</h2>")

    if msg:
        html.append(f"<p style='padding:10px;border:1px solid #ddd;background:#f8f8f8'>{msg}</p>")

    html.append("<div class='topbar'>")
    html.append("<a class='btn' href='/line/login' target='_blank'>/line/login 綁定入口</a>")
    html.append("<a class='btn' href='/member' target='_blank'>/member 管理者查詢</a>")
    html.append("<a class='btn' href='/admin/export.csv'>下載 CSV</a>")
    html.append("</div>")

    html.append("<form method='get' action='/admin'>")
    html.append(
        f"搜尋：<input type='text' name='q' value='{q}' placeholder='line_id / phone / note' style='min-width:280px'> "
        "<button type='submit'>查詢</button>"
    )
    html.append("</form>")

    html.append("<div class='hint' style='margin:10px 0'>")
    html.append("API：<span class='mono'>/api/push?group=醫管三&msg=通知&key=APIKEY</span> ｜ ")
    html.append("<span class='mono'>/api/push?name=王&msg=通知&key=APIKEY</span>")
    html.append("</div>")

    html.append(
        "<table><tr>"
        "<th>id_type</th><th>line_id</th><th>phone</th><th>群組</th><th>會員資料</th><th>note</th>"
        "<th>created</th><th>last_seen</th><th>推播</th><th>操作</th>"
        "</tr>"
    )

    for r in rows:
        line_id = r["line_id"]
        phone = r["phone"] or ""
        m = members_map.get(phone)
        group_name = (m["group_name"] if m and m["group_name"] else "") if phone else ""
        member_txt = ""
        if m:
            member_txt = f"{(m['name'] or '')}<br>{(m['email'] or '')}<br>{(m['remark'] or '')}"

        html.append("<tr>")
        html.append(f"<td>{r['id_type']}</td>")
        html.append(f"<td class='mono'>{line_id}</td>")
        html.append(f"<td>{phone}</td>")
        html.append(f"<td>{group_name}</td>")
        html.append(f"<td>{member_txt}</td>")
        html.append(f"<td>{r['note'] or ''}</td>")
        html.append(f"<td>{fmt_ts(r['created_at'])}</td>")
        html.append(f"<td>{fmt_ts(r['last_seen'])}</td>")

        # push
        html.append("<td>")
        html.append(
            f"""
            <form method="post" action="/admin/push" style="display:flex;gap:6px;align-items:center;margin:0">
              <input type="hidden" name="to" value="{line_id}">
              <input type="hidden" name="q" value="{q}">
              <input name="text" placeholder="輸入要推播的訊息" style="flex:1;min-width:220px;padding:6px">
              <button type="submit">推播</button>
            </form>
            """
        )
        html.append("</td>")

        # actions
        html.append("<td>")
        html.append(
            f"""
            <a class="btn" href="/admin/edit/{urllib.parse.quote(line_id)}">編輯</a>
            <a class="btn" href="/admin/view/{urllib.parse.quote(line_id)}">記錄</a>
            <form method="post" action="/admin/delete" style="display:inline;margin-left:6px"
                  onsubmit="return confirm('確定刪除？\\n{line_id}')">
              <input type="hidden" name="line_id" value="{line_id}">
              <input type="hidden" name="q" value="{q}">
              <button class="danger" type="submit">刪除</button>
            </form>
            """
        )
        html.append("</td>")

        html.append("</tr>")

    html.append("</table></body></html>")
    return Response("\n".join(html), mimetype="text/html")


@app.post("/admin/push")
@require_admin
def admin_push():
    to_id = (request.form.get("to") or "").strip()
    text = (request.form.get("text") or "").strip()
    q = (request.form.get("q") or "").strip()

    if not to_id or not text:
        return redirect(url_for("admin_home", q=q, msg="❌ 推播失敗：缺少 to 或 text"))

    ok, msg2 = push_text(to_id, text)
    if ok:
        return redirect(url_for("admin_home", q=q, msg=f"✅ 已推播給 {to_id}"))
    return redirect(url_for("admin_home", q=q, msg=f"❌ 推播失敗 {to_id}: {msg2}"))


@app.post("/admin/delete")
@require_admin
def admin_delete():
    line_id = (request.form.get("line_id") or "").strip()
    q = (request.form.get("q") or "").strip()
    if not line_id:
        return redirect(url_for("admin_home", q=q, msg="❌ 刪除失敗：缺少 line_id"))
    delete_identity(line_id)
    return redirect(url_for("admin_home", q=q, msg=f"✅ 已刪除：{line_id}"))


@app.get("/admin/view/<path:line_id>")
@require_admin
def admin_view(line_id):
    ident = get_identity_by_line_id(line_id)
    if not ident:
        return "Not found", 404

    phone = ident["phone"] or ""
    m = get_member(phone) if phone else None

    html = f"""
    <html><head><meta charset="utf-8"><title>記錄</title>
    <style>
      body{{font-family:Arial,'Microsoft JhengHei';margin:24px}}
      pre{{background:#f6f6f6;padding:12px;border-radius:10px;white-space:pre-wrap}}
      .mono{{font-family:Consolas,monospace}}
      .btn{{display:inline-block;padding:6px 10px;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:#333;background:#fff;margin-right:6px}}
    </style></head>
    <body>
      <a class="btn" href="/admin">← 返回清單</a>
      <a class="btn" href="/admin/edit/{urllib.parse.quote(line_id)}">編輯</a>
      <a class="btn" href="/member?line_id={urllib.parse.quote(line_id)}" target="_blank">會員中心(管理者檢視)</a>

      <h2>個別記錄</h2>

      <pre>
id_type: {ident["id_type"]}
line_id: {ident["line_id"]}
phone: {ident["phone"] or ""}
note: {ident["note"] or ""}
created_at: {fmt_ts(ident["created_at"])}
last_seen: {fmt_ts(ident["last_seen"])}

會員資料:
  姓名: {(m["name"] if m else "") or ""}
  Email: {(m["email"] if m else "") or ""}
  群組: {(m["group_name"] if m else "") or ""}
  註記: {(m["remark"] if m else "") or ""}
      </pre>
    </body></html>
    """
    return Response(html, mimetype="text/html")


@app.get("/admin/edit/<path:line_id>")
@require_admin
def admin_edit(line_id):
    ident = get_identity_by_line_id(line_id)
    if not ident:
        return "Not found", 404

    phone = ident["phone"] or ""
    m = get_member(phone) if phone else None

    name = (m["name"] if m else "") or ""
    email = (m["email"] if m else "") or ""
    group_name = (m["group_name"] if m else "") or ""
    remark = (m["remark"] if m else "") or ""

    html = f"""
    <html><head><meta charset="utf-8"><title>編輯</title>
    <style>
      body{{font-family:Arial,'Microsoft JhengHei';margin:24px;max-width:760px}}
      input,textarea{{width:100%;padding:10px;font-size:16px;box-sizing:border-box}}
      textarea{{min-height:120px}}
      label{{display:block;margin-top:12px;margin-bottom:6px}}
      button{{padding:10px 14px;font-size:16px;cursor:pointer;margin-top:14px}}
      .hint{{color:#666;font-size:13px;line-height:1.6;margin-top:6px}}
      .mono{{font-family:Consolas,monospace}}
      .top{{display:flex;gap:10px;align-items:center;flex-wrap:wrap}}
      .btn{{display:inline-block;padding:6px 10px;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:#333;background:#fff}}
    </style></head>
    <body>
      <div class="top">
        <a class="btn" href="/admin">← 返回清單</a>
        <a class="btn" href="/admin/view/{urllib.parse.quote(line_id)}">查看記錄</a>
        <a class="btn" href="/member?line_id={urllib.parse.quote(line_id)}" target="_blank">會員中心(管理者檢視)</a>
      </div>

      <h2>編輯使用者</h2>
      <div class="hint">line_id：<span class="mono">{line_id}</span></div>

      <form method="post" action="/admin/update">
        <input type="hidden" name="line_id" value="{line_id}">

        <label>手機（09xxxxxxxx）</label>
        <input name="phone" value="{phone}" placeholder="0912345678">

        <label>姓名</label>
        <input name="name" value="{name}" placeholder="王小明">

        <label>Email</label>
        <input name="email" value="{email}" placeholder="name@example.com">

        <label>群組</label>
        <input name="group_name" value="{group_name}" placeholder="醫管三甲">

        <label>註記</label>
        <div class="hint">請填寫「上課班級、群組、使用目的等」</div>
        <textarea name="remark" placeholder="上課班級、群組、使用目的等">{remark}</textarea>

        <button type="submit">儲存</button>
      </form>
    </body></html>
    """
    return Response(html, mimetype="text/html")


@app.post("/admin/update")
@require_admin
def admin_update():
    line_id = (request.form.get("line_id") or "").strip()
    phone_raw = (request.form.get("phone") or "").strip()
    phone = normalize_tw_phone(phone_raw) if phone_raw else ""
    name = (request.form.get("name") or "").strip()
    email = (request.form.get("email") or "").strip()
    group_name = (request.form.get("group_name") or "").strip()
    remark = (request.form.get("remark") or "").strip()

    if not line_id:
        return redirect(url_for("admin_home", msg="❌ 更新失敗：缺少 line_id"))

    now = int(time.time())

    conn = db()
    cur = conn.cursor()

    # Update identities phone & last_seen
    cur.execute("UPDATE identities SET phone=?, last_seen=? WHERE line_id=?", (phone, now, line_id))

    # Upsert members if phone present
    if phone:
        cur.execute("SELECT phone FROM members WHERE phone=? LIMIT 1", (phone,))
        exists = cur.fetchone() is not None
        if not exists:
            cur.execute(
                """
                INSERT INTO members (phone, name, email, group_name, remark, line_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (phone, name, email, group_name, remark, line_id, now, now),
            )
        else:
            cur.execute(
                """
                UPDATE members
                SET name=?, email=?, group_name=?, remark=?, line_id=?, updated_at=?
                WHERE phone=?
                """,
                (name, email, group_name, remark, line_id, now, phone),
            )

        # Update identities.note for list readability
        note = f"{name}<{email}>"
        if group_name:
            note += f"｜群組:{group_name}"
        if remark:
            note += f"｜{remark}"
        cur.execute("UPDATE identities SET note=? WHERE line_id=?", (note, line_id))

    conn.commit()
    conn.close()

    return redirect(url_for("admin_home", msg=f"✅ 已更新：{line_id}"))


@app.get("/admin/export.csv")
@require_admin
def admin_export_csv():
    rows = list_identities("")
    phones = [r["phone"] for r in rows if r["phone"]]
    members_map = get_members_map(phones)

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(
        [
            "id_type",
            "line_id",
            "phone",
            "member_name",
            "member_email",
            "member_group",
            "member_remark",
            "note",
            "created_at",
            "last_seen",
        ]
    )

    for r in rows:
        phone = r["phone"] or ""
        m = members_map.get(phone)
        writer.writerow(
            [
                r["id_type"],
                r["line_id"],
                phone,
                (m["name"] if m else ""),
                (m["email"] if m else ""),
                (m["group_name"] if m else ""),
                (m["remark"] if m else ""),
                (r["note"] or ""),
                r["created_at"],
                r["last_seen"],
            ]
        )

    data = output.getvalue().encode("utf-8-sig")  # Excel-friendly BOM
    filename = f"line_center_export_{time.strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        data,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# =========================================================
# GET API: /api/push
# =========================================================
@app.get("/api/push")
def api_push():
    deny = require_api_key_get()
    if deny:
        return deny

    msg = (request.args.get("msg") or "").strip()
    if not msg:
        return Response(
            json.dumps({"ok": False, "error": "missing msg"}, ensure_ascii=False),
            status=400,
            mimetype="application/json",
        )

    user_id = (request.args.get("id") or "").strip()
    phone_csv = (request.args.get("phone") or "").strip()
    group_csv = (request.args.get("group") or "").strip()
    name_csv = (request.args.get("name") or "").strip()

    # 1) direct userId
    if user_id:
        ok, m = push_text(user_id, msg)
        return {"ok": ok, "mode": "id", "to": user_id, "msg": m}

    targets: List[str] = []
    mode = ""

    # 2) phones csv
    if phone_csv:
        mode = "phone"
        phones = [normalize_tw_phone(p) for p in parse_csv_list(phone_csv)]
        phones = uniq_preserve([p for p in phones if p])

        for p in phones:
            row = get_identity_by_phone(p)
            if row:
                targets.append(row["line_id"])

    # 3) group fuzzy csv
    elif group_csv:
        mode = "group"
        group_terms = parse_csv_list(group_csv)
        phones = find_phones_by_group_fuzzy(group_terms)
        phones = uniq_preserve([normalize_tw_phone(p) for p in phones if p])

        for p in phones:
            row = get_identity_by_phone(p)
            if row:
                targets.append(row["line_id"])

    # 4) name fuzzy csv
    elif name_csv:
        mode = "name"
        name_terms = parse_csv_list(name_csv)
        phones = find_phones_by_name_fuzzy(name_terms)
        phones = uniq_preserve([normalize_tw_phone(p) for p in phones if p])

        for p in phones:
            row = get_identity_by_phone(p)
            if row:
                targets.append(row["line_id"])

    else:
        return Response(
            json.dumps({"ok": False, "error": "need id or phone or group or name"}, ensure_ascii=False),
            status=400,
            mimetype="application/json",
        )

    targets = uniq_preserve(targets)
    if not targets:
        return Response(
            json.dumps({"ok": False, "mode": mode, "error": "no bound targets found"}, ensure_ascii=False),
            status=404,
            mimetype="application/json",
        )

    sent = 0
    failed = []
    for t in targets:
        ok, m = push_text(t, msg)
        if ok:
            sent += 1
        else:
            failed.append({"to": t, "err": m})
        time.sleep(0.1)

    return {
        "ok": sent > 0 and len(failed) == 0,
        "mode": mode,
        "sent": sent,
        "failed": failed,
        "targets": len(targets),
    }


# =========================================================
# Main
# =========================================================
if __name__ == "__main__":
    print("===================================")
    print(" LINE Notification Center Starting ")
    print(f" VERSION: {APP_VERSION}")
    print("===================================")

    init_db()
    # For WAMP reverse proxy: run local only, Apache handles HTTPS/HTTP
    app.run(host="127.0.0.1", port=5000, debug=False)