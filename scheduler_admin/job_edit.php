<?php
require __DIR__ . '/auth.php';
require_login();

require __DIR__ . '/db.php';
require __DIR__ . '/functions.php';

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

$job = [
  'id'=>0,'name'=>'','enabled'=>1,'channel'=>'HTTP','payload'=>'','content_type'=>'text/plain',
  'qos'=>0,'retained'=>0,'mqtt_topic'=>'',
  'http_method'=>'GET','http_url'=>'','http_headers_json'=>'',
  'schedule_type'=>'DAILY','run_at'=>'','time_of_day'=>'09:00:00','days_of_week'=>'Mon',
  'timezone'=>'Asia/Taipei','max_retries'=>3,'retry_backoff_sec'=>60,'timeout_sec'=>10
];


$WEEK_DAYS = week_days_map_zh();
$selected_days = parse_days_of_week($job['days_of_week'] ?? '');
if ($id) {
  $stmt = $pdo->prepare("SELECT * FROM schedule_jobs WHERE id=?");
  $stmt->execute([$id]);
  $row = $stmt->fetch();
  if ($row) $job = array_merge($job, $row);
}
?>
<!doctype html>
<html lang="zh-Hant">
<head>
<link href="assets/admin.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
<meta name="viewport" content="width=device-width, initial-scale=1">
  <meta charset="utf-8">
  <title>Scheduler Admin v7.6.2</title>
  <script>
  function toggleChannelBlocks(){
    var ch = document.querySelector('select[name="channel"]').value;
    var mqtt = document.getElementById('mqtt_block');
    var http = document.getElementById('http_block');
    if(ch === 'MQTT'){
      mqtt.classList.remove('hidden');
      http.classList.add('hidden');
    }else{
      http.classList.remove('hidden');
      mqtt.classList.add('hidden');
    }
  }
  document.addEventListener('DOMContentLoaded', function(){
    var sel = document.querySelector('select[name="channel"]');
    if(sel){
      sel.addEventListener('change', toggleChannelBlocks);
      toggleChannelBlocks();
    }
  });
</script>
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
      <form method=\"post\" action=\"recalc.php\" style=\"display:inline\">
        <button class=\"btn btn-outline-secondary btn-xs\" type=\"submit\" onclick=\"return confirm('要重算所有 DAILY/WEEKLY 的 next_run_at 嗎？')\">重算 next_run_at</button>
      </form>
      <a class="btn btn-outline-dark btn-xs" href="logout.php">登出</a>
    </div>
  </div>

  <h2><?= $id ? '編輯任務' : '新增任務' ?> </h2>
  <div class="card-box">
  <form method="post" action="job_save.php">
    <input class="form-control" type="hidden" name="id" value="<?= h($job['id']) ?>">

    <label>名稱 name</label>
    <input class="form-control" name="name" value="<?= h($job['name']) ?>" required>

    <div class="row">
      <div class="col">
        <label>啟用 enabled</label>
        <select class="form-select" name="enabled">
          <option value="1" <?= (int)$job['enabled']===1?'selected':'' ?>>ON</option>
          <option value="0" <?= (int)$job['enabled']===0?'selected':'' ?>>OFF</option>
        </select>
      </div>
      <div class="col">
        <label>Channel</label>
        <select class="form-select" name="channel">
          <option value="MQTT" <?= $job['channel']==='MQTT'?'selected':'' ?>>MQTT</option>
          <option value="HTTP" <?= $job['channel']==='HTTP'?'selected':'' ?>>HTTP</option>
        </select>
      </div>
    </div>

    <label>payload（可純文字或 JSON 字串）<br><small>HTTP GET 多半用 URL query 參數，payload 可留空；POST/PUT 可放 JSON 或文字。</small></label>
    <textarea class="form-control" name="payload"><?= h($job['payload']) ?></textarea>

    <label>content_type（HTTP用：text/plain / application/json）</label>
    <input class="form-control" name="content_type" value="<?= h($job['content_type']) ?>">

    
