import pymysql
import json
import os
import time
from flask import Flask, request, Response

app = Flask(__name__)

APP_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(APP_DIR, "config.json")

def load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

CFG = load_config()

def db():
    return pymysql.connect(
        host=CFG["mysql_host"],
        port=int(CFG["mysql_port"]),
        user=CFG["mysql_user"],
        password=CFG["mysql_pass"],
        database=CFG["mysql_db"],
        charset=CFG.get("mysql_charset", "utf8mb4"),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True
    )

# ---------------------------------------------------
# Health
# ---------------------------------------------------
@app.get("/health")
def health():
    return {"ok": True, "ts": int(time.time())}

# ---------------------------------------------------
# Identity functions
# ---------------------------------------------------
def upsert_identity(id_type, line_id):
    now = int(time.time())
    conn = db()
    cur = conn.cursor()

    sql = """
    INSERT INTO identities (id_type, line_id, created_at, last_seen)
    VALUES (%s,%s,%s,%s)
    ON DUPLICATE KEY UPDATE
        id_type=VALUES(id_type),
        last_seen=VALUES(last_seen)
    """
    cur.execute(sql, (id_type, line_id, now, now))
    conn.close()

def get_identity_by_phone(phone):
    conn = db()
    cur = conn.cursor()
    cur.execute(
        "SELECT * FROM identities WHERE phone=%s AND id_type='user' ORDER BY last_seen DESC LIMIT 1",
        (phone,)
    )
    row = cur.fetchone()
    conn.close()
    return row

# ---------------------------------------------------
# API PUSH
# ---------------------------------------------------
@app.get("/api/push")
def api_push():

    key = request.args.get("key","")
    if key != CFG["api_key"]:
        return {"ok":False,"error":"invalid api key"},403

    msg = request.args.get("msg","")
    phone = request.args.get("phone","")

    if not msg:
        return {"ok":False,"error":"missing msg"},400

    if not phone:
        return {"ok":False,"error":"missing phone"},400

    row = get_identity_by_phone(phone)
    if not row:
        return {"ok":False,"error":"not found"},404

    # 這裡直接回傳測試結果（正式版可加 push_text 呼叫）
    return {
        "ok": True,
        "to_line_id": row["line_id"],
        "msg": msg
    }

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)