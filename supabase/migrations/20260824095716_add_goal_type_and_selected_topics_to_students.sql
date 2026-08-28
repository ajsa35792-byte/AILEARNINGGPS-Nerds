/*
# Add goal_type and selected_topics to students

## Summary
Stores structured goal type and selected topics for goal-based personalization.

## Changes
1. Modified Tables
   - `students`: added `goal_type` text (nullable) and `selected_topics` text[] (nullable)
2. Security
   - No RLS changes — existing policies remain intact
*/

ALTER TABLE students ADD COLUMN IF NOT EXISTS goal_type text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS selected_topics text[];