<div id="mqtt_block" class="block">
  <h3>MQTT 設定 <span class="badge">Channel = MQTT</span></h3>
  <div class="hint">
    當 Channel 選擇 <b>MQTT</b> 時，系統會把 <b>payload</b> 發送到指定的 <b>mqtt_topic</b>。<br>
    QoS / Retained 可依你的下游裝置需求調整。
  </div>

  <div class="row">
    <div class="col">
      <label>mqtt_topic</label>
      <input class="form-control" name="mqtt_topic" value="<?= h($job['mqtt_topic']) ?>">
    </div>
    <div class="col">
      <label>qos</label>
      <input class="form-control" name="qos" type="number" value="<?= h($job['qos']) ?>">
      <div class="hint">0 / 1 / 2（一般控制類用 0 或 1）</div>
    </div>
    <div class="col">
      <label>retained</label>
      <select class="form-select" name="retained">
        <option value="0" <?= (int)$job['retained']===0?'selected':'' ?>>0</option>
        <option value="1" <?= (int)$job['retained']===1?'selected':'' ?>>1</option>
      </select>
      <div class="hint">1 代表 broker 保留最後一則訊息</div>
    </div>
  </div>
</div>

<div id="http_block" class="block">
  <h3>HTTP 設定 <span class="badge">Channel = HTTP</span></h3>
  <div class="hint">
    當 Channel 選擇 <b>HTTP</b> 時，系統會以 http_method 呼叫 http_url。<br>
    GET 通常用 URL Query；POST/PUT 可用 payload 傳文字或 JSON（content_type=application/json）。
  </div>

  <div class="row">
    <div class="col">
      <label>http_method</label>
      <select class="form-select" name="http_method">
        <option value="GET" <?= $job['http_method']==='GET'?'selected':'' ?>>GET</option>
        <option value="POST" <?= $job['http_method']==='POST'?'selected':'' ?>>POST</option>
        <option value="PUT" <?= $job['http_method']==='PUT'?'selected':'' ?>>PUT</option>
      </select>
    </div>
    <div class="col">
      <label>http_url</label>
      <input class="form-control" name="http_url" value="<?= h($job['http_url']) ?>">
      <div class="hint">例：https://test.prof-jj.com/api/push?phone=...&msg=...</div>
    </div>
  </div>

  <label>http_headers_json（例如 {"X-API-KEY":"123"}，可留空）</label>
  <input class="form-control" name="http_headers_json" value="<?= h($job['http_headers_json']) ?>">
</div>

<h3>排程設定</h3>

    <div class="row">
      <div class="col">
        <label>schedule_type</label>
        <select class="form-select" name="schedule_type">
          <option value="ONCE" <?= $job['schedule_type']==='ONCE'?'selected':'' ?>>ONCE</option>
          <option value="DAILY" <?= $job['schedule_type']==='DAILY'?'selected':'' ?>>DAILY</option>
          <option value="WEEKLY" <?= $job['schedule_type']==='WEEKLY'?'selected':'' ?>>WEEKLY</option>
        </select>
      </div>
      <div class="col">
        <label>run_at（ONCE用，格式：YYYY-mm-dd HH:ii:ss）</label>
        <input class="form-control" name="run_at" value="<?= h($job['run_at']) ?>">
      </div>
      <div class="col">
        <label>time_of_day（DAILY/WEEKLY用，格式：HH:ii:ss）</label>
        <input class="form-control" name="time_of_day" value="<?= h($job['time_of_day']) ?>">
      </div>
    </div>

    <?php
  // days_of_week stored as "Mon,Wed,Fri"
  $selectedDays = array_filter(array_map('trim', explode(',', (string)($job['days_of_week'] ?? ''))));
  $allDays = [
    ['en'=>'Mon','zh'=>'週一'],
    ['en'=>'Tue','zh'=>'週二'],
    ['en'=>'Wed','zh'=>'週三'],
    ['en'=>'Thu','zh'=>'週四'],
    ['en'=>'Fri','zh'=>'週五'],
    ['en'=>'Sat','zh'=>'週六'],
    ['en'=>'Sun','zh'=>'週日'],
  ];

  // times_of_day (multi) stored as "09:00,15:00"
  $timesStr = (string)($job['times_of_day'] ?? '');
  $times = array_filter(array_map('trim', explode(',', $timesStr)));
  if (!$times) { $times = [$job['time_of_day'] ?? '09:00:00']; }
  $times = array_map(function($t){
    $t = (string)$t;
    if (strpos($t,'.')!==false) $t = explode('.',$t)[0];
    $p = explode(':',$t);
    $hh = $p[0] ?? '00'; $mm = $p[1] ?? '00';
    return sprintf('%02d:%02d', (int)$hh, (int)$mm);
  }, $times);
