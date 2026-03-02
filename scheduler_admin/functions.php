<?php
// functions.php

function compute_next_run_at(array $job): ?string {
  $tzName = $job['timezone'] ?: 'Asia/Taipei';
  $tz = new DateTimeZone($tzName);
  $now = new DateTime('now', $tz);

  $stype = $job['schedule_type'];

  // ONCE
  if ($stype === 'ONCE') {
    if (empty($job['run_at'])) return null;
    $runAt = new DateTime($job['run_at'], $tz);
    if ($runAt <= $now) return null;
    return $runAt->format('Y-m-d H:i:s');
  }

  // Build times list (prefer times_of_day CSV: "09:00,15:00", fallback to time_of_day)
  $times = [];
  $csv = isset($job['times_of_day']) ? trim((string)$job['times_of_day']) : '';
  if ($csv !== '') {
    foreach (explode(',', $csv) as $p) {
      $p = trim($p);
      if ($p === '') continue;
      if (preg_match('/^\d{2}:\d{2}$/', $p)) $p .= ':00';
      if (strpos($p, '.') !== false) $p = explode('.', $p)[0];
      $times[] = $p;
    }
  }
  if (empty($times)) {
    $tod = isset($job['time_of_day']) ? trim((string)$job['time_of_day']) : '';
    if ($tod === '') return null;
    if (strpos($tod, '.') !== false) $tod = explode('.', $tod)[0];
    $parts = explode(':', $tod);
    $hh = (int)($parts[0] ?? 0);
    $mm = (int)($parts[1] ?? 0);
    $ss = (int)($parts[2] ?? 0);
    $tod = sprintf('%02d:%02d:%02d', $hh, $mm, $ss);
    $times[] = $tod;
  }

  // unique + sort
  $times = array_values(array_unique($times));
  sort($times);

  if ($stype === 'DAILY') {
    for ($day=0; $day<=2; $day++) {
      $d = clone $now;
      if ($day > 0) $d->modify('+' . $day . ' day');
      foreach ($times as $t) {
        $cand = new DateTime($d->format('Y-m-d') . ' ' . $t, $tz);
        if ($cand > $now) return $cand->format('Y-m-d H:i:s');
      }
    }
    return null;
  }

  if ($stype === 'WEEKLY') {
    $days = $job['days_of_week'] ?: '';
    $daysList = array_filter(array_map('trim', explode(',', $days)));
    if (!$daysList) return null;

    $map = ['Mon'=>1,'Tue'=>2,'Wed'=>3,'Thu'=>4,'Fri'=>5,'Sat'=>6,'Sun'=>7]; // PHP N: 1(Mon)-7(Sun)
    $targets = [];
    foreach ($daysList as $d) {
      if (isset($map[$d])) $targets[] = $map[$d];
    }
    $targets = array_values(array_unique($targets));
    if (!$targets) return null;

    for ($i=0; $i<=14; $i++) {
      $d = clone $now;
      if ($i > 0) $d->modify('+' . $i . ' day');
      if (!in_array((int)$d->format('N'), $targets, true)) continue;

      foreach ($times as $t) {
        $cand = new DateTime($d->format('Y-m-d') . ' ' . $t, $tz);
        if ($cand > $now) return $cand->format('Y-m-d H:i:s');
      }
    }
    return null;
  }

  return null;
}


function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function parse_days_of_week($s) {
  $s = trim((string)$s);
  if ($s === '') return [];
  $s = str_replace(['(',')',' '], '', $s);
  $parts = array_filter(explode(',', $s));
  $out = [];
  foreach ($parts as $p) {
    $p = ucfirst(strtolower($p));
    if (in_array($p, ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])) $out[] = $p;
  }
  return array_values(array_unique($out));
}
function format_days_of_week($arr) {
  if (!is_array($arr)) return '';
  $valid = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  $out = [];
  foreach ($arr as $p) {
    $p = ucfirst(strtolower(trim((string)$p)));
    if (in_array($p, $valid)) $out[] = $p;
  }
  $out = array_values(array_unique($out));
  return implode(',', $out);
}
function week_days_map_zh() {
  return [
    'Mon'=>'週一','Tue'=>'週二','Wed'=>'週三','Thu'=>'週四','Fri'=>'週五','Sat'=>'週六','Sun'=>'週日'
  ];
}

