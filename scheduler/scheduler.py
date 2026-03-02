# -*- coding: utf-8 -*-
"""
Scheduler v3 (clean, stable) - Python 3.8 compatible
"""
import json, os, sys, time, traceback, logging
import threading
import queue
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
from logging.handlers import RotatingFileHandler
from datetime import datetime, timedelta, time as dtime
from typing import Any, Dict, List, Optional, Tuple

import mysql.connector
from mysql.connector import pooling

try:
    import requests
except Exception:
    requests = None

try:
    import paho.mqtt.client as mqtt
except Exception:
    mqtt = None

try:
    from zoneinfo import ZoneInfo  # py>=3.9 or backport on 3.8
except Exception:
    ZoneInfo = None

try:
    import colorama
    colorama.init()
except Exception:
    colorama = None

DEFAULT_CONFIG = {
  "db": {"host":"127.0.0.1","port":3306,"user":"jj","password":"jamesjian","database":"smartcare","pool_size":5,"connect_timeout":10,"charset":"utf8mb4"},
  "scheduler": {"poll_interval_sec":2,"batch":20,"mysql_session_time_zone":"+08:00","default_timezone":"Asia/Taipei","log_file":"",
    "control_enabled": True,
    "control_host": "127.0.0.1",
    "control_port": 5055,
    "control_token": "CHANGE_ME"
  },
  "mqtt": {"host":"broker.emqx.io","port":1883,"username":"","password":"","client_id_prefix":"sched-","keepalive":30,"tls":False},
  "http": {"user_agent":"JJ-Scheduler/3.0","verify_tls":True}
}

class C:
    RESET="\033[0m"; RED="\033[31m"; GREEN="\033[32m"; YELLOW="\033[33m"

LOGGER = logging.getLogger("scheduler")

