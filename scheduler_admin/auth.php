<?php
// auth.php - simple session auth
session_start();

function is_logged_in(): bool {
  return !empty($_SESSION['logged_in']);
}

function require_login(): void {
  if (!is_logged_in()) {
    header('Location: login.php');
    exit;
  }
}

function login_ok(string $username, string $password): bool {
  $config = require __DIR__ . '/config.php';
  $auth = $config['auth'] ?? [];
  $u = (string)($auth['username'] ?? '');
  $p = (string)($auth['password'] ?? '');
  return hash_equals($u, $username) && hash_equals($p, $password);
}
