<?php
require __DIR__ . '/auth.php';
require_login();

require __DIR__ . '/db.php';
require __DIR__ . '/functions.php';

// Recalculate next_run_at for DAILY/WEEKLY (enabled jobs only)
$stmt = $pdo->query("SELECT id, schedule_type, run_at, time_of_day, days_of_week, timezone, enabled FROM schedule_jobs WHERE enabled=1 AND schedule_type IN ('DAILY','WEEKLY')");
$jobs = $stmt->fetchAll();

$updated = 0;
$failed = 0;

$upd = $pdo->prepare("UPDATE schedule_jobs SET next_run_at=? WHERE id=?");

foreach ($jobs as $j) {
  $next = compute_next_run_at($j);
  if ($next === null) {
    $failed++;
    continue;
  }
  $upd->execute([$next, $j['id']]);
  $updated++;
}

header("Location: index.php?msg=" . urlencode("重算完成：更新 {$updated} 筆；失敗 {$failed} 筆"));
exit;
