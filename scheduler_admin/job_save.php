<?php
require __DIR__ . '/auth.php';
require_login();

require __DIR__ . '/db.php';
require __DIR__ . '/functions.php';

$id = (int)($_POST['id'] ?? 0);


// ===== WEEKLY checkbox handling =====
$daysArr = $_POST['days_of_week_arr'] ?? null;
if (is_array($daysArr)) {
  $daysArr = array_values(array_unique(array_filter(array_map('trim', $daysArr))));
  $daysStr = $daysArr ? implode(',', $daysArr) : null;
} else {
  $daysStr = trim($_POST['days_of_week'] ?? '') ?: null;
}

$job = [
  'name' => trim($_POST['name'] ?? ''),
  'enabled' => (int)($_POST['enabled'] ?? 1),
  'channel' => $_POST['channel'] ?? 'HTTP',
  'payload' => $_POST['payload'] ?? '',
  'content_type' => ($_POST['content_type'] ?? null),

  'qos' => ($_POST['qos'] !== '' ? (int)$_POST['qos'] : null),
  'retained' => (int)($_POST['retained'] ?? 0),
  'mqtt_topic' => ($_POST['mqtt_topic'] ?? null),

  'http_method' => ($_POST['http_method'] ?? null),
  'http_url' => ($_POST['http_url'] ?? null),
  'http_headers_json' => (trim($_POST['http_headers_json'] ?? '') ?: null),

  'schedule_type' => ($_POST['schedule_type'] ?? 'DAILY'),
  'run_at' => (trim($_POST['run_at'] ?? '') ?: null),
  'time_of_day' => (trim($_POST['time_of_day'] ?? '') ?: null),
  'times_of_day' => (trim($_POST['times_of_day'] ?? '') ?: null),
  'days_of_week' => $daysStr,
  'timezone' => (trim($_POST['timezone'] ?? 'Asia/Taipei')),

  'max_retries' => (int)($_POST['max_retries'] ?? 3),
  'retry_backoff_sec' => (int)($_POST['retry_backoff_sec'] ?? 60),
  'timeout_sec' => (int)($_POST['timeout_sec'] ?? 10),
];

if ($job['name'] === '') die('name required');

// Basic per-channel validation
if ($job['channel'] === 'MQTT' && empty($job['mqtt_topic'])) die('MQTT requires mqtt_topic');
if ($job['channel'] === 'HTTP' && empty($job['http_url'])) die('HTTP requires http_url');

// WEEKLY validation (days + at least one time)
if ($job['schedule_type'] === 'WEEKLY') {
  if (empty($job['days_of_week'])) {
    die('WEEKLY 必須至少勾選一天（Mon..Sun）');
  }
  $t = trim((string)($job['times_of_day'] ?? ''));
  $tod = trim((string)($job['time_of_day'] ?? ''));
  if ($t === '' && $tod === '') {
    die('WEEKLY 必須至少設定一個時間');
  }
}

// Compute next_run_at from rule
$next = compute_next_run_at([
  'schedule_type' => $job['schedule_type'],
  'run_at' => $job['run_at'],
  'time_of_day' => $job['time_of_day'],
  'times_of_day' => $job['times_of_day'],
  'days_of_week' => $job['days_of_week'],
  'timezone' => $job['timezone'],
]);

// If cannot compute (e.g. ONCE in past), set next_run_at to NOW+1min to avoid NULL
if ($next === null) {
  $next = (new DateTime())->modify('+1 minute')->format('Y-m-d H:i:s');
}
$job['next_run_at'] = $next;

if ($id > 0) {
  $sql = "UPDATE schedule_jobs SET
    name=:name, enabled=:enabled, channel=:channel,
    payload=:payload, content_type=:content_type,
    qos=:qos, retained=:retained, mqtt_topic=:mqtt_topic,
    http_method=:http_method, http_url=:http_url, http_headers_json=:http_headers_json,
    schedule_type=:schedule_type, run_at=:run_at, time_of_day=:time_of_day, times_of_day=:times_of_day, days_of_week=:days_of_week, timezone=:timezone,
    next_run_at=:next_run_at,
    max_retries=:max_retries, retry_backoff_sec=:retry_backoff_sec, timeout_sec=:timeout_sec
    WHERE id=:id";
  $stmt = $pdo->prepare($sql);
  $job['id'] = $id;
  $stmt->execute($job);
} else {
  $sql = "INSERT INTO schedule_jobs
    (name, enabled, channel, payload, content_type,
     qos, retained, mqtt_topic,
     http_method, http_url, http_headers_json,
     schedule_type, run_at, time_of_day, times_of_day, days_of_week, timezone,
     next_run_at, max_retries, retry_backoff_sec, timeout_sec)
    VALUES
    (:name, :enabled, :channel, :payload, :content_type,
     :qos, :retained, :mqtt_topic,
     :http_method, :http_url, :http_headers_json,
     :schedule_type, :run_at, :time_of_day, :times_of_day, :days_of_week, :timezone,
     :next_run_at, :max_retries, :retry_backoff_sec, :timeout_sec)";
  $stmt = $pdo->prepare($sql);
  $stmt->execute($job);
}

header("Location: index.php?msg=" . urlencode("已儲存，next_run_at 已重算"));
exit;