def load_config(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        with open(path,"w",encoding="utf-8") as f:
            json.dump(DEFAULT_CONFIG, f, indent=2, ensure_ascii=False)
        print(f"[WARN] config.json not found. Created default at: {path}")
    with open(path,"r",encoding="utf-8") as f:
        cfg=json.load(f)
    # merge defaults
    for k,v in DEFAULT_CONFIG.items():
        if k not in cfg:
            cfg[k]=v
        elif isinstance(v,dict):
            for kk,vv in v.items():
                cfg[k].setdefault(kk,vv)
    return cfg

def setup_logger(log_file: str) -> logging.Logger:
    logger=logging.getLogger("scheduler")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    fmt=logging.Formatter("[%(asctime)s] %(message)s","%Y-%m-%d %H:%M:%S")
    ch=logging.StreamHandler(sys.stdout); ch.setFormatter(fmt); logger.addHandler(ch)
    if not log_file:
        log_file=os.path.join(os.getcwd(),"scheduler.log")
    fh=RotatingFileHandler(log_file, maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt); logger.addHandler(fh)
    return logger

def log_info(m:str)->None: LOGGER.info(m)
def log_ok(m:str)->None: LOGGER.info(C.GREEN+m+C.RESET)
def log_warn(m:str)->None: LOGGER.info(C.YELLOW+m+C.RESET)
def log_err(m:str)->None: LOGGER.info(C.RED+m+C.RESET)


# -----------------------------
# Immediate-control (HTTP) queue
# -----------------------------
IMMEDIATE_QUEUE = queue.Queue()
INFLIGHT_LOCK = threading.Lock()
INFLIGHT = set()

def enqueue_immediate(job_id: int) -> None:
    IMMEDIATE_QUEUE.put(job_id)

def drain_immediate(max_n: int = 50):
    ids = []
    while len(ids) < max_n:
        try:
            ids.append(int(IMMEDIATE_QUEUE.get_nowait()))
        except Exception:
            break
    return ids

class _ControlHandler(BaseHTTPRequestHandler):
    # These will be set at server creation time
    control_token = ""
    def _send(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # silence default http.server logging; we log ourselves
        return

    def do_GET(self):
        try:
            u = urlparse(self.path)
            if u.path not in ("/run_immediate", "/health"):
                return self._send(404, {"ok": False, "error": "not_found"})
            if u.path == "/health":
                return self._send(200, {"ok": True})

            qs = parse_qs(u.query or "")
            job_id = qs.get("job_id", [None])[0]
            token = qs.get("token", [None])[0] or self.headers.get("X-Token")

            if self.control_token and token != self.control_token:
                return self._send(403, {"ok": False, "error": "forbidden"})

            if job_id is None:
                return self._send(400, {"ok": False, "error": "missing_job_id"})

            try:
                jid = int(job_id)
            except Exception:
                return self._send(400, {"ok": False, "error": "bad_job_id"})

            enqueue_immediate(jid)
            return self._send(200, {"ok": True, "queued": jid})
        except Exception as e:
            return self._send(500, {"ok": False, "error": str(e)})

def start_control_server(host: str, port: int, token: str):
    handler = _ControlHandler
    handler.control_token = token or ""
    httpd = HTTPServer((host, int(port)), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, t

def make_pool(db_cfg: Dict[str, Any]) -> pooling.MySQLConnectionPool:
    cfg=dict(db_cfg); cfg.pop("session_time_zone",None)
    ps=int(cfg.pop("pool_size",5))
    return pooling.MySQLConnectionPool(pool_name="sched_pool", pool_size=ps, **cfg)

def set_mysql_session_tz(conn, tz: str) -> None:
    try:
        cur=conn.cursor(); cur.execute("SET time_zone=%s",(tz,)); cur.close()
    except Exception:
        log_warn("MySQL session time_zone set failed (ignored).")

def fetch_due_jobs(conn, batch: int) -> List[Dict[str, Any]]:
    cur=conn.cursor(dictionary=True)
    cur.execute("""
        SELECT * FROM schedule_jobs
        WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at<=NOW()
        ORDER BY next_run_at ASC
        LIMIT %s
    """,(batch,))
    rows=cur.fetchall() or []
    cur.close()
    return rows

def fetch_job_by_id(conn, job_id: int) -> Optional[Dict[str, Any]]:
    cur=conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM schedule_jobs WHERE id=%s",(job_id,))
    row=cur.fetchone()
    cur.close()
    return row

DOW_MAP={"Mon":0,"Tue":1,"Wed":2,"Thu":3,"Fri":4,"Sat":5,"Sun":6}

def _get_zoneinfo(name: str):
    if ZoneInfo is None: return None
    try: return ZoneInfo(name)
    except Exception: return None

def _parse_time_of_day(x: Any) -> dtime:
    if isinstance(x, dtime): return x
    s=str(x).strip()
    if not s: return dtime(0,0,0)
    if len(s)==5: s+=":00"
    hh,mm,ss=s.split(":")
    return dtime(int(hh),int(mm),int(ss))

def _parse_times(job: Dict[str,Any]) -> List[dtime]:
    out=[]
    csv=job.get("times_of_day")
    if csv is not None and str(csv).strip():
        for part in str(csv).split(","):
            part=part.strip()
            if part: out.append(_parse_time_of_day(part))
    if not out:
        tod=job.get("time_of_day")
        if tod is not None and str(tod).strip():
            out.append(_parse_time_of_day(tod))
    uniq={(t.hour,t.minute,t.second):t for t in out}
    times=list(uniq.values())
    times.sort(key=lambda t:(t.hour,t.minute,t.second))
    return times

def _parse_days(raw: Any) -> List[int]:
    """
    Accept:
      - CSV string: "Mon,Wed,Fri"
      - MySQL SET returned by mysql-connector as python set: {'Sat','Sun'}
      - list/tuple/set of tokens
    Returns list of weekday ints (Mon=0..Sun=6)
    """
    if not raw:
        return []

    # mysql-connector may return MySQL SET as Python set
    if isinstance(raw, (set, list, tuple)):
        tokens = [str(t).strip() for t in raw if str(t).strip()]
    else:
        tokens = [t.strip() for t in str(raw).split(",") if t.strip()]

    norm = {
        "MON": "Mon", "MONDAY": "Mon",
        "TUE": "Tue", "TUESDAY": "Tue",
        "WED": "Wed", "WEDNESDAY": "Wed",
        "THU": "Thu", "THURSDAY": "Thu",
        "FRI": "Fri", "FRIDAY": "Fri",
        "SAT": "Sat", "SATURDAY": "Sat",
        "SUN": "Sun", "SUNDAY": "Sun",
    }
    tokens = [norm.get(t.upper(), t) for t in tokens]
    return sorted({DOW_MAP[t] for t in tokens if t in DOW_MAP})


def compute_next_run_at(job: Dict[str,Any], default_tz: str) -> Optional[datetime]:
    stype=str(job.get("schedule_type") or "").strip().upper()
    job_tz_name=(str(job.get("timezone") or default_tz)).strip() or default_tz
    job_tz=_get_zoneinfo(job_tz_name)
    sess_tz=_get_zoneinfo(default_tz)

    now = datetime.now(job_tz) if job_tz else datetime.now()
    times=_parse_times(job)

    if stype=="ONCE":
        ra=job.get("run_at")
        if not ra: return None
        try:
            run = ra if isinstance(ra,datetime) else datetime.fromisoformat(str(ra).replace(" ","T"))
        except Exception:
            return None
        if job_tz:
            run=run.replace(tzinfo=job_tz)
            if run<=now: return None
            return (run.astimezone(sess_tz).replace(tzinfo=None) if sess_tz else run.replace(tzinfo=None))
        return run if run>now else None

    if not times: return None

    if stype=="DAILY":
        for day_offset in range(0,14):
            d=now.date()+timedelta(days=day_offset)
            for tt in times:
                cand = datetime(d.year,d.month,d.day,tt.hour,tt.minute,tt.second,tzinfo=job_tz) if job_tz else datetime(d.year,d.month,d.day,tt.hour,tt.minute,tt.second)
                if cand>now:
                    if job_tz and sess_tz: return cand.astimezone(sess_tz).replace(tzinfo=None)
                    return cand.replace(tzinfo=None) if job_tz else cand
        return None

    if stype=="WEEKLY":
        dows=_parse_days(job.get("days_of_week"))
        if not dows: return None
        best=None
        for i in range(0,366):
            d=now.date()+timedelta(days=i)
            w=datetime(d.year,d.month,d.day).weekday()
            if w not in dows: continue
            for tt in times:
                cand = datetime(d.year,d.month,d.day,tt.hour,tt.minute,tt.second,tzinfo=job_tz) if job_tz else datetime(d.year,d.month,d.day,tt.hour,tt.minute,tt.second)
                if cand<=now: continue
                best=cand if best is None or cand<best else best
            if best is not None: break
        if best is None: return None
        if job_tz and sess_tz: return best.astimezone(sess_tz).replace(tzinfo=None)
        return best.replace(tzinfo=None) if job_tz else best

    return None

def update_job_after_success(conn, job_id: int, next_run_at: Optional[datetime], disable: bool) -> None:
    """
    After SUCCESS:
      - ONCE: disable (enabled=0)
      - Recurring: enabled stays 1; next_run_at updated
      - IMPORTANT: If next_run_at cannot be computed for a recurring job, we PAUSE the job (enabled=0)
        to prevent "0000-00-00 00:00:00" (or NULL) causing immediate repeated executions.
    """
    cur = conn.cursor()
    if disable:
        cur.execute("UPDATE schedule_jobs SET enabled=0, last_run_at=NOW() WHERE id=%s", (job_id,))
        cur.close()
        conn.commit()
        return

    if next_run_at is None:
        # Pause job to avoid spamming
        cur.execute("UPDATE schedule_jobs SET enabled=0, last_run_at=NOW() WHERE id=%s", (job_id,))
        cur.close()
        conn.commit()
        return

    cur.execute("UPDATE schedule_jobs SET last_run_at=NOW(), next_run_at=%s, enabled=1 WHERE id=%s", (next_run_at, job_id))
    cur.close()
    conn.commit()

def update_job_after_failure(conn, job_id: int, max_retries: int, backoff_sec: int) -> Optional[datetime]:
    # best-effort retry without requiring retry_count column
    if max_retries and max_retries>0:
        retry_at=datetime.now()+timedelta(seconds=int(backoff_sec or 60))
        cur=conn.cursor()
        cur.execute("UPDATE schedule_jobs SET next_run_at=%s, last_run_at=NOW() WHERE id=%s",(retry_at,job_id))
        cur.close(); conn.commit()
        return retry_at
    return None

class Sender:
    def __init__(self, cfg: Dict[str,Any]):
        self.cfg=cfg
        self.http = requests.Session() if requests else None
        if self.http:
            self.http.headers.update({"User-Agent": cfg["http"]["user_agent"]})
        self.mqtt = None
        self.mqtt_ready=False
        if mqtt:
            self.mqtt = mqtt.Client(client_id=self._client_id())
            u=(cfg["mqtt"].get("username") or "").strip()
            p=(cfg["mqtt"].get("password") or "").strip()
            if u: self.mqtt.username_pw_set(u,p)
            if bool(cfg["mqtt"].get("tls")): self.mqtt.tls_set()
            self.mqtt.on_connect=self._on_connect
            self.mqtt.on_disconnect=self._on_disconnect
            try:
                self.mqtt.connect(cfg["mqtt"]["host"], int(cfg["mqtt"]["port"]), int(cfg["mqtt"]["keepalive"]))
                self.mqtt.loop_start()
            except Exception as e:
                log_warn("MQTT connect failed (will retry): %s" % e)

    def _client_id(self):
        import random
        pre=self.cfg["mqtt"].get("client_id_prefix","sched-")
        return "%s%06d"%(pre, random.randint(0,999999))

    def _on_connect(self, client, userdata, flags, rc):
        self.mqtt_ready = (rc==0)
        log_ok("MQTT connected.") if self.mqtt_ready else log_warn("MQTT connect rc=%s"%rc)

    def _on_disconnect(self, client, userdata, rc):
        self.mqtt_ready=False
        log_warn("MQTT disconnected rc=%s"%rc)

    def send(self, job: Dict[str,Any]) -> Tuple[bool, Optional[int], str]:
        ch=str(job.get("channel") or "").strip().upper()
        return self._send_http(job) if ch=="HTTP" else self._send_mqtt(job) if ch=="MQTT" else (False,None,"Unsupported channel")

    def _send_http(self, job: Dict[str,Any]) -> Tuple[bool, Optional[int], str]:
        if not self.http or not requests: return (False,None,"requests not available")
        url=str(job.get("http_url") or "").strip()
        if not url: return (False,None,"http_url empty")
        method=str(job.get("http_method") or "POST").strip().upper()
        payload=job.get("payload") or ""
        ctype=str(job.get("content_type") or "text/plain").strip()
        headers=None
        hj=job.get("http_headers_json")
        if hj:
            try: headers=json.loads(hj) if isinstance(hj,str) else hj
            except Exception: headers=None
        timeout=int(job.get("timeout_sec") or 10)
        verify_tls=bool(self.cfg["http"].get("verify_tls", True))
        log_info(f"Sending HTTP request to {url} with headers {headers}")
        try:
            if method=="GET":
                r=self.http.get(url, headers=headers, timeout=timeout, verify=verify_tls)
            else:
                if ctype.lower().startswith("application/json"):
                    obj=payload
                    if isinstance(payload,str) and payload.strip():
                        try: obj=json.loads(payload)
                        except Exception: obj=payload
                    r=self.http.post(url, json=obj, headers=headers, timeout=timeout, verify=verify_tls)
                else:
                    r=self.http.post(url, data=str(payload), headers=headers, timeout=timeout, verify=verify_tls)
            ok=200<=r.status_code<300
            return (ok, r.status_code, (r.text or "")[:500])
        except Exception as e:
            return (False,None,"HTTP request error: %s"%e)

    def _send_mqtt(self, job: Dict[str,Any]) -> Tuple[bool, Optional[int], str]:
        if not self.mqtt or not mqtt: return (False,None,"paho-mqtt not available")
        topic=str(job.get("mqtt_topic") or "").strip()
        if not topic: return (False,None,"mqtt_topic empty")
        qos=int(job.get("qos") or 0)
        retained=bool(job.get("retained") or False)
        payload=str(job.get("payload") or "")
        if not self.mqtt_ready:
            try:
                self.mqtt.connect(self.cfg["mqtt"]["host"], int(self.cfg["mqtt"]["port"]), int(self.cfg["mqtt"]["keepalive"]))
                self.mqtt.loop_start()
            except Exception as e:
                return (False,None,"MQTT reconnect failed: %s"%e)
        try:
            info=self.mqtt.publish(topic, payload=payload, qos=qos, retain=retained)
            ok=(info.rc==0)
            return (ok, 0 if ok else info.rc, "published")
        except Exception as e:
            return (False,None,"MQTT publish error: %s"%e)


def _execute_one(conn, sender, job: Dict[str,Any], default_tz: str, immediate: bool = False) -> None:
    """
    Execute exactly one job (scheduled or immediate).
    - On success: recompute next_run_at from fresh DB row and update.
    - On failure: schedule retry or recompute next_run_at (and may pause if invalid schedule).
    """
    job_id = int(job["id"])
    name = job.get("name") or ""
    channel = job.get("channel") or ""

    planned_dt = datetime.now()
    if not immediate:
        planned = job.get("next_run_at")
        if isinstance(planned, datetime):
            planned_dt = planned
        elif planned:
            try:
                planned_dt = datetime.fromisoformat(str(planned).replace(" ", "T"))
            except Exception:
                planned_dt = datetime.now()

    prefix = "[IMMEDIATE] " if immediate else ""

    target = ("url=%s" % (job.get("http_url") or "")) if str(channel).upper() == "HTTP" else ("topic=%s" % (job.get("mqtt_topic") or ""))

    pv = str(job.get("payload") or "")
    if len(pv) > 120:
        pv = pv[:120] + "..."

    log_info(f"{prefix}▶ Job#{job_id} '{name}' [{channel}] planned={planned_dt} {target} payload={pv!r}")
    log_info(f"{prefix}   Attempt #1")

    ok, code, detail = sender.send(job)

    if ok:
        log_ok(f"{prefix}   ✅ SUCCESS" + ("" if code is None else f" HTTP={code}"))
        fresh = fetch_job_by_id(conn, job_id) or job
        disable = (str(fresh.get("schedule_type") or "").strip().upper() == "ONCE")
        next_run = compute_next_run_at(fresh, default_tz)

        if (not disable) and (next_run is None):
            log_warn(f"{prefix}   ⚠ next_run_at=None -> PAUSE job (check schedule fields): schedule_type=%s days_of_week=%r time_of_day=%r times_of_day=%r timezone=%r" % (
                str(fresh.get('schedule_type')), fresh.get('days_of_week'), fresh.get('time_of_day'), fresh.get('times_of_day'), fresh.get('timezone')
            ))

        update_job_after_success(conn, job_id, next_run, disable)
        log_info(f"{prefix}   Next: " + ("PAUSED" if ((not disable) and (next_run is None)) else (str(next_run) if next_run else "NULL")))
        return

    # failure
    log_err(f"{prefix}   ❌ FAILED" + ("" if code is None else f" HTTP={code}"))
    log_err(f"{prefix}   Error: " + (detail or "send failed"))

    max_retries = int(job.get("max_retries") or 0)
    backoff = int(job.get("retry_backoff_sec") or 60)
    retry_at = update_job_after_failure(conn, job_id, max_retries, backoff)

    if retry_at:
        log_warn(f"{prefix}   Retry scheduled at: {retry_at}")
        return

    fresh = fetch_job_by_id(conn, job_id) or job
    next_run = compute_next_run_at(fresh, default_tz)
    if next_run is None:
        log_warn(f"{prefix}   ⚠ next_run_at=None -> PAUSE job (check schedule fields): schedule_type=%s days_of_week=%r time_of_day=%r times_of_day=%r timezone=%r" % (
            str(fresh.get('schedule_type')), fresh.get('days_of_week'), fresh.get('time_of_day'), fresh.get('times_of_day'), fresh.get('timezone')
        ))
    update_job_after_success(conn, job_id, next_run, False)
    log_info(f"{prefix}   Next (no retry): " + ("PAUSED" if (next_run is None) else (str(next_run) if next_run else "NULL")))


def run_loop(cfg: Dict[str,Any]) -> None:
    log_info(f"Loaded config: {os.path.join(os.getcwd(),'config.json')}")
    global LOGGER
    LOGGER=setup_logger(cfg["scheduler"].get("log_file") or "")
    poll=int(cfg["scheduler"]["poll_interval_sec"])
    batch=int(cfg["scheduler"]["batch"])
    mysql_tz=str(cfg["scheduler"]["mysql_session_time_zone"] or "+08:00")
    default_tz=str(cfg["scheduler"].get("default_timezone") or "Asia/Taipei")

    log_info(f"Scheduler started. Poll interval={poll}s batch={batch}")
    log_info(f"Log file: {cfg['scheduler'].get('log_file') or os.path.join(os.getcwd(),'scheduler.log')}")
    log_info(f"MySQL session time_zone will be set to {mysql_tz}")

    pool=make_pool(cfg["db"])
    sender=Sender(cfg)

    # Control server (immediate run)
    ctrl_enabled = bool(cfg['scheduler'].get('control_enabled', True))
    ctrl_host = str(cfg['scheduler'].get('control_host', '127.0.0.1'))
    ctrl_port = int(cfg['scheduler'].get('control_port', 5055))
    ctrl_token = str(cfg['scheduler'].get('control_token', '') or '')
    if ctrl_enabled:
        try:
            start_control_server(ctrl_host, ctrl_port, ctrl_token)
            log_info(f"Control API: http://{ctrl_host}:{ctrl_port}/run_immediate?job_id=ID" + (" (token enabled)" if ctrl_token else ""))
        except Exception as e:
            log_warn(f"Control server start failed: {e}")

    while True:
        try:
            conn=pool.get_connection()
            set_mysql_session_tz(conn, mysql_tz)

            jobs=fetch_due_jobs(conn, batch)

            # Immediate runs (triggered by Admin)
            immediate_ids = drain_immediate(50)
            for jid in immediate_ids:
                try:
                    jobx = fetch_job_by_id(conn, int(jid))
                    if not jobx:
                        log_warn(f"[IMMEDIATE] Job#{jid} not found")
                        continue
                    # Avoid duplicate concurrent runs
                    with INFLIGHT_LOCK:
                        if int(jid) in INFLIGHT:
                            log_warn(f"[IMMEDIATE] Job#{jid} already inflight")
                            continue
                        INFLIGHT.add(int(jid))
                    try:
                        _execute_one(conn, sender, jobx, default_tz, immediate=True)
                    finally:
                        with INFLIGHT_LOCK:
                            INFLIGHT.discard(int(jid))
                except Exception as e:
                    log_err(f"[IMMEDIATE] error: {e}")
                    log_err(traceback.format_exc())

            for job in jobs:
                job_id=int(job["id"])
                name=job.get("name") or ""
                channel=job.get("channel") or ""
                planned=job.get("next_run_at")
                planned_dt=planned if isinstance(planned,datetime) else datetime.now()
                target=("url=%s"%(job.get("http_url") or "")) if str(channel).upper()=="HTTP" else ("topic=%s"%(job.get("mqtt_topic") or ""))
                pv=str(job.get("payload") or "")
                if len(pv)>120: pv=pv[:120]+"..."
                log_info(f"▶ Job#{job_id} '{name}' [{channel}] planned={planned_dt} {target} payload={pv!r}")
                log_info("   Attempt #1")

                ok, code, detail = sender.send(job)
                if ok:
                    log_ok("   ✅ SUCCESS"+("" if code is None else f" HTTP={code}"))
                    fresh=fetch_job_by_id(conn, job_id) or job
                    disable=(str(fresh.get("schedule_type") or "").strip().upper()=="ONCE")
                    next_run=compute_next_run_at(fresh, default_tz)
                    if (not disable) and (next_run is None):
                        log_warn("   ⚠ next_run_at=None -> PAUSE job (check schedule fields): schedule_type=%s days_of_week=%r time_of_day=%r times_of_day=%r timezone=%r" % (
                            str(fresh.get('schedule_type')), fresh.get('days_of_week'), fresh.get('time_of_day'), fresh.get('times_of_day'), fresh.get('timezone')
                        ))
                    update_job_after_success(conn, job_id, next_run, disable)
                    log_info(f"   Next: {'PAUSED' if ((not disable) and (next_run is None)) else (next_run if next_run else 'NULL')}" )
                else:
                    log_err("   ❌ FAILED"+("" if code is None else f" HTTP={code}"))
                    log_err("   Error: "+(detail or "send failed"))
                    max_retries=int(job.get("max_retries") or 0)
                    backoff=int(job.get("retry_backoff_sec") or 60)
                    retry_at=update_job_after_failure(conn, job_id, max_retries, backoff)
                    if retry_at:
                        log_warn(f"   Retry scheduled at: {retry_at}")
                    else:
                        fresh=fetch_job_by_id(conn, job_id) or job
                        next_run=compute_next_run_at(fresh, default_tz)
                        if next_run is None:
                            log_warn("   ⚠ next_run_at=None -> PAUSE job (check schedule fields): schedule_type=%s days_of_week=%r time_of_day=%r times_of_day=%r timezone=%r" % (
                                str(fresh.get('schedule_type')), fresh.get('days_of_week'), fresh.get('time_of_day'), fresh.get('times_of_day'), fresh.get('timezone')
                            ))
                        update_job_after_success(conn, job_id, next_run, False)
                        log_info(f"   Next (no retry): {next_run if next_run else 'NULL'}")

            conn.close()
        except Exception as e:
            log_err("Scheduler error: %s"%e)
            log_err(traceback.format_exc())
        time.sleep(poll)

def main():
    cfg=load_config(os.path.join(os.getcwd(),"config.json"))
    run_loop(cfg)

if __name__=="__main__":
    main()