?>

<label>WEEKLY：星期（可複選）<br>
  <small>後端儲存英文代碼（Mon..Sun），格式：<code>Mon,Wed,Fri</code></small>
</label>
<div class="hint">目前 DB（days_of_week）：<code><?= h($job['days_of_week'] ?? '') ?></code>
  <?php
    $zhMap = ['Mon'=>'週一','Tue'=>'週二','Wed'=>'週三','Thu'=>'週四','Fri'=>'週五','Sat'=>'週六','Sun'=>'週日'];
    $tmp = array_filter(array_map('trim', explode(',', (string)($job['days_of_week'] ?? ''))));
    $tmp = array_values(array_unique(array_map(function($d){ return ucfirst(strtolower($d)); }, $tmp)));
    $zh = [];
    foreach ($tmp as $d) { if(isset($zhMap[$d])) $zh[] = $zhMap[$d]; }
  ?>
  <?php if (!empty($zh)): ?>（<?= implode('、', $zh) ?>）<?php endif; ?>
</div>

<div class="dow-wrap">
  <?php foreach ($allDays as $d):
      $en=$d['en']; $zh=$d['zh'];
      $active=in_array($en, $selectedDays, true);
      $idp = 'dow_' . $en;
  ?>
    <span class="dow-pill <?= $active ? 'active' : '' ?>">
      <input type="checkbox" id="<?= h($idp) ?>" name="days_of_week_arr[]" value="<?= h($en) ?>" <?= $active ? 'checked' : '' ?>>
      <label for="<?= h($idp) ?>"><span class="zh"><?= h($zh) ?></span><span class="en"><?= h($en) ?></span></label>
    </span>
  <?php endforeach; ?>
</div>

<input type="hidden" name="days_of_week" id="days_of_week" value="<?= h($job['days_of_week'] ?? '') ?>">
<label style="margin-top:12px;">WEEKLY：一天可多個時段（例：週一 09:00 / 15:00）<br>
  <small>後端會儲存成 times_of_day 欄位：09:00,15:00（逗號分隔）</small>
</label>

<div class="times-wrap" id="times_wrap"></div>
<div style="margin-top:8px;">
  <button type="button" class="mini-btn" onclick="addTimeChip()">+ 新增時段</button>
</div>
<input class="form-control" type="hidden" name="times_of_day" id="times_of_day" value="<?= h($job['times_of_day'] ?? '') ?>">

<div class="preview" id="next_preview">
  下一次執行時間預覽：<b>（請先選擇排程）</b>
</div>

