<?php
require __DIR__ . '/auth.php';

if (is_logged_in()) {
  header('Location: index.php');
  exit;
}

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $username = trim($_POST['username'] ?? '');
  $password = trim($_POST['password'] ?? '');
  if (login_ok($username, $password)) {
    $_SESSION['logged_in'] = 1;
    $_SESSION['username'] = $username;
    header('Location: index.php');
    exit;
  } else {
    $error = '帳號或密碼錯誤';
  }
}
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
      <div class="card-box">
<form method="post" action="recalc.php" style="display:inline">
        <button class="btn btn-outline-secondary btn-xs" type="submit" onclick="return confirm('要重算所有 DAILY/WEEKLY 的 next_run_at 嗎？')">重算 next_run_at</button>
      </form>
</div>
      <a class="btn btn-outline-dark btn-xs" href="logout.php">登出</a>
    </div>
  </div>

  <div class="box">
    <h2>Scheduler Admin</h2>
    <form method="post">
      <label>帳號</label>
      <input name="username" required>
      <label>密碼</label>
      <input name="password" type="password" required>
      <?php if($error): ?><div class="err"><?= h($error) ?></div><?php endif; ?>
      <button type="submit">登入</button>
      <div class="hint">請到 config.php 設定帳密。</div>
    </form>
  </div>
</div>
</body>
</html>
