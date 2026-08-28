/*
# Fix diagnostic_sessions RLS — direct user_id ownership

## Problem
INSERT into diagnostic_sessions fails with "new row violates row-level security policy"
because the INSERT policy uses EXISTS through the students table, which can fail
when the student's user_id is null or not yet visible.

## Fix
1. Add `user_id` column directly to diagnostic_sessions with `DEFAULT auth.uid()`
   — the database fills it from the authenticated session automatically.
2. Rewrite all policies to check `auth.uid() = user_id` directly (no subquery).
3. Add an UPDATE policy (was missing).
4. Backfill existing rows: set user_id from the linked students table.

## Security
- RLS stays enabled.
- SELECT, INSERT, UPDATE, DELETE all scoped to `auth.uid() = user_id`.
- No anon access — only authenticated users can access their own sessions.
*/

-- Add user_id column with DEFAULT auth.uid()
ALTER TABLE diagnostic_sessions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill existing rows from students table
UPDATE diagnostic_sessions
SET user_id = (SELECT user_id FROM students WHERE students.id = diagnostic_sessions.student_id)
WHERE user_id IS NULL;

-- Make it NOT NULL with default for future inserts
ALTER TABLE diagnostic_sessions ALTER COLUMN user_id SET DEFAULT auth.uid();
ALTER TABLE diagnostic_sessions ALTER COLUMN user_id SET NOT NULL;

-- Drop old policies
DROP POLICY IF EXISTS "select_own_diagnostic_sessions" ON diagnostic_sessions;
DROP POLICY IF EXISTS "insert_own_diagnostic_sessions" ON diagnostic_sessions;
DROP POLICY IF EXISTS "delete_own_diagnostic_sessions" ON diagnostic_sessions;

-- Recreate with direct user_id check
CREATE POLICY "select_own_diagnostic_sessions"
  ON diagnostic_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert_own_diagnostic_sessions"
  ON diagnostic_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_diagnostic_sessions"
  ON diagnostic_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_diagnostic_sessions"
  ON diagnostic_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Index for ownership queries
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_user_id ON diagnostic_sessions(user_id);
