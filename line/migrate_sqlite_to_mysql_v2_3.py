import sqlite3
import pymysql
from datetime import datetime

SQLITE_PATH = "line_center.db"

MYSQL_CONFIG = {
    "host": "127.0.0.1",
    "user": "root",
    "password": "tmu2012",
    "database": "line_center",
    "charset": "utf8mb4",
    "autocommit": False
}

def ts_to_dt(ts):
    if ts is None:
        return None
    return datetime.fromtimestamp(int(ts))

def main():
    sconn = sqlite3.connect(SQLITE_PATH)
    sconn.row_factory = sqlite3.Row
    mconn = pymysql.connect(**MYSQL_CONFIG)
    mcur = mconn.cursor()

    # identities
    srows = sconn.execute("SELECT * FROM identities").fetchall()
    for r in srows:
        mcur.execute("""
            INSERT INTO identities
            (id_type, line_id, phone, note,
             created_at, last_seen,
             member_token, member_token_exp)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
                phone=VALUES(phone),
                note=VALUES(note),
                last_seen=VALUES(last_seen),
                member_token=VALUES(member_token),
                member_token_exp=VALUES(member_token_exp)
        """, (
            r["id_type"],
            r["line_id"],
            r["phone"],
            r["note"],
            ts_to_dt(r["created_at"]),
            ts_to_dt(r["last_seen"]),
            r["member_token"],
            ts_to_dt(r["member_token_exp"])
        ))

    # members
    srows = sconn.execute("SELECT * FROM members").fetchall()
    for r in srows:
        mcur.execute("""
            INSERT INTO members
            (phone,name,email,remark,line_id,
             created_at,updated_at,group_name)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
                name=VALUES(name),
                email=VALUES(email),
                remark=VALUES(remark),
                line_id=VALUES(line_id),
                updated_at=VALUES(updated_at),
                group_name=VALUES(group_name)
        """, (
            r["phone"],
            r["name"],
            r["email"],
            r["remark"],
            r["line_id"],
            ts_to_dt(r["created_at"]),
            ts_to_dt(r["updated_at"]),
            r["group_name"]
        ))

    # login_states
    srows = sconn.execute("SELECT * FROM login_states").fetchall()
    for r in srows:
        mcur.execute("""
            INSERT INTO login_states
            (state,phone,created_at,expires_at)
            VALUES (%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
                phone=VALUES(phone),
                created_at=VALUES(created_at),
                expires_at=VALUES(expires_at)
        """, (
            r["state"],
            r["phone"],
            ts_to_dt(r["created_at"]),
            ts_to_dt(r["expires_at"])
        ))

    mconn.commit()
    mconn.close()
    sconn.close()
    print("Migration DONE.")

if __name__ == "__main__":
    main()