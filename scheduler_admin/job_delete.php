<?php
require __DIR__ . '/auth.php';
require_login();

require __DIR__ . '/db.php';

$id = (int)($_GET['id'] ?? 0);
if (!$id) die('id required');

$pdo->prepare("DELETE FROM schedule_jobs WHERE id=?")->execute([$id]);

header("Location: index.php?msg=" . urlencode("已刪除任務"));
exit;
