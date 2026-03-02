<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/config.php';

$id = isset($_GET['id']) ? intval($_GET['id']) : 0;
if ($id <= 0) {
  header("Location: jobs.php?msg=" . urlencode("RunNow failed: invalid id"));
  exit;
}

$url = $PY_CONTROL_URL . '?job_id=' . urlencode($id);
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);

$headers = array('Accept: application/json');
if (!empty($PY_CONTROL_TOKEN) && $PY_CONTROL_TOKEN !== 'CHANGE_ME') {
  $headers[] = 'X-Token: ' . $PY_CONTROL_TOKEN;
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$resp = curl_exec($ch);
$err = curl_error($ch);
$http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($resp === false) {
  header("Location: jobs.php?msg=" . urlencode("RunNow failed (curl): " . $err));
  exit;
}

$data = json_decode($resp, true);
if ($http >= 200 && $http < 300 && isset($data['ok']) && $data['ok']) {
  header("Location: jobs.php?msg=" . urlencode("RunNow queued: Job#" . $id));
  exit;
}

header("Location: jobs.php?msg=" . urlencode("RunNow failed HTTP=$http resp=" . $resp));
exit;
?>
