/*
# Create topics and student_progress tables

1. Overview
Stores the topic graph (impact, time, parent dependencies) and per-student
completion state. The route engine reads these tables to compute the
personalized learning path deterministically.

2. New Tables
- `topics`
  - id (uuid, pk)
  - key (text, unique) — stable topic identifier
  - label (text) — human-readable label (Russian)
  - impact (int) — topic importance 1..5
  - time_hours (numeric) — estimated study time in hours
  - parent_key (text, nullable) — key of prerequisite topic (null = no prerequisite)
  - display_order (int) — default ordering
- `student_progress`
  - id (uuid, pk)
  - student_id (uuid, fk -> students.id ON DELETE CASCADE)
  - topic_key (text) — which topic
  - completed (boolean, default false)
  - completed_at (timestamptz, nullable) — when the topic was marked done
  - UNIQUE(student_id, topic_key)

3. Seed Data
10 math topics with impact, time, and parent relationships:
  fractions(2, 1.5h, none), percentages(2, 1h, none),
  equations(3, 2h, fractions), systems_of_equations(3, 2.5h, equations),
  functions(4, 2h, equations), quadratic_equations(5, 3h, functions),
  geometry(4, 4h, none), probability(2, 1.5h, none),
  progressions(3, 2h, equations), word_problems(4, 3h, functions)

4. Security
- RLS enabled on both tables.
- anon + authenticated full CRUD (single-tenant prototype, no sign-in screen).
*/

CREATE TABLE IF NOT EXISTS topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  label text NOT NULL,
  impact int NOT NULL,
  time_hours numeric NOT NULL,
  parent_key text,
  display_order int NOT NULL DEFAULT 0
);

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_topics" ON topics;
CREATE POLICY "anon_select_topics" ON topics FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_topics" ON topics;
CREATE POLICY "anon_insert_topics" ON topics FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_topics" ON topics;
CREATE POLICY "anon_update_topics" ON topics FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_topics" ON topics;
CREATE POLICY "anon_delete_topics" ON topics FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS student_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  topic_key text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  UNIQUE(student_id, topic_key)
);

ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_student_progress_student_id
  ON student_progress(student_id);

DROP POLICY IF EXISTS "anon_select_student_progress" ON student_progress;
CREATE POLICY "anon_select_student_progress" ON student_progress FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_student_progress" ON student_progress;
CREATE POLICY "anon_insert_student_progress" ON student_progress FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_student_progress" ON student_progress;
CREATE POLICY "anon_update_student_progress" ON student_progress FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_student_progress" ON student_progress;
CREATE POLICY "anon_delete_student_progress" ON student_progress FOR DELETE
  TO anon, authenticated USING (true);

-- Seed topic data
INSERT INTO topics (key, label, impact, time_hours, parent_key, display_order) VALUES
  ('fractions', 'Дроби', 2, 1.5, NULL, 1),
  ('percentages', 'Проценты', 2, 1.0, NULL, 2),
  ('equations', 'Линейные уравнения', 3, 2.0, 'fractions', 3),
  ('systems_of_equations', 'Системы уравнений', 3, 2.5, 'equations', 4),
  ('functions', 'Функции', 4, 2.0, 'equations', 5),
  ('quadratic_equations', 'Квадратные уравнения', 5, 3.0, 'functions', 6),
  ('geometry', 'Геометрия', 4, 4.0, NULL, 7),
  ('probability', 'Теория вероятностей', 2, 1.5, NULL, 8),
  ('progressions', 'Прогрессии', 3, 2.0, 'equations', 9),
  ('word_problems', 'Текстовые задачи', 4, 3.0, 'functions', 10)
ON CONFLICT (key) DO NOTHING;
