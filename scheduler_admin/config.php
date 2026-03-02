<?php
// config.php
// 1) Update DB credentials
// 2) Update admin login username/password (plain for simplicity; you can switch to password_hash later)
return [
  'db' => [
    'host' => '127.0.0.1',
    'port' => 3306,
    'name' => 'smartcare',
    'user' => 'root',
    'pass' => 'tmu2012',
    'charset' => 'utf8mb4',
  ],
  'control' => [
    'url' => 'http://127.0.0.1:5055/run_immediate',
    'token' => 'james',
  ],
  'auth' => [
    'username' => 'admin',
    'password' => 'james087', // simple password (session-based). Change it.
  ],
];

// Python Scheduler Control API (for Run Now)
$PY_CONTROL_URL = 'http://127.0.0.1:5055/run_immediate';
$PY_CONTROL_TOKEN = 'james';
