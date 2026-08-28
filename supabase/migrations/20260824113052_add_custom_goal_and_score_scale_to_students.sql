/*
# Add custom goal text and user-defined score scale to students

1. Changes to `students` table:
   - `custom_goal_text` (text, nullable): free-text goal the student types themselves,
     e.g. "Подготовиться к контрольной по функциям". Used alongside the preset goal_type.
   - `score_max` (int, nullable, default 100): the maximum of the user's custom score scale.
     If null, defaults to 100 (percentage mode).
   - `score_current` (int, nullable, default 0): the student's self-reported current score.
   - `score_target` (int, nullable): the student's self-reported desired/target score.
     If null, falls back to target_score (legacy compatibility).

2. Notes:
   - All columns are nullable so existing rows are unaffected.
   - When score_max is set, the app displays "current/max -> target/max" (e.g. 18/40 -> 32/40).
   - When score_max is null or 100, the app displays percentages (e.g. 62% -> 85%).
   - target_score column remains for backward compatibility but score_target takes priority.
*/

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS custom_goal_text text,
  ADD COLUMN IF NOT EXISTS score_max int DEFAULT 100,
  ADD COLUMN IF NOT EXISTS score_current int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_target int;
