/*
# Create students and diagnostic_results tables (single-tenant prototype)

1. Overview
This migration sets up the data layer for the "AI Learning GPS" educational
platform prototype. It stores student profiles created during onboarding and
the per-topic diagnostic mastery results computed from the placement quiz.
The app is a single-tenant prototype with no sign-in screen for students, so
policies allow anon + authenticated access (data is intentionally shared for
the demo).

2. New Tables
- `students`
  - `id` (uuid, primary key)
  - `name` (text, not null) — student display name
  - `grade` (int, not null) — school grade 7..12
  - `subject` (text, not null) — chosen subject (MVP: Математика)
  - `goal` (text, not null) — preparation goal (ЕНТ / Олимпиада / Повторение / Контрольная)
  - `exam_date` (date, nullable) — optional deadline / exam date
  - `created_at` (timestamptz, default now())
- `diagnostic_results`
  - `id` (uuid, primary key)
  - `student_id` (uuid, foreign key -> students.id ON DELETE CASCADE)
  - `topic` (text, not null) — topic key (fractions, percentages, equations, functions)
  - `mastery_pct` (numeric, not null) — mastery percentage 0..100
  - `created_at` (timestamptz, default now())

3. Security
- Enable RLS on both tables.
- Allow anon + authenticated full CRUD: the prototype has no sign-in screen,
  so the anon-key frontend must be able to read and write its own data. Data
  is intentionally shared/public for the demo.

4. Notes
- Indexes added on student_id (diagnostic_results) and created_at for query
  performance.
- Tables use IF NOT EXISTS for idempotency; policies are dropped before
  recreate to stay idempotent across re-runs.
*/

CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  grade int NOT NULL,
  subject text NOT NULL,
  goal text NOT NULL,
  exam_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_students" ON students;
CREATE POLICY "anon_select_students" ON students FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_students" ON students;
CREATE POLICY "anon_insert_students" ON students FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_students" ON students;
CREATE POLICY "anon_update_students" ON students FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_students" ON students;
CREATE POLICY "anon_delete_students" ON students FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS diagnostic_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic text NOT NULL,
  mastery_pct numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE diagnostic_results ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_diagnostic_results_student_id
  ON diagnostic_results(student_id);

CREATE INDEX IF NOT EXISTS idx_students_created_at
  ON students(created_at DESC);

DROP POLICY IF EXISTS "anon_select_diagnostic_results" ON diagnostic_results;
CREATE POLICY "anon_select_diagnostic_results" ON diagnostic_results FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_diagnostic_results" ON diagnostic_results;
CREATE POLICY "anon_insert_diagnostic_results" ON diagnostic_results FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_diagnostic_results" ON diagnostic_results;
CREATE POLICY "anon_update_diagnostic_results" ON diagnostic_results FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_diagnostic_results" ON diagnostic_results;
CREATE POLICY "anon_delete_diagnostic_results" ON diagnostic_results FOR DELETE
  TO anon, authenticated USING (true);
