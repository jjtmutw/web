UPDATE schedule_jobs
SET next_run_at =
  CASE
    WHEN TIMESTAMP(CURDATE(), TIME(time_of_day)) > NOW()
      THEN TIMESTAMP(CURDATE(), TIME(time_of_day))
    ELSE TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL 1 DAY), TIME(time_of_day))
  END
WHERE enabled = 1
  AND schedule_type = 'DAILY'
  AND time_of_day IS NOT NULL;

UPDATE schedule_jobs
SET next_run_at = run_at
WHERE schedule_type='ONCE' AND run_at IS NOT NULL;