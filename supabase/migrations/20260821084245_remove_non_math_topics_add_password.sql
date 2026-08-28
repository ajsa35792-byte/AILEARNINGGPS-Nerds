/*
# Remove non-math topics + add password column to students

## Summary
The app now focuses exclusively on mathematics. All non-math topics
(physics, chemistry, biology, informatics, history, geography, english)
are removed from the topics table. A password column is added to the
students table so users can log back into their existing accounts.

## Changes
1. Modified Tables
   - `students`: added column `password` (text, nullable — existing students
     have no password yet, new students will set one during onboarding)
2. Data Removal
   - Deleted all topics WHERE subject != 'math'
3. Security
   - No RLS changes — existing policies remain intact
*/

-- Add password column to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS password text;

-- Remove all non-math topics
DELETE FROM topics WHERE subject != 'math';