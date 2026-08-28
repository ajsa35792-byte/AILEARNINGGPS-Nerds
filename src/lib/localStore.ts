// localStorage fallback for demo reliability.
// Saves profile, goal, diagnostic results, and route so the user
// can always continue even if Supabase auth/RLS fails.

const KEY = 'ai_gps_local';

export type LocalDiagnosticResult = {
  topic: string;
  mastery_pct: number;
};

export type LocalStudent = {
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
  diagnostic_skills: Record<string, number> | null;
  last_readiness: number | null;
  created_at: string;
};

export type LocalData = {
  student: LocalStudent;
  diagnosticResults: LocalDiagnosticResult[];
  progress: { topic_key: string; completed: boolean; completed_at: string | null }[];
};

export function saveLocalData(data: LocalData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage may be full or unavailable — ignore for demo
  }
}

export function loadLocalData(): LocalData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LocalData;
  } catch {
    return null;
  }
}

export function clearLocalData(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function genLocalId(): string {
  return 'local-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
