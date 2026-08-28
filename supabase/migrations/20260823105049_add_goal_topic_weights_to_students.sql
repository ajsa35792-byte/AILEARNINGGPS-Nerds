/*
# Add goal_topic_weights to students

## Summary
Stores AI-generated per-topic weight map (JSONB) so the route engine can
prioritize topics aligned with the student's free-text goal.

## Changes
1. Modified Tables
   - `students`: added column `goal_topic_weights` (jsonb, nullable, default null)
2. Security
   - No RLS changes — existing policies remain intact
*/

ALTER TABLE students ADD COLUMN IF NOT EXISTS goal_topic_weights jsonb;