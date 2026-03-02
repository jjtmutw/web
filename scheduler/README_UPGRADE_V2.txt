Python Scheduler v2（多時段）
- 支援 schedule_jobs.times_of_day（CSV：09:00,15:00）
- 若 times_of_day 為空，會回退使用 time_of_day（單一時間）

DB 升級 SQL：
ALTER TABLE schedule_jobs
  ADD COLUMN times_of_day VARCHAR(255) NULL AFTER time_of_day;