<script>
  const DEFAULT_TIMES = <?= json_encode($times, JSON_UNESCAPED_UNICODE) ?>;

  function syncDaysOfWeek(){
    const checked = Array.from(document.querySelectorAll('input[name="days_of_week_arr[]"]:checked'))
      .map(x => x.value);
    document.getElementById('days_of_week').value = checked.join(',');
  }

  function refreshPillUI(){
    document.querySelectorAll('.dow-pill').forEach(p=>{
      const cb = p.querySelector('input[type=checkbox]');
      if(cb && cb.checked) p.classList.add('active'); else p.classList.remove('active');
    });
  }

  function addTimeChip(value){
    const wrap = document.getElementById('times_wrap');
    const chip = document.createElement('div');
    chip.className = 'time-chip';
    chip.innerHTML = `
      <span>時間</span>
      <input class="form-control" type="time" value="${value || '09:00'}">
      <button type="button" title="刪除">刪除</button>
    `;
    chip.querySelector('button').addEventListener('click', ()=>{
      chip.remove();
      syncTimes();
      updatePreview();
    });
    chip.querySelector('input').addEventListener('change', ()=>{
      syncTimes();
      updatePreview();
    });
    wrap.appendChild(chip);
    syncTimes();
  }

  function syncTimes(){
    const times = Array.from(document.querySelectorAll('#times_wrap input[type=time]'))
      .map(i => i.value).filter(Boolean);
    const uniq = Array.from(new Set(times)).sort();
    document.getElementById('times_of_day').value = uniq.join(',');
  }

  function getNowInTZ(tz){
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    });
    const parts = Object.fromEntries(dtf.formatToParts(new Date()).map(p => [p.type, p.value]));
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`);
  }

  function parseTimeHHMM(s){
    const [hh, mm] = (s || '00:00').split(':');
    return {hh: parseInt(hh||'0',10), mm: parseInt(mm||'0',10)};
  }

  function nextRunPreview(){
    const stype = document.querySelector('select[name="schedule_type"]').value;
    const tz = (document.querySelector('input[name="timezone"]').value || 'Asia/Taipei').trim();
    const now = getNowInTZ(tz);

    if(stype === 'ONCE'){
      const runAtStr = (document.querySelector('input[name="run_at"]').value || '').trim();
      if(!runAtStr) return null;
      const candidate = new Date(runAtStr.replace(' ', 'T'));
      if(isNaN(candidate.getTime())) return null;
      if(candidate <= now) return null;
      return candidate;
    }

    const timesStr = (document.getElementById('times_of_day').value || '').trim();
    let times = timesStr ? timesStr.split(',').map(x=>x.trim()).filter(Boolean) : [];
    if(times.length===0){
      const tod = (document.querySelector('input[name="time_of_day"]').value || '09:00:00').trim();
      times = [tod.substring(0,5)];
    }
    times = Array.from(new Set(times)).sort();

    if(stype === 'DAILY'){
      for(let dayOffset=0; dayOffset<=2; dayOffset++){
        const d = new Date(now.getTime());
        d.setDate(d.getDate()+dayOffset);
        for(const t of times){
          const {hh,mm}=parseTimeHHMM(t);
          const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0);
          if(c > now) return c;
        }
      }
      return null;
    }

    if(stype === 'WEEKLY'){
      const daysVal = (document.getElementById('days_of_week').value || '').trim();
      if(!daysVal) return null;
      const map = {Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:0};
      const targets = daysVal.split(',').map(x=>x.trim()).filter(Boolean).map(x=>map[x]).filter(x=>x!==undefined);
      if(targets.length===0) return null;

      for(let i=0;i<=14;i++){
        const d = new Date(now.getTime());
        d.setDate(d.getDate()+i);
        if(!targets.includes(d.getDay())) continue;
        for(const t of times){
          const {hh,mm}=parseTimeHHMM(t);
          const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0);
          if(c > now) return c;
        }
      }
      return null;
    }

    return null;
  }

  function fmt(dt){
    const pad=n=>String(n).padStart(2,'0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  }

  function updatePreview(){
    const box = document.getElementById('next_preview');
    const dt = nextRunPreview();
    if(!dt){
      box.innerHTML = '下一次執行時間預覽：<b>（無法計算；請檢查 WEEKLY 是否有勾選星期、以及時間）</b>';
      return;
    }
    box.innerHTML = '下一次執行時間預覽：<b>' + fmt(dt) + '</b>';
  }

  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('input[name="days_of_week_arr[]"]').forEach(cb=>{
      cb.addEventListener('change', ()=>{ syncDaysOfWeek(); refreshPillUI(); updatePreview(); });
    });
    syncDaysOfWeek(); refreshPillUI();

    DEFAULT_TIMES.forEach(t => addTimeChip(t));
    syncTimes();

    ['schedule_type','run_at','time_of_day','timezone'].forEach(name=>{
      const el = document.querySelector(`[name="${name}"]`);
      if(el) el.addEventListener('change', updatePreview);
      if(el) el.addEventListener('keyup', updatePreview);
    });

    updatePreview();
  });
</script>

    <div class="row">
      <div class="col">
        <label>timezone</label>
        <input class="form-control" name="timezone" value="<?= h($job['timezone']) ?>">
      </div>
      <div class="col">
        <label>max_retries</label>
        <input class="form-control" name="max_retries" type="number" value="<?= h($job['max_retries']) ?>">
      </div>
      <div class="col">
        <label>retry_backoff_sec</label>
        <input class="form-control" name="retry_backoff_sec" type="number" value="<?= h($job['retry_backoff_sec']) ?>">
      </div>
      <div class="col">
        <label>timeout_sec</label>
        <input class="form-control" name="timeout_sec" type="number" value="<?= h($job['timeout_sec']) ?>">
      </div>
    </div>

    <p style="margin-top:14px;">
      <button class="btn btn-sm btn-outline-primary" type="submit">儲存</button>
      <a class="btn btn-sm btn-outline-primary" href="index.php">返回</a>
    </p>
  </form>
</div>
</div>
</body>
</html>
