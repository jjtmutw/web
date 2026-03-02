<?php
require __DIR__ . '/auth.php';
require_login();

require __DIR__ . '/db.php';

$id = (int)($_GET['id'] ?? 0);
if (!$id) die('id required');

$pdo->prepare("UPDATE schedule_jobs SET enabled = IF(enabled=1,0,1) WHERE id=?")->execute([$id]);

header("Location: index.php?msg=" . urlencode("已切換啟用狀態"));
exit;
