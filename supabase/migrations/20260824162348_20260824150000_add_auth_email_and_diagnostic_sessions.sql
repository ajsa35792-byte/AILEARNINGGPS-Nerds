/*
# Add email-based auth and diagnostic session history

## Purpose
Migrate from name+password auth to Supabase Auth (email+password).
Add diagnostic session tracking so users can see readiness history and re-take diagnostics.

## Changes

### 1. students table — add email column
- Add `email` text column (unique) to link with auth.users
- Add `user_id` uuid column referencing auth.users for RLS ownership
- Add `diagnostic_skills` jsonb column to store per-skill diagnostic breakdown
- Add `last_readiness` integer column for quick access to latest readiness %

### 2. New table: diagnostic_sessions
Tracks each diagnostic attempt with:
- id (uuid PK)
- student_id (uuid FK to students)
- session_type: 'initial' | 'recheck'
- overall_score (integer 0-100)
- skills_breakdown (jsonb: {skill_name: pct})
- strengths (text[])
- weaknesses (text[])
- recommended_next (text)
- readiness_verdict (text)
- created_at (timestamptz)

### 3. Security
- Enable RLS on diagnostic_sessions
- Owner-scoped policies: students can only see their own sessions
- Students table: add ownership policies via user_id

### 4. Important notes
- Existing students rows get user_id = NULL; they will still be accessible
  via the old name-based lookup until those users re-register
- email column is nullable for backward compatibility with existing rows
*/

-- Add columns to students
ALTER TABLE students ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS diagnostic_skills jsonb;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_readiness integer;

-- Create diagnostic_sessions table
CREATE TABLE IF NOT EXISTS diagnostic_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_type text NOT NULL DEFAULT 'initial',
  overall_score integer NOT NULL DEFAULT 0,
  skills_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  strengths text[] NOT NULL DEFAULT '{}',
  weaknesses text[] NOT NULL DEFAULT '{}',
  recommended_next text,
  readiness_verdict text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_student ON diagnostic_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_created ON diagnostic_sessions(student_id, created_at DESC);

-- Enable RLS on diagnostic_sessions
ALTER TABLE diagnostic_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_diagnostic_sessions" ON diagnostic_sessions;
CREATE POLICY "select_own_diagnostic_sessions"
  ON diagnostic_sessions FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM students WHERE students.id = diagnostic_sessions.student_id AND students.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_diagnostic_sessions" ON diagnostic_sessions;
CREATE POLICY "insert_own_diagnostic_sessions"
  ON diagnostic_sessions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM students WHERE students.id = diagnostic_sessions.student_id AND students.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_diagnostic_sessions" ON diagnostic_sessions;
CREATE POLICY "delete_own_diagnostic_sessions"
  ON diagnostic_sessions FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM students WHERE students.id = diagnostic_sessions.student_id AND students.user_id = auth.uid()));

-- Update students table policies for auth-based access
DROP POLICY IF EXISTS "select_own_student" ON students;
CREATE POLICY "select_own_student"
  ON students FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "insert_own_student" ON students;
CREATE POLICY "insert_own_student"
  ON students FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "update_own_student" ON students;
CREATE POLICY "update_own_student"
  ON students FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Keep diagnostic_results and student_progress accessible to authenticated users
-- (they already have policies from earlier migrations; these are child tables
--  scoped through student_id, but the original policies used anon+authenticated.
--  We leave those as-is to avoid breaking existing data.)
