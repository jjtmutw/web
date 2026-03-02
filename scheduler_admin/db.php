<?php
// db.php (PDO)
$config = require __DIR__ . '/config.php';
$db = $config['db'];

$dsn = sprintf(
  'mysql:host=%s;port=%d;dbname=%s;charset=%s',
  $db['host'], $db['port'], $db['name'], $db['charset']
);

$options = [
  PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
  PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  PDO::ATTR_EMULATE_PREPARES => false,
];

$pdo = new PDO($dsn, $db['user'], $db['pass'], $options);

// Force session time zone to Asia/Taipei (+08:00) to avoid 8-hour shifts
$pdo->exec("SET time_zone = '+08:00'");
