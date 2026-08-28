/*
# Add target_score column to students

## Summary
Previously the target score was hardcoded to 35/40 in the UI. Now each student
can set their own target score during onboarding, and it is stored in the
database so the route and profile screens can display it dynamically.

## Changes
1. Modified Tables
   - `students`: added column `target_score` (integer, nullable, default null)
     — stores the student's personal target score (e.g. 35 out of 40)
2. Security
   - No RLS changes — existing policies remain intact
*/

ALTER TABLE students ADD COLUMN IF NOT EXISTS target_score integer;