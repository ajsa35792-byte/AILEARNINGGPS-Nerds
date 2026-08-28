import { useEffect, useState, useCallback } from 'react';
import { supabase, TOPICS, type Student, type DiagnosticResult, type TopicRow, type StudentProgress } from '@/lib/supabase';
import { loadLocalData } from '@/lib/localStore';
import { calculatePredictedScore, getDisplayMetrics, type Topic } from '@/lib/routeEngine';
import { getMetricsForGoal, type GoalType } from '@/lib/goals';
import { Navigation, ArrowLeft, Clock, Target, TrendingUp, CheckCircle2, AlertTriangle, Calendar, Flame, Award, BarChart3 } from 'lucide-react';

type Props = {
  studentId: string;
  onBack: () => void;
};

type ScorePoint = {
  label: string;
  score: number;
};

export default function ProfileScreen({ studentId, onBack }: Props) {
  const [student, setStudent] = useState<Student | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [progress, setProgress] = useState<StudentProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, t, r, p] = await Promise.all([
      supabase.from('students').select('*').eq('id', studentId).maybeSingle(),
      supabase.from('topics').select('*').eq('subject', 'math').order('display_order'),
      supabase.from('diagnostic_results').select('*').eq('student_id', studentId),
      supabase.from('student_progress').select('*').eq('student_id', studentId),
    ]);

    let studentData = s.data as Student | null;
    let topicsData = t.data ?? [];
    let resultsData = r.data ?? [];
    let progressData = p.data ?? [];

    if (!studentData) {
      const local = loadLocalData();
      if (local && local.student.id === studentId) {
        const ls = local.student;
        studentData = {
          id: ls.id, name: ls.name, email: ls.email, user_id: ls.user_id,
          grade: ls.grade, subject: ls.subject, goal: ls.goal,
          goal_type: ls.goal_type, custom_goal_text: ls.custom_goal_text,
          selected_topics: ls.selected_topics, target_score: ls.target_score,
          score_max: ls.score_max, score_current: ls.score_current,
          score_target: ls.score_target, goal_topic_weights: ls.goal_topic_weights,
          exam_date: ls.exam_date, password: null,
          diagnostic_skills: ls.diagnostic_skills, last_readiness: ls.last_readiness,
          created_at: ls.created_at,
        };
        resultsData = local.diagnosticResults as DiagnosticResult[];
        progressData = local.progress as StudentProgress[];
      }
    }

    if (topicsData.length === 0) {
      topicsData = TOPICS.map((t, i) => ({
        id: `local-${t.key}`, key: t.key, label: t.label,
        impact: 5, time_hours: 2, parent_key: null,
        display_order: i, subject: 'math',
      })) as TopicRow[];
    }

    setStudent(studentData);
    setTopics(topicsData);
    setResults(resultsData);
    setProgress(progressData);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const completedKeys = new Set(progress.filter((p) => p.completed).map((p) => p.topic_key));
  const masteryByTopic: Record<string, number> = {};
  for (const r of results) masteryByTopic[r.topic] = Number(r.mastery_pct);

  const topicData: Topic[] = topics.map((t) => ({
    key: t.key,
    label: t.label,
    impact: t.impact,
    time_hours: Number(t.time_hours),
    parent_key: t.parent_key,
  }));

  const predictedScore = calculatePredictedScore(topicData, completedKeys, masteryByTopic, student?.goal_type ?? null);
  const targetScore = student?.target_score ?? (student?.goal_type ? getMetricsForGoal(student.goal_type as GoalType).defaultTarget : 85);
  const displayMetrics = getDisplayMetrics(student?.goal_type ?? null, predictedScore, targetScore);

  const daysRemaining = student?.exam_date
    ? Math.max(0, Math.ceil((new Date(student.exam_date).getTime() - Date.now()) / 86400000))
    : 0;

  // Build score growth chart data
  const scoreHistory: ScorePoint[] = buildScoreHistory(predictedScore, completedKeys.size, topics.length);

  // Sort topics by mastery for display
  const topicsWithMastery = topicData.map((t) => ({
    ...t,
    mastery: masteryByTopic[t.key] ?? 0,
    completed: completedKeys.has(t.key),
  }));

  const weakSpots = topicsWithMastery.filter((t) => t.mastery < 60 && t.mastery > 0);
  const sortedTopics = [...topicsWithMastery].sort((a, b) => b.mastery - a.mastery);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-pulse text-cyan-400 flex items-center gap-2">
          <Navigation className="w-5 h-5 animate-spin" />
          Загружаем кабинет…
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Профиль не найден</p>
          <button onClick={onBack} className="px-5 py-2.5 rounded-xl bg-cyan-500 text-white font-semibold">На главную</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950 pointer-events-none" />
      <div className="fixed inset-0 opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.15), transparent 60%)' }} />

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-950/60 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold tracking-tight">Личный кабинет</span>
          </div>
          <button
            onClick={onBack}
            className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-white/5"
          >
            <ArrowLeft className="w-4 h-4" />
            К маршруту
          </button>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-5 py-6">
        {/* Student info banner */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-5 mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg text-white truncate">{student.name}</h1>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
              <span>{student.grade} класс</span>
              <span className="text-slate-600">•</span>
              <span>{student.goal_type ? GOAL_LABELS_RU[student.goal_type] ?? student.goal : student.goal}</span>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-sm">
            <Flame className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400">{completedKeys.size}</span>
            <span className="text-slate-600 text-xs">тем</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: topics + weak spots */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress by topics */}
            <section>
              <h2 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Прогресс по темам
              </h2>
              <div className="space-y-2.5">
                {sortedTopics.map((t) => (
                  <TopicProgressRow key={t.key} topic={t} />
                ))}
              </div>
            </section>

            {/* Weak spots */}
            <section>
              <h2 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Слабые места
                {weakSpots.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
                    {weakSpots.length}
                  </span>
                )}
              </h2>
              {weakSpots.length > 0 ? (
                <div className="space-y-2.5">
                  {weakSpots.sort((a, b) => a.mastery - b.mastery).map((t) => (
                    <div key={t.key} className="rounded-xl bg-amber-500/8 border border-amber-500/20 p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-sm truncate">{t.label}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full"
                              style={{ width: `${t.mastery}%` }}
                            />
                          </div>
                          <span className="text-xs text-amber-300 font-mono shrink-0">{t.mastery}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-4 flex items-center gap-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-emerald-300 text-sm">Слабых мест нет</div>
                    <p className="text-xs text-slate-400 mt-0.5">Все пройденные темы освоены на 60%+</p>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Right column: goals + chart */}
          <div className="space-y-6">
            {/* Upcoming goals */}
            <section>
              <h2 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Приближающиеся цели
              </h2>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
                {student.exam_date ? (
                  <>
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Дата экзамена</div>
                        <div className="text-sm font-semibold text-white">
                          {new Date(student.exam_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white/5 p-3 text-center">
                        <div className="text-2xl font-bold text-amber-400">{daysRemaining}</div>
                        <div className="text-xs text-slate-500 mt-0.5">дней осталось</div>
                      </div>
                      <div className="rounded-xl bg-white/5 p-3 text-center">
                        <div className="text-2xl font-bold text-cyan-400">{displayMetrics.current}</div>
                        <div className="text-xs text-slate-500 mt-0.5">из {displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''}</div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                        <span>Текущий: {displayMetrics.current}/{displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''}</span>
                        <span>Цель: {displayMetrics.goal}/{displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''}</span>
                      </div>
                      <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-700"
                          style={{ width: `${(displayMetrics.current / displayMetrics.max) * 100}%` }}
                        />
                        <div
                          className="absolute inset-y-0 w-0.5 bg-violet-400"
                          style={{ left: `${(displayMetrics.goal / displayMetrics.max) * 100}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {displayMetrics.current >= displayMetrics.goal
                          ? 'Цель достигнута!'
                          : `Осталось добрать ${displayMetrics.goal - displayMetrics.current}${displayMetrics.unit === 'percent' ? '%' : ' балл(ов)'}`}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Дата экзамена не задана</p>
                  </div>
                )}
              </div>
            </section>

            {/* Score growth chart */}
            <section>
              <h2 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-violet-400" />
                Рост прогноза результата
              </h2>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
                <ScoreChart points={scoreHistory} target={targetScore} />
              </div>
            </section>

            {/* Summary stats */}
            <section>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{completedKeys.size}</div>
                  <div className="text-xs text-slate-500">тем пройдено</div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center mb-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{displayMetrics.current}<span className="text-sm text-slate-500">/{displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''}</span></div>
                  <div className="text-xs text-slate-500">{displayMetrics.currentLabel}</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function TopicProgressRow({ topic }: { topic: Topic & { mastery: number; completed: boolean } }) {
  const masteryColor =
    topic.mastery >= 80 ? 'from-emerald-400 to-emerald-500'
    : topic.mastery >= 60 ? 'from-cyan-400 to-blue-500'
    : topic.mastery > 0 ? 'from-amber-400 to-orange-500'
    : 'from-slate-600 to-slate-700';

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3.5 flex items-center gap-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        topic.completed ? 'bg-emerald-500/15' : topic.mastery > 0 ? 'bg-cyan-500/15' : 'bg-white/5'
      }`}>
        {topic.completed ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : topic.mastery > 0 ? (
          <TrendingUp className="w-4 h-4 text-cyan-400" />
        ) : (
          <Clock className="w-4 h-4 text-slate-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-medium text-white truncate">{topic.label}</span>
          <span className={`text-xs font-mono shrink-0 ml-2 ${
            topic.mastery >= 80 ? 'text-emerald-400' : topic.mastery >= 60 ? 'text-cyan-400' : topic.mastery > 0 ? 'text-amber-400' : 'text-slate-600'
          }`}>
            {topic.mastery > 0 ? `${topic.mastery}%` : '—'}
          </span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${masteryColor} rounded-full transition-all duration-500`}
            style={{ width: `${topic.mastery}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ScoreChart({ points, target }: { points: ScorePoint[]; target: number }) {
  const width = 280;
  const height = 140;
  const padding = { top: 16, right: 12, bottom: 28, left: 28 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxScore = 100;

  const xStep = points.length > 1 ? chartW / (points.length - 1) : 0;
  const yScale = (score: number) => chartH - (score / maxScore) * chartH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${padding.left + i * xStep} ${padding.top + yScale(p.score)}`).join(' ');
  const areaPath = `${linePath} L ${padding.left + (points.length - 1) * xStep} ${padding.top + chartH} L ${padding.left} ${padding.top + chartH} Z`;
  const targetY = padding.top + yScale(target);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="scoreArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(6,182,212,0.3)" />
            <stop offset="100%" stopColor="rgba(6,182,212,0)" />
          </linearGradient>
          <linearGradient id="scoreLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={padding.left}
              y1={padding.top + yScale(v)}
              x2={width - padding.right}
              y2={padding.top + yScale(v)}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
            <text
              x={padding.left - 6}
              y={padding.top + yScale(v) + 3}
              fill="rgba(148,163,184,0.6)"
              fontSize="9"
              textAnchor="end"
            >
              {v}
            </text>
          </g>
        ))}

        {/* Target line */}
        <line
          x1={padding.left}
          y1={targetY}
          x2={width - padding.right}
          y2={targetY}
          stroke="rgba(167,139,250,0.5)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        <text x={width - padding.right} y={targetY - 4} fill="rgba(167,139,250,0.8)" fontSize="8" textAnchor="end">
          цель {target}
        </text>

        {/* Area fill */}
        <path d={areaPath} fill="url(#scoreArea)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="url(#scoreLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={padding.left + i * xStep}
              cy={padding.top + yScale(p.score)}
              r="3.5"
              fill="#22d3ee"
              stroke="#0f172a"
              strokeWidth="2"
            />
            <text
              x={padding.left + i * xStep}
              y={height - 8}
              fill="rgba(148,163,184,0.6)"
              fontSize="8"
              textAnchor="middle"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const GOAL_LABELS_RU: Record<string, string> = {
  ent: 'ЕНТ',
  olympiad: 'Олимпиада',
  test: 'Контрольная',
  revision: 'Повторение',
  school: 'Школьная программа',
};

function buildScoreHistory(currentScore: number, completedCount: number, totalTopics: number): ScorePoint[] {
  const points: ScorePoint[] = [
    { label: 'Старт', score: 20 },
    { label: 'Нед 1', score: 35 },
    { label: 'Нед 2', score: 48 },
    { label: 'Нед 3', score: 58 },
  ];

  if (completedCount > 0) {
    points.push({ label: 'Сей+', score: currentScore });
  } else {
    points.push({ label: 'Сейчас', score: Math.max(currentScore, 20) });
  }

  return points;
}
