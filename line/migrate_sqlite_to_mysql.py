# migrate_sqlite_to_mysql.py
# SQLite -> MySQL 一次搬移（可重跑；採用 UPSERT 避免重複）
import sqlite3
import pymysql
from datetime import datetime

SQLITE_PATH = "line_center.db"

MYSQL_HOST = "127.0.0.1"
MYSQL_PORT = 3306
MYSQL_DB   = "line_center"
MYSQL_USER = "root"
MYSQL_PASS = "tmu2012"
MYSQL_CHARSET = "utf8mb4"

def connect_mysql():
    return pymysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT,
        user=MYSQL_USER, password=MYSQL_PASS,
        database=MYSQL_DB, charset=MYSQL_CHARSET,
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor
    )

def fetch_all_sqlite(conn, sql):
    cur = conn.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    return rows

def as_dt(val):
    # SQLite 可能存 TEXT/NULL；MySQL DATETIME 需要 datetime 或字串
    if val is None:
        return None
    if isinstance(val, (datetime, )):
        return val
    s = str(val).strip()
    if not s:
        return None
    # 常見格式：2026-02-27 14:37:15
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s[:19], fmt)
        except:
            pass
    # 如果 SQLite 存的是 unix time（秒），可在此加轉換
    return None

def main():
    sconn = sqlite3.connect(SQLITE_PATH)
    sconn.row_factory = sqlite3.Row

    mconn = connect_mysql()
    mcur = mconn.cursor()

    # ===== identities =====
    # 依你 v2.3：id_type, line_id, phone, note, created_at, last_seen, member_token
    identities = fetch_all_sqlite(sconn, "SELECT * FROM identities")
    print("identities:", len(identities))

    sql_id_upsert = """
    INSERT INTO identities (id_type, line_id, phone, note, member_token, created_at, last_seen)
    VALUES (%s,%s,%s,%s,%s,%s,%s)
    ON DUPLICATE KEY UPDATE
      phone=VALUES(phone),
      note=VALUES(note),
      member_token=VALUES(member_token),
      last_seen=VALUES(last_seen)
    """

    for r in identities:
        mcur.execute(sql_id_upsert, (
            r.get("id_type"),
            r.get("line_id"),
            r.get("phone"),
            r.get("note"),
            r.get("member_token") if "member_token" in r else r.get("token"),
            as_dt(r.get("created_at")) or datetime.now(),
            as_dt(r.get("last_seen")) or datetime.now(),
        ))

    # ===== members =====
    members = fetch_all_sqlite(sconn, "SELECT * FROM members")
    print("members:", len(members))

    sql_mem_upsert = """
    INSERT INTO members (phone, name, email, group_name, remark, line_id, created_at, updated_at)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
    ON DUPLICATE KEY UPDATE
      name=VALUES(name),
      email=VALUES(email),
      group_name=VALUES(group_name),
      remark=VALUES(remark),
      line_id=VALUES(line_id),
      updated_at=VALUES(updated_at)
    """

    for r in members:
        mcur.execute(sql_mem_upsert, (
            r.get("phone"),
            r.get("name"),
            r.get("email"),
            r.get("group_name"),
            r.get("remark"),
            r.get("line_id"),
            as_dt(r.get("created_at")) or datetime.now(),
            as_dt(r.get("updated_at")) or datetime.now(),
        ))

    # ===== login_states（如果有）=====
    try:
        login_states = fetch_all_sqlite(sconn, "SELECT * FROM login_states")
        print("login_states:", len(login_states))

        sql_ls_upsert = """
        INSERT INTO login_states (state, phone, created_at, expires_at)
        VALUES (%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
          phone=VALUES(phone),
          created_at=VALUES(created_at),
          expires_at=VALUES(expires_at)
        """
        for r in login_states:
            mcur.execute(sql_ls_upsert, (
                r.get("state"),
                r.get("phone"),
                as_dt(r.get("created_at")) or datetime.now(),
                as_dt(r.get("expires_at")) or datetime.now(),
            ))
    except sqlite3.OperationalError:
        print("login_states table not found in SQLite — skipped.")

    mconn.commit()
    mcur.close()
    mconn.close()
    sconn.close()

    print("DONE.")

if __name__ == "__main__":
    main()