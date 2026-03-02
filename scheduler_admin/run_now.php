<?php
require __DIR__ . '/auth.php';
require_login();

require __DIR__ . '/db.php';

$cfg = require __DIR__ . '/config.php';

$id = (int)($_GET['id'] ?? 0);
if (!$id) die('id required');

/*
  Immediate execution strategy (v5.7):
  - Call Python Scheduler Control API (server-side curl) to enqueue job immediately.
  - Also set enabled=1 (optional) but DO NOT force next_run_at=NOW() to avoid schedule distortion.
*/

// Ensure enabled=1 so recurring jobs keep active if paused previously
$stmt = $pdo->prepare("UPDATE schedule_jobs SET enabled=1 WHERE id=?");
$stmt->execute([$id]);

$control_url = $cfg['control']['url'] ?? 'http://127.0.0.1:5055/run_immediate';
$token = $cfg['control']['token'] ?? '';

$url = $control_url . '?job_id=' . urlencode($id);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);

$headers = ['Accept: application/json'];
if (!empty($token) && $token !== 'CHANGE_ME') {
  $headers[] = 'X-Token: ' . $token;
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$resp = curl_exec($ch);
$err = curl_error($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($resp === false) {
  header("Location: index.php?msg=" . urlencode("立即執行失敗 (curl): " . $err));
  exit;
}

$data = json_decode($resp, true);
if ($http >= 200 && $http < 300 && isset($data['ok']) && $data['ok']) {
  header("Location: index.php?msg=" . urlencode("已送出立即執行: Job#$id"));
  exit;
}

header("Location: index.php?msg=" . urlencode("立即執行失敗 HTTP=$http resp=$resp"));
exit;
?>
