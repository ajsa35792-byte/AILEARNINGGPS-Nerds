import { useEffect, useState, useCallback } from 'react';
import { supabase, TOPICS, type Student, type DiagnosticResult, type TopicRow, type StudentProgress } from '@/lib/supabase';
import { loadLocalData, type LocalStudent, type LocalDiagnosticResult } from '@/lib/localStore';
import { calculateRoute, calculatePredictedScore, getDisplayMetrics, buildRouteFromAi, type Topic, type RouteStep, type RouteResult } from '@/lib/routeEngine';
import { generateLearningRoute } from '@/lib/ai';
import { getMetricsForGoal, type GoalType } from '@/lib/goals';
import TopicPlayer, { type TopicResult } from '@/components/TopicPlayer';
import { explainRoute } from '@/lib/ai';
import { Navigation, ArrowLeft, Clock, Target, TrendingUp, Zap, CheckCircle2, Circle, MapPin, AlertTriangle, Sparkles, RotateCw, BookOpen, User } from 'lucide-react';

type Props = {
  studentId: string;
  onBack: () => void;
  onProfile: () => void;
};

export default function RouteScreen({ studentId, onBack, onProfile }: Props) {
  const [student, setStudent] = useState<Student | null>(null);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [progress, setProgress] = useState<StudentProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [lowScoreWarning, setLowScoreWarning] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRoute, setAiRoute] = useState<RouteResult | null>(null);

  const load = useCallback(async () => {
    // Try Supabase first
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

    // If Supabase returned no student, fall back to localStorage
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

    // If topics table is empty, use hardcoded TOPICS
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
  const lastCompleted = [...progress]
    .filter((p) => p.completed && p.completed_at)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0];

  const topicData: Topic[] = topics.map((t) => ({
    key: t.key,
    label: t.label,
    impact: t.impact,
    time_hours: Number(t.time_hours),
    parent_key: t.parent_key,
  }));

  const masteryByTopic: Record<string, number> = {};
  for (const r of results) masteryByTopic[r.topic] = Number(r.mastery_pct);

  const route = aiRoute ?? calculateRoute(topicData, completedKeys, student?.exam_date ?? null, lastCompleted?.topic_key ?? null, student?.goal_topic_weights ?? null, masteryByTopic);
  const predictedScore = calculatePredictedScore(topicData, completedKeys, masteryByTopic, student?.goal_type ?? null);
  const targetScore = student?.score_target ?? student?.target_score ?? (student?.goal_type ? getMetricsForGoal(student.goal_type as GoalType).defaultTarget : 85);
  const displayMetrics = getDisplayMetrics(
    student?.goal_type ?? null,
    predictedScore,
    targetScore,
    student?.score_max ?? null,
    student?.score_current ?? null,
    student?.score_target ?? null,
    student?.custom_goal_text ?? null
  );

  const daysRemaining = student?.exam_date
    ? Math.max(0, Math.ceil((new Date(student.exam_date).getTime() - Date.now()) / 86400000))
    : 0;

  // Fetch AI-generated learning route (dynamic, goal-specific)
  useEffect(() => {
    if (!student || topics.length === 0 || results.length === 0) return;
    const missedTopics = Object.entries(masteryByTopic)
      .filter(([, v]) => v < 60)
      .map(([k]) => k);
    const completedTopicKeys = [...completedKeys];
    generateLearningRoute(
      student.grade,
      student.goal_type ?? 'school',
      student.goal,
      masteryByTopic,
      missedTopics,
      completedTopicKeys,
      student.exam_date,
      student.selected_topics ?? undefined
    ).then((aiNodes) => {
      if (aiNodes && aiNodes.length > 0) {
        setAiRoute(buildRouteFromAi(aiNodes, topicData, completedKeys));
      }
    });
  }, [student?.id, topics.length, results.length, progress.length]);

  // Fetch AI explanation for "Why this topic now?" when next step changes
  useEffect(() => {
    if (!route.nextStep || !student) return;
    setAiLoading(true);
    setAiExplanation(null);
    const completedTopicLabels = topicData
      .filter((t) => completedKeys.has(t.key))
      .map((t) => t.label);
    explainRoute(
      completedTopicLabels,
      masteryByTopic,
      daysRemaining,
      route.nextStep.topic.label,
      route.nextStep.topic.impact,
      route.nextStep.topic.time_hours,
      student.goal,
      targetScore,
      masteryByTopic[route.nextStep.topic.key]
    ).then((result) => {
      setAiExplanation(result.text);
      setAiLoading(false);
    });
  }, [route.nextStep?.topic.key, student?.id]);

  if (activeTopic) {
    return (
      <TopicPlayer
        studentId={studentId}
        topicKey={activeTopic}
        grade={student?.grade ?? 9}
        onBack={() => setActiveTopic(null)}
        onComplete={(result: TopicResult) => {
          if (result.newMastery < 60) {
            const parentKey = topicData.find((t) => t.key === result.topicKey)?.parent_key;
            if (parentKey) {
              const parentLabel = topicData.find((t) => t.key === parentKey)?.label ?? parentKey;
              setLowScoreWarning(parentLabel);
            }
          }
          setActiveTopic(null);
          load();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-pulse text-cyan-400 flex items-center gap-2">
          <RotateCw className="w-5 h-5 animate-spin" />
          Строим маршрут…
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

  // Build the visual route: completed (in order) + nextStep + upcoming
  const completedTopicsInOrder = topicData.filter((t) => completedKeys.has(t.key));
  const routeNodes: { topic: Topic; status: 'done' | 'next' | 'upcoming' | 'locked' }[] = [
    ...completedTopicsInOrder.map((t) => ({ topic: t, status: 'done' as const })),
  ];
  if (route.nextStep) routeNodes.push({ topic: route.nextStep.topic, status: 'next' });
  for (const s of route.upcoming) routeNodes.push({ topic: s.topic, status: 'upcoming' as const });
  // locked topics (unfinished parent)
  const lockedTopics = topicData.filter(
    (t) => !completedKeys.has(t.key) && t.parent_key && !completedKeys.has(t.parent_key)
  );
  for (const t of lockedTopics) routeNodes.push({ topic: t, status: 'locked' as const });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950 pointer-events-none" />
      <div className="fixed inset-0 opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.15), transparent 60%)' }} />

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-950/60 border-b border-white/5">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Navigation className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold tracking-tight">Мой маршрут</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onProfile}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-white/5"
            >
              <User className="w-4 h-4" />
              Кабинет
            </button>
            <button
              onClick={onBack}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-white/5"
            >
              <ArrowLeft className="w-4 h-4" />
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-5 py-6">
        {/* 4 key metrics — goal-dependent labels */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <MetricCard
            icon={TrendingUp}
            label={displayMetrics.currentLabel}
            value={`${displayMetrics.current}`}
            sub={displayMetrics.unit === 'points' ? `/ ${displayMetrics.max} баллов` : '%'}
            color="cyan"
          />
          <MetricCard
            icon={Target}
            label={displayMetrics.goalLabel}
            value={`${displayMetrics.goal}`}
            sub={displayMetrics.unit === 'points' ? `/ ${displayMetrics.max} цель` : '% цель'}
            color="violet"
          />
          <MetricCard
            icon={Clock}
            label="Осталось"
            value={student.exam_date ? `${daysRemaining}` : '—'}
            sub={student.exam_date ? 'дней' : 'без дедлайна'}
            color="amber"
          />
          <MetricCard
            icon={CheckCircle2}
            label="Пройдено"
            value={`${completedKeys.size}`}
            sub={`/ ${topics.length} тем`}
            color="emerald"
          />
        </div>

        {route.isRushing && (
          <div className="mb-5 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Режим «торопимся»: до дедлайна меньше времени, чем нужно на ключевые темы. Маршрут ускорен.</span>
          </div>
        )}

        {lowScoreWarning && (
          <div className="mb-5 flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span>Маршрут скорректирован — рекомендуем повторить тему «{lowScoreWarning}» перед продолжением.</span>
              <button onClick={() => setLowScoreWarning(null)} className="block mt-1 text-xs text-amber-400 hover:text-amber-300 underline">Понятно</button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Route visualization */}
          <div className="lg:col-span-3">
            <h2 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Маршрут подготовки
            </h2>

            {/* Road */}
            <div className="relative">
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-500/60 via-white/10 to-transparent" />
              <div className="space-y-3">
                {routeNodes.map((node, i) => (
                  <RouteNodeCard
                    key={node.topic.key}
                    node={node}
                    index={i}
                    onStartTopic={(key) => setActiveTopic(key)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Next step detail */}
          <div className="lg:col-span-2 space-y-4">
            {route.nextStep ? (
              <NextStepCard step={route.nextStep} onStartTopic={(key) => setActiveTopic(key)} aiExplanation={aiExplanation} aiLoading={aiLoading} />
            ) : (
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/10 border border-emerald-500/30 p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <h3 className="font-bold text-lg text-white">Все темы пройдены!</h3>
                <p className="text-sm text-slate-400 mt-1">Ты прошёл все доступные темы. Отличная работа!</p>
              </div>
            )}

            {/* Score projection — goal-dependent */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-semibold text-slate-300">{displayMetrics.currentLabel}</span>
              </div>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-4xl font-bold text-white">{displayMetrics.current}</span>
                <span className="text-lg text-slate-500 mb-1">/ {displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''}</span>
              </div>
              <div className="h-2.5 bg-white/10 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-700"
                  style={{ width: `${(displayMetrics.current / displayMetrics.max) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Текущий: {displayMetrics.current}/{displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''}</span>
                <span>Цель: {displayMetrics.goal}/{displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''}</span>
              </div>
              <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-400/60 rounded-full"
                  style={{ width: `${(displayMetrics.goal / displayMetrics.max) * 100}%` }}
                />
              </div>
            </div>

            {/* Remaining time */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-slate-300">Время на маршрут</span>
              </div>
              <p className="text-2xl font-bold text-white">{route.remainingTimeHours.toFixed(1)} ч</p>
              <p className="text-xs text-slate-500 mt-1">остаток по непройденным темам</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  color: 'cyan' | 'violet' | 'amber' | 'emerald';
}) {
  const colors = {
    cyan: 'text-cyan-400 bg-cyan-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
  };
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-xs text-slate-400 font-medium">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        <span className="text-xs text-slate-500">{sub}</span>
      </div>
    </div>
  );
}

function RouteNodeCard({
  node,
  index,
  onStartTopic,
}: {
  node: { topic: Topic; status: 'done' | 'next' | 'upcoming' | 'locked' };
  index: number;
  onStartTopic: (key: string) => void;
}) {
  const { topic, status } = node;

  const styles = {
    done: 'border-emerald-500/30 bg-emerald-500/5',
    next: 'border-cyan-400/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/10',
    upcoming: 'border-white/10 bg-white/[0.03] opacity-50',
    locked: 'border-white/5 bg-white/[0.02] opacity-30',
  };

  const dotStyles = {
    done: 'bg-emerald-400 text-emerald-950',
    next: 'bg-cyan-400 text-cyan-950 ring-4 ring-cyan-400/20',
    upcoming: 'bg-slate-600 text-slate-300',
    locked: 'bg-slate-700 text-slate-500',
  };

  return (
    <div className={`relative pl-12`}>
      <button
        onClick={() => status !== 'locked' && status !== 'done' && onStartTopic(topic.key)}
        disabled={status === 'locked' || status === 'done'}
        className={`w-full text-left p-4 rounded-2xl border transition-all ${styles[status]} ${
          status !== 'locked' && status !== 'done' ? 'hover:scale-[1.01] cursor-pointer' : 'cursor-default'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : status === 'next' ? (
                <Zap className="w-4 h-4 text-cyan-400 shrink-0" />
              ) : status === 'locked' ? (
                <Circle className="w-4 h-4 text-slate-600 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-500 shrink-0" />
              )}
              <span className={`font-semibold truncate ${status === 'done' ? 'text-slate-400' : 'text-white'}`}>
                {topic.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Target className="w-3 h-3" /> impact {topic.impact}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {topic.time_hours}ч
              </span>
            </div>
          </div>
          {status === 'next' && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-cyan-400/20 text-cyan-300 shrink-0">
              СЕЙЧАС
            </span>
          )}
          {status === 'done' && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-400/20 text-emerald-300 shrink-0">
              ГОТОВО
            </span>
          )}
        </div>
      </button>
      {/* Dot on the road */}
      <div
        className={`absolute left-3 top-5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${dotStyles[status]}`}
      >
        {index + 1}
      </div>
    </div>
  );
}

function NextStepCard({
  step,
  onStartTopic,
  aiExplanation,
  aiLoading,
}: {
  step: RouteStep;
  onStartTopic: (key: string) => void;
  aiExplanation: string | null;
  aiLoading: boolean;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-cyan-500/15 to-blue-500/5 border border-cyan-400/30 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-cyan-400/20 flex items-center justify-center">
          <Zap className="w-4 h-4 text-cyan-300" />
        </div>
        <span className="text-sm font-semibold text-cyan-300">Что делать сейчас</span>
      </div>

      <h3 className="text-xl font-bold text-white mb-3">{step.topic.label}</h3>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5 text-sm">
          <Target className="w-4 h-4 text-violet-400" />
          <span className="text-slate-400">Важность:</span>
          <span className="font-bold text-white">{step.topic.impact}/5</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="text-slate-400">Время:</span>
          <span className="font-bold text-white">{step.topic.time_hours}ч</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 text-xs">
        <span className="text-slate-500">Priority score:</span>
        <span className="font-mono font-bold text-cyan-300">{step.priorityScore}</span>
        <span className="text-slate-600">×{step.confidenceMultiplier}</span>
      </div>

      <div className="rounded-xl bg-white/5 border border-white/10 p-3 mb-4">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs text-slate-400 font-medium">Why this topic now?</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-medium flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            Powered by AI
          </span>
        </div>
        {aiLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
            Анализируем маршрут…
          </div>
        ) : (
          <p className="text-sm text-slate-300 leading-relaxed">{aiExplanation ?? step.reason}</p>
        )}
      </div>

      <button
        onClick={() => onStartTopic(step.topic.key)}
        className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-semibold transition-all flex items-center justify-center gap-2"
      >
        <BookOpen className="w-5 h-5" />
        Начать тему
      </button>
    </div>
  );
}
