<?php
require __DIR__ . '/auth.php';
require_login();

require __DIR__ . '/db.php';
require __DIR__ . '/functions.php';

$jobs = $pdo->query("SELECT * FROM schedule_jobs ORDER BY id DESC")->fetchAll();
?>
<!doctype html>
<html lang="zh-Hant">
<head>
<link href="assets/admin.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
<meta name="viewport" content="width=device-width, initial-scale=1">
  <meta charset="utf-8">
  <title>Scheduler Admin v7.6.2</title>
  













</head>
<body>
<div class="page-shell">
  <div class="topbar">
    <div>
      <div class="brand">Scheduler Admin</div>
      <div class="sub">v7.6.2 · Build 2026-03-01 06:21:41</div>
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

</div>
<?php if (!empty($_GET['msg'])): ?>
    <p style="color:green;font-weight:bold;"><?= h($_GET['msg']) ?></p>
  <?php endif; ?>

  <div class="card-box">
<div class="table-responsive"><div class="container-box"><table class="table table-sm table-bordered align-middle">
    <tr>
      <th class="col-id">ID</th><th class="col-name">Name</th><th>Enabled</th><th>Channel</th><th>Schedule</th>
      <th>Next Run (DB)</th><th>Next Run (Calc)</th><th class="col-target">Target</th><th class="col-actions">Actions</th>
    </tr>
    <?php foreach($jobs as $j): ?>
      <tr class="<?= $j['enabled'] ? '' : 'off' ?>">
        <td class="col-id"><?= h($j['id']) ?></td>
        <td><?= h($j['name']) ?></td>
        <td><?= $j['enabled'] ? '<span class="ok">ON</span>' : 'OFF' ?></td>
        <td><?= h($j['channel']) ?></td>
        <td>
          <?= h($j['schedule_type']) ?>
          <?php if ($j['schedule_type']==='ONCE'): ?>
            @ <?= h($j['run_at']) ?>
          <?php elseif ($j['schedule_type']==='DAILY'): ?>
            @ <?= h($j['time_of_day']) ?>
          <?php else: ?>
            <?= h($j['days_of_week']) ?> @ <?= h($j['time_of_day']) ?>
          <?php endif; ?>
        </td>
        <td><?= h($j['next_run_at']) ?></td>
        <td>
          <?php
            $calc = compute_next_run_at($j);
            $db = $j['next_run_at'] ?? '';
            if ($db && $calc && $db !== $calc) {
              echo '<span class="mismatch">'.h($calc).'</span>';
            } else {
              echo h($calc ?? '');
            }
          ?>
        </td>
        <td class="col-target">
          <?php if ($j['channel']==='MQTT'): ?>
            topic: <?= h($j['mqtt_topic']) ?>
          <?php else: ?>
            url: <?= h($j['http_url']) ?>
          <?php endif; ?>
        </td>
        
        <td class="col-actions">
          <div class="actions-wrap">
            <a class="btn btn-outline-primary btn-xs" href="run_now.php?id=<?= h($j['id']) ?>" onclick="return confirm('要立即執行這個任務嗎？')">立即執行</a>
            <a class="btn btn-outline-primary btn-xs" href="job_edit.php?id=<?= h($j['id']) ?>">編輯</a>
            <a class="btn btn-outline-primary btn-xs" href="job_toggle.php?id=<?= h($j['id']) ?>"><?= $j['enabled'] ? '停用' : '啟用' ?></a>
            <a class="btn btn-outline-danger btn-xs" href="job_delete.php?id=<?= h($j['id']) ?>" onclick="return confirm('確定刪除?')">刪除</a>
          </div>
        </td>

      </tr>
    <?php endforeach; ?>
  </table></div></div>
</div>
</div>
</body>
</html>