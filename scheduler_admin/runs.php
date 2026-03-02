<?php
require __DIR__ . '/auth.php';
require_login();

require __DIR__ . '/db.php';
require __DIR__ . '/functions.php';

$rows = $pdo->query("
  SELECT r.*, j.name
  FROM schedule_runs r
  JOIN schedule_jobs j ON j.id=r.job_id
  ORDER BY r.id DESC
  LIMIT 300
")->fetchAll();
?>
<!doctype html>
<html lang="zh-Hant">
<head>
<link href="assets/admin.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
<meta name="viewport" content="width=device-width, initial-scale=1">
  <meta charset="utf-8">
  <title>Scheduler Admin v7.6</title>
  </head>
<body>
<div class="page-shell">

  <div class="topbar">
    <div>
      <div class="brand">Scheduler Admin</div>
      <div class="sub">v7.6 · Build 2026-03-01 06:06:18</div>
    </div>
    <div class="d-flex gap-2 flex-wrap">
      <a class="btn btn-outline-primary btn-xs" href="job_edit.php">＋ 新增任務</a>
      <a class="btn btn-outline-secondary btn-xs" href="runs.php">查看執行紀錄</a>
      <form method="post" action="recalc.php" style="display:inline">
        <button class="btn btn-outline-secondary btn-xs" type="submit" onclick="return confirm('要重算所有 DAILY/WEEKLY 的 next_run_at 嗎？')">重算 next_run_at</button>
      </form>
      <a class="btn btn-outline-dark btn-xs" href="logout.php">登出</a>
    </div>
  </div>

  <div class="topbar">
    <h2>Scheduler Runs</h2>
    <div>
      <a class="btn btn-sm btn-outline-primary" href="index.php">返回 Jobs</a>
      <a class="btn btn-sm btn-outline-primary" href="logout.php">登出</a>
    </div>
  </div>

  <div class="card-box">
<div class="table-responsive"><table>
    <tr>
      <th>ID</th><th>Job</th><th>Planned</th><th>Started</th><th>Finished</th><th>Status</th><th>Attempt</th><th>HTTP</th><th>Error</th><th>Body</th>
    </tr>
    <?php foreach($rows as $r): ?>
      <tr>
        <td><?= h($r['id']) ?></td>
        <td>#<?= h($r['job_id']) ?> <?= h($r['name']) ?></td>
        <td><?= h($r['planned_at']) ?></td>
        <td><?= h($r['started_at']) ?></td>
        <td><?= h($r['finished_at']) ?></td>
        <td><?= $r['status']==='SUCCESS' ? '<span class="s">SUCCESS</span>' : '<span class="f">FAILED</span>' ?></td>
        <td><?= h($r['attempt']) ?></td>
        <td><?= h($r['response_code']) ?></td>
        <td><pre><?= h($r['error_message']) ?></pre></td>
        <td><pre><?= h($r['response_body']) ?></pre></td>
      </tr>
    <?php endforeach; ?>
  </table></div>
</div>
</body>
</html>
