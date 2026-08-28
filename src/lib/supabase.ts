import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Student = {
  id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  grade: number;
  subject: string;
  goal: string;
  goal_type: string | null;
  custom_goal_text: string | null;
  selected_topics: string[] | null;
  target_score: number | null;
  score_max: number | null;
  score_current: number | null;
  score_target: number | null;
  goal_topic_weights: Record<string, number> | null;
  exam_date: string | null;
  password: string | null;
  diagnostic_skills: Record<string, number> | null;
  last_readiness: number | null;
  created_at: string;
};

export type DiagnosticResult = {
  id: string;
  student_id: string;
  topic: string;
  mastery_pct: number;
  created_at: string;
};

export type DiagnosticSession = {
  id: string;
  student_id: string;
  session_type: 'initial' | 'recheck';
  overall_score: number;
  skills_breakdown: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  recommended_next: string | null;
  readiness_verdict: string | null;
  created_at: string;
};

export type TopicRow = {
  id: string;
  key: string;
  label: string;
  impact: number;
  time_hours: number;
  parent_key: string | null;
  display_order: number;
  subject: string;
};

export type StudentProgress = {
  id: string;
  student_id: string;
  topic_key: string;
  completed: boolean;
  completed_at: string | null;
};

export const TOPICS = [
  { key: 'fractions', label: 'Дроби' },
  { key: 'percentages', label: 'Проценты' },
  { key: 'equations', label: 'Линейные уравнения' },
  { key: 'systems_of_equations', label: 'Системы уравнений' },
  { key: 'functions', label: 'Функции' },
  { key: 'quadratic_equations', label: 'Квадратные уравнения' },
  { key: 'geometry', label: 'Геометрия' },
  { key: 'probability', label: 'Теория вероятностей' },
  { key: 'progressions', label: 'Прогрессии' },
  { key: 'word_problems', label: 'Текстовые задачи' },
] as const;

export type TopicKey = (typeof TOPICS)[number]['key'];

export const SUBJECTS = [
  { key: 'math', label: 'Математика', available: true },
] as const;
