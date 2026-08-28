import { useState, useRef, useEffect } from 'react';
import { supabase, TOPICS } from '@/lib/supabase';
import { getDiagnosticQuestions, type DiagnosticQuestion } from '@/lib/diagnostic';
import { generateDiagnosticQuestions, rankTopicsForGoal, analyzeDiagnostic, type AiDiagnosticQuestion, type DiagnosticProfile } from '@/lib/ai';
import { getGoalsForGrade, getTopicsForGrade, getMetricsForGoal, GOALS, type GoalType } from '@/lib/goals';
import { saveLocalData, genLocalId, type LocalStudent, type LocalDiagnosticResult } from '@/lib/localStore';
import { Navigation, ArrowLeft, ArrowRight, Check, Loader2, Clock, Target, BookOpen, GraduationCap, Sparkles, Trophy, ClipboardCheck, RotateCw, ChevronRight, TrendingUp, AlertTriangle, Zap, Award, Mail } from 'lucide-react';

type Props = {
  onComplete: (studentId: string) => void;
  onBack: () => void;
};

const GRADES = [7, 8, 9, 10, 11, 12];

const GOAL_ICONS: Record<string, typeof Target> = {
  GraduationCap,
  Trophy,
  ClipboardCheck,
  RotateCw,
  BookOpen,
  Target,
};

export default function Onboarding({ onComplete, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<GoalType | null>(null);
  const [customGoalText, setCustomGoalText] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [usePercentScale, setUsePercentScale] = useState(true);
  const [scoreMax, setScoreMax] = useState<number | null>(100);
  const [scoreCurrent, setScoreCurrent] = useState<number | null>(null);
  const [scoreTarget, setScoreTarget] = useState<number | null>(null);
  const [examDate, setExamDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [answerTimes, setAnswerTimes] = useState<Record<string, number>>({});
  const questionStartRef = useRef<number>(Date.now());
  const [aiQuestions, setAiQuestions] = useState<AiDiagnosticQuestion[] | null>(null);
  const [topicWeights, setTopicWeights] = useState<Record<string, number> | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [usingAi, setUsingAi] = useState(false);
  const [diagPhase, setDiagPhase] = useState<'questions' | 'analyzing' | 'summary'>('questions');
  const [diagProfile, setDiagProfile] = useState<DiagnosticProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const goalDef = goalType ? GOALS[goalType] : null;
  const metrics = goalType ? getMetricsForGoal(goalType) : null;
  const effectiveMax = !usePercentScale && scoreMax ? scoreMax : 100;
  const effectiveTarget = scoreTarget ?? metrics?.defaultTarget ?? 85;
  const effectiveCurrent = scoreCurrent ?? 0;
  const effectiveGoalText = customGoalText.trim() || goalDef?.label || 'подготовка';

  const availableGoals = grade ? getGoalsForGrade(grade) : [];
  const availableTopics = grade ? getTopicsForGrade(grade) : [];

  const fallbackQuestions: DiagnosticQuestion[] = grade ? getDiagnosticQuestions(grade) : [];
  const diagnosticQuestions: (AiDiagnosticQuestion | DiagnosticQuestion)[] = aiQuestions ?? fallbackQuestions;
  const totalQ = diagnosticQuestions.length;
  const currentQ = diagnosticQuestions[qIndex];
  const progress = totalQ > 0 ? ((qIndex + (currentQ && answers[currentQ.id] !== undefined ? 1 : 0)) / totalQ) * 100 : 0;

  const canStep0 = name.trim().length > 0 && grade !== null;
  const canStep1 = goalType !== null && (goalType !== 'custom' || customGoalText.trim().length > 0);
  const canStep2 = goalType === null || !GOALS[goalType].needsTopicSelection || selectedTopics.length > 0;

  // Reset timer when question changes
  useEffect(() => {
    if (diagPhase === 'questions' && currentQ) {
      questionStartRef.current = Date.now();
    }
  }, [qIndex, diagPhase]);

  // Auto-compute diagnostic results when all questions answered
  const allAnswered = totalQ > 0 && Object.keys(answers).length >= totalQ;

  // Compute per-topic results
  const topicResults: Record<string, { correct: number; total: number; pct: number }> = {};
  for (const q of diagnosticQuestions) {
    if (!topicResults[q.topic]) topicResults[q.topic] = { correct: 0, total: 0, pct: 0 };
    topicResults[q.topic].total += 1;
    if (answers[q.id] === q.correctIndex) topicResults[q.topic].correct += 1;
  }
  for (const t of Object.keys(topicResults)) {
    const r = topicResults[t];
    r.pct = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
  }
  const totalCorrect = Object.values(topicResults).reduce((s, r) => s + r.correct, 0);
  const overallPct = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;

  function toggleTopic(key: string) {
    setSelectedTopics((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  }

  function handleAnswer(qid: string, optionIdx: number) {
    const elapsed = Date.now() - questionStartRef.current;
    setAnswers((prev) => ({ ...prev, [qid]: optionIdx }));
    setAnswerTimes((prev) => ({ ...prev, [qid]: elapsed }));
    // No feedback shown — just move to next question after brief delay
    setTimeout(() => {
      if (qIndex < totalQ - 1) {
        setQIndex(qIndex + 1);
      }
    }, 300);
  }

  // When all questions answered, auto-advance to analysis
  useEffect(() => {
    if (allAnswered && diagPhase === 'questions') {
      setDiagPhase('analyzing');
      runAnalysis();
    }
  }, [allAnswered, diagPhase]);

  async function runAnalysis() {
    if (!grade || !goalType) return;
    setProfileLoading(true);

    // Build answer records for AI analysis
    const answerRecords = diagnosticQuestions.map((q) => {
      const studentIdx = answers[q.id];
      const isCorrect = studentIdx === q.correctIndex;
      return {
        question: q.question,
        topic: q.topic,
        studentAnswer: studentIdx !== undefined ? q.options[studentIdx] : '(нет ответа)',
        correct: isCorrect,
        timeMs: answerTimes[q.id],
      };
    });

    try {
      const profile = await analyzeDiagnostic(grade, effectiveGoalText, goalType, answerRecords);
      setDiagProfile(profile);
    } catch {
      setDiagProfile(null);
    }
    setProfileLoading(false);
    setDiagPhase('summary');
  }

  async function startDiagnostic() {
    if (!grade || !goalType) return;
    setDiagLoading(true);
    setError(null);
    const topicKeys = TOPICS.map((t) => t.key);
    const goalText = effectiveGoalText;
    try {
      const [questions, weights] = await Promise.all([
        generateDiagnosticQuestions(goalText, grade, topicKeys, goalType, selectedTopics),
        rankTopicsForGoal(goalText, grade, topicKeys),
      ]);
      if (questions && questions.length > 0) {
        setAiQuestions(questions);
        setUsingAi(true);
      }
      if (weights) {
        setTopicWeights(weights);
      }
    } catch {
      // Fall back to static questions
    }
    setDiagLoading(false);
  }

  // Load auth user on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAuthUserId(user.id);
        setAuthEmail(user.email ?? null);
        // Pre-fill name from email if empty
        if (!name && user.email) {
          setName(user.email.split('@')[0]);
        }
      }
    });
  }, []);

  async function finishDiagnostic() {
    if (saving || !grade || !goalType) return;
    setSaving(true);
    setError(null);

    const goalText = effectiveGoalText;

    // Build skills breakdown from topic results
    const skillsBreakdown: Record<string, number> = {};
    for (const [topic, r] of Object.entries(topicResults)) {
      skillsBreakdown[topic] = r.pct;
    }

    const topicMap: Record<string, { correct: number; total: number }> = {};
    for (const q of diagnosticQuestions) {
      if (!topicMap[q.topic]) topicMap[q.topic] = { correct: 0, total: 0 };
      topicMap[q.topic].total += 1;
      if (answers[q.id] === q.correctIndex) topicMap[q.topic].correct += 1;
    }

    // --- 1. Always save to localStorage first (demo fallback) ---
    const localId = genLocalId();
    const localStudent: LocalStudent = {
      id: localId,
      name: name.trim(),
      email: authEmail,
      user_id: authUserId,
      grade,
      subject: 'math',
      goal: goalText,
      goal_type: goalType,
      custom_goal_text: customGoalText.trim() || null,
      selected_topics: selectedTopics.length > 0 ? selectedTopics : null,
      target_score: effectiveTarget,
      score_max: usePercentScale ? 100 : (scoreMax ?? 100),
      score_current: effectiveCurrent,
      score_target: effectiveTarget,
      goal_topic_weights: topicWeights,
      exam_date: examDate || null,
      diagnostic_skills: skillsBreakdown,
      last_readiness: overallPct,
      created_at: new Date().toISOString(),
    };
    const localDiagResults: LocalDiagnosticResult[] = Object.entries(topicMap)
      .filter(([, v]) => v.total > 0)
      .map(([topic, { correct, total }]) => ({
        topic,
        mastery_pct: Math.round((correct / total) * 100),
      }));

    saveLocalData({
      student: localStudent,
      diagnosticResults: localDiagResults,
      progress: [],
    });

    // --- 2. Try Supabase (non-blocking — don't break the demo if it fails) ---
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let currentUser = session?.user;
      if (!currentUser) {
        const { data: { user } } = await supabase.auth.getUser();
        currentUser = user ?? undefined;
      }

      if (currentUser) {
        const { data: student, error: studentErr } = await supabase
          .from('students')
          .insert({
            name: name.trim(),
            email: currentUser.email ?? null,
            user_id: currentUser.id,
            grade,
            subject: 'math',
            goal: goalText,
            goal_type: goalType,
            custom_goal_text: customGoalText.trim() || null,
            selected_topics: selectedTopics.length > 0 ? selectedTopics : null,
            target_score: effectiveTarget,
            score_max: usePercentScale ? 100 : (scoreMax ?? 100),
            score_current: effectiveCurrent,
            score_target: effectiveTarget,
            goal_topic_weights: topicWeights,
            exam_date: examDate || null,
            diagnostic_skills: skillsBreakdown,
            last_readiness: overallPct,
          })
          .select()
          .single();

        if (student && !studentErr) {
          const rows = Object.entries(topicMap)
            .filter(([, v]) => v.total > 0)
            .map(([topic, { correct, total }]) => ({
              student_id: student.id,
              topic,
              mastery_pct: Math.round((correct / total) * 100),
            }));
          await supabase.from('diagnostic_results').insert(rows);

          await supabase.from('diagnostic_sessions').insert({
            student_id: student.id,
            user_id: currentUser.id,
            session_type: 'initial',
            overall_score: overallPct,
            skills_breakdown: skillsBreakdown,
            strengths: diagProfile?.strengths ?? [],
            weaknesses: diagProfile?.weaknesses ?? [],
            recommended_next: diagProfile?.recommendedTopicLabel ?? null,
            readiness_verdict: diagProfile?.readinessVerdict ?? null,
          });

          // Update local data with the real Supabase ID so future loads use it
          saveLocalData({
            student: { ...localStudent, id: student.id, user_id: currentUser.id, email: currentUser.email ?? null },
            diagnosticResults: localDiagResults,
            progress: [],
          });
          onComplete(student.id);
          return;
        }
      }
    } catch {
      // Supabase failed — continue with localStorage data
    }

    // --- 3. Always proceed with local data ---
    onComplete(localId);
  }

  const stepLabels = ['Профиль', 'Цель', goalDef?.needsTopicSelection ? 'Темы' : 'Срок', 'Диагностика'].filter((_, i) => i < 3 || goalDef);
  const visibleSteps = goalDef?.needsTopicSelection
    ? ['Профиль', 'Цель', 'Темы', 'Диагностика']
    : ['Профиль', 'Цель', 'Срок', 'Диагностика'];

  // Use the goal text from the user as the primary goal description
  const userGoalText = customGoalText.trim() || goalDef?.label || 'подготовка';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/40">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/70 border-b border-slate-200/60">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Navigation className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-800 tracking-tight">AI Learning GPS</span>
          </div>
          <button
            onClick={onBack}
            className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft className="w-4 h-4" />
            На главную
          </button>
        </div>
        <div className="max-w-3xl mx-auto px-5 pb-3">
          <div className="flex items-center gap-2">
            {visibleSteps.map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center gap-2 text-xs font-medium transition-colors ${i <= step ? 'text-emerald-700' : 'text-slate-400'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] transition-all ${
                    i < step ? 'bg-emerald-600 text-white'
                    : i === step ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500'
                    : 'bg-slate-100 text-slate-400'
                  }`}>
                    {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className="hidden sm:inline">{label}</span>
                </div>
                {i < visibleSteps.length - 1 && <div className={`h-px flex-1 transition-colors ${i < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8">
        {/* Step 0: Profile */}
        {step === 0 && (
          <div className="animate-[fadeIn_0.3s_ease]">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <GraduationCap className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Давай знакомиться</h2>
              <p className="text-slate-500 mt-2">Расскажи немного о себе — это нужно для построения маршрута</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-sm space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Как тебя зовут?</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Введи имя"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">В каком ты классе?</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      onClick={() => { setGrade(g); setGoalType(null); setSelectedTopics([]); }}
                      className={`py-3 rounded-xl font-semibold text-sm transition-all ${
                        grade === g ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {authEmail && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span className="truncate">Аккаунт: {authEmail}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                disabled={!canStep0}
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all"
              >
                Далее
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Goal selection */}
        {step === 1 && (
          <div className="animate-[fadeIn_0.3s_ease]">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Target className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Что ты хочешь изучить или к чему подготовиться?</h2>
              <p className="text-slate-500 mt-2">Опиши свою цель своими словами — AI создаст персональную диагностику</p>
            </div>

            {/* Free-text goal input — primary */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-5 shadow-sm mb-4">
              <textarea
                value={customGoalText}
                onChange={(e) => setCustomGoalText(e.target.value)}
                placeholder="Например: «У меня контрольная по дробям» или «Хочу подготовиться к ЕНТ по математике» или «Мне нужно понять квадратные уравнения»"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900 resize-none"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['Контрольная по дробям', 'Подготовка к ЕНТ', 'Повторить функции', 'Квадратные уравнения', 'Контрольная по процентам'].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setCustomGoalText(ex)}
                    className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center mb-4">Или выбери готовый тип цели:</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableGoals.map((g) => {
                const Icon = GOAL_ICONS[g.icon] ?? Target;
                const active = goalType === g.type;
                return (
                  <button
                    key={g.type}
                    onClick={() => setGoalType(g.type)}
                    className={`text-left p-5 rounded-2xl border-2 transition-all ${
                      active
                        ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-500/10'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className={`font-bold ${active ? 'text-emerald-700' : 'text-slate-800'}`}>{g.label}</span>
                    </div>
                    <p className="text-sm text-slate-500">{g.description}</p>
                    {g.type === 'ent' && grade && grade < 9 && (
                      <p className="text-xs text-amber-600 mt-2">Доступно с 9 класса</p>
                    )}
                  </button>
                );
              })}
            </div>

            {goalType && (
              <div className="mt-6 bg-white rounded-2xl border border-slate-200/70 p-5 shadow-sm space-y-5">
                {/* Scale type toggle */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Как измерять результат?
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUsePercentScale(true)}
                      className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                        usePercentScale
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      В процентах (0–100%)
                    </button>
                    <button
                      onClick={() => setUsePercentScale(false)}
                      className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${
                        !usePercentScale
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      В баллах
                    </button>
                  </div>
                </div>

                {/* Score fields */}
                {!usePercentScale && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Из скольки баллов?
                    </label>
                    <input
                      type="number"
                      value={scoreMax ?? ''}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setScoreMax(isNaN(v) || v <= 0 ? null : v);
                      }}
                      placeholder="Например: 40"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900 text-lg font-bold"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Текущий результат
                    </label>
                    <input
                      type="number"
                      value={scoreCurrent ?? ''}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        const max = usePercentScale ? 100 : (scoreMax ?? 100);
                        setScoreCurrent(isNaN(v) ? null : Math.max(0, Math.min(max, v)));
                      }}
                      placeholder="Например: 18"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900 text-lg font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Желаемый результат
                    </label>
                    <input
                      type="number"
                      value={scoreTarget ?? ''}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        const max = usePercentScale ? 100 : (scoreMax ?? 100);
                        setScoreTarget(isNaN(v) ? null : Math.max(0, Math.min(max, v)));
                      }}
                      placeholder={`Например: ${metrics?.defaultTarget ?? 85}`}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900 text-lg font-bold"
                    />
                  </div>
                </div>

                <p className="text-xs text-slate-400">
                  {usePercentScale
                    ? `Шкала: 0–100%. Рекомендуемая цель: ${metrics?.defaultTarget ?? 85}%`
                    : `Шкала: из ${scoreMax ?? 100} баллов. Рекомендуемая цель: ${metrics?.defaultTarget ?? 85}`}
                </p>
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setStep(0)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-slate-600 font-semibold hover:bg-slate-100 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад
              </button>
              <button
                disabled={!canStep1}
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all"
              >
                {customGoalText.trim() ? 'Далее' : 'Далее'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Topic selection (for test/revision) OR deadline (for others) */}
        {step === 2 && goalDef?.needsTopicSelection && (
          <div className="animate-[fadeIn_0.3s_ease]">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                {goalType === 'test' ? 'По каким темам контрольная?' : 'Что хочешь повторить?'}
              </h2>
              <p className="text-slate-500 mt-2">Выбери одну или несколько тем — диагностика будет по ним</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {availableTopics.map((t) => {
                const active = selectedTopics.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleTopic(t.key)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-semibold text-sm ${active ? 'text-emerald-700' : 'text-slate-700'}`}>{t.label}</span>
                      {active && <Check className="w-4 h-4 text-emerald-600" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-slate-600 font-semibold hover:bg-slate-100 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад
              </button>
              <button
                disabled={!canStep2}
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition-all"
              >
                {examDate ? 'К диагностике' : 'К сроку'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && !goalDef?.needsTopicSelection && (
          <div className="animate-[fadeIn_0.3s_ease]">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Когда дедлайн?</h2>
              <p className="text-slate-500 mt-2">Дата экзамена или контрольной — поможет построить маршрут по времени</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Clock className="w-4 h-4 text-slate-400" />
                Дата экзамена / дедлайн (необязательно)
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900"
              />
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-slate-600 font-semibold hover:bg-slate-100 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад
              </button>
              <button
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all"
              >
                К диагностике
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Topic selection → deadline (only if needsTopicSelection) */}
        {step === 3 && goalDef?.needsTopicSelection && (
          <div className="animate-[fadeIn_0.3s_ease]">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Когда дедлайн?</h2>
              <p className="text-slate-500 mt-2">Дата контрольной или повторения (необязательно)</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-sm">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Clock className="w-4 h-4 text-slate-400" />
                Дата (необязательно)
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900"
              />
            </div>

            <div className="flex justify-between mt-6">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-slate-600 font-semibold hover:bg-slate-100 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад
              </button>
              <button
                onClick={() => { setStep(4); startDiagnostic(); }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all"
              >
                К диагностике
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 (no topic selection) or Step 4: Diagnostic */}
        {((step === 3 && !goalDef?.needsTopicSelection) || (step === 4 && goalDef?.needsTopicSelection)) && diagLoading && (
          <div className="animate-[fadeIn_0.3s_ease]">
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Готовим диагностику</h2>
              <p className="text-slate-500 mt-2">AI составляет персональные вопросы под твою цель и класс…</p>
              <Loader2 className="w-7 h-7 text-emerald-500 animate-spin mx-auto mt-6" />
            </div>
          </div>
        )}

        {/* Phase: Questions */}
        {((step === 3 && !goalDef?.needsTopicSelection) || (step === 4 && goalDef?.needsTopicSelection)) && !diagLoading && totalQ > 0 && diagPhase === 'questions' && (
          <div className="animate-[fadeIn_0.3s_ease]">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Короткая диагностика</h2>
              <p className="text-slate-500 mt-2">
                {usingAi ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    {totalQ} вопросов под твою цель — определим стартовый уровень
                  </span>
                ) : (
                  <span>{totalQ} вопросов по ключевым темам — определим стартовый уровень</span>
                )}
              </p>
            </div>

            <div className="mb-6">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Вопрос {qIndex + 1} из {totalQ}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-500">
                  {topicLabel(currentQ.topic)}
                </span>
                {'level' in currentQ && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-600">
                    {levelLabel(currentQ.level)}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-5 leading-snug">
                {currentQ.question}
              </h3>
              <div className="space-y-2.5">
                {currentQ.options.map((opt, i) => {
                  const selected = answers[currentQ.id] === i;
                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(currentQ.id, i)}
                      className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${
                        selected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                        selected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-slate-400'
                      }`}>
                        {String.fromCharCode(65 + i)}
                      </div>
                      <span className="text-slate-800">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button
                onClick={() => {
                  const prevStep = goalDef?.needsTopicSelection ? 3 : 2;
                  setQIndex(0);
                  setAnswers({});
                  setStep(prevStep);
                }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-slate-600 font-semibold hover:bg-slate-100 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад
              </button>
              <span className="text-sm text-slate-400 self-center">
                {qIndex < totalQ - 1
                  ? 'Выбери ответ, чтобы продолжить'
                  : 'Выбери ответ — диагностика завершится автоматически'}
              </span>
            </div>
          </div>
        )}

        {/* Phase: Analyzing */}
        {((step === 3 && !goalDef?.needsTopicSelection) || (step === 4 && goalDef?.needsTopicSelection)) && !diagLoading && diagPhase === 'analyzing' && (
          <div className="animate-[fadeIn_0.3s_ease]">
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Анализируем результаты</h2>
              <p className="text-slate-500 mt-2">AI определяет твои сильные стороны, пробелы и оптимальную точку старта…</p>
              <Loader2 className="w-7 h-7 text-emerald-500 animate-spin mx-auto mt-6" />
            </div>
          </div>
        )}

        {/* Phase: Summary */}
        {((step === 3 && !goalDef?.needsTopicSelection) || (step === 4 && goalDef?.needsTopicSelection)) && !diagLoading && diagPhase === 'summary' && (
          <div className="animate-[fadeIn_0.3s_ease]">
            <div className="text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                <Award className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Диагностика завершена</h2>
              <p className="text-slate-500 mt-2">Вот твой стартовый профиль готовности</p>
            </div>

            {/* Overall score */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-sm mb-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-medium text-slate-500">Правильных ответов</div>
                  <div className="text-3xl font-bold text-slate-900 mt-1">{totalCorrect} из {totalQ}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-slate-500">Общий результат</div>
                  <div className="text-3xl font-bold text-emerald-600 mt-1">{overallPct}%</div>
                </div>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>

            {/* Per-topic results */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-sm mb-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Результат по темам</h3>
              <div className="space-y-3">
                {Object.entries(topicResults).map(([topic, r]) => (
                  <div key={topic} className="flex items-center gap-3">
                    <span className="text-sm text-slate-600 w-40 shrink-0">{topicLabel(topic)}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          r.pct >= 70 ? 'bg-emerald-500' : r.pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${r.pct}%` }}
                      />
                    </div>
                    <span className={`text-sm font-semibold w-12 text-right ${
                      r.pct >= 70 ? 'text-emerald-600' : r.pct >= 40 ? 'text-amber-600' : 'text-red-500'
                    }`}>{r.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Profile: strengths / weaknesses / base gaps */}
            {profileLoading && (
              <div className="bg-white rounded-2xl border border-slate-200/70 p-6 shadow-sm mb-5 text-center">
                <Loader2 className="w-5 h-5 text-emerald-500 animate-spin mx-auto" />
                <p className="text-sm text-slate-500 mt-2">AI анализирует твой профиль…</p>
              </div>
            )}

            {diagProfile && (
              <div className="space-y-4 mb-5">
                {/* Strengths */}
                {diagProfile.strengths.length > 0 && (
                  <div className="bg-emerald-50 rounded-2xl border border-emerald-200/70 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-emerald-700">Сильные стороны</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {diagProfile.strengths.map((s, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-lg bg-white text-sm text-emerald-700 font-medium border border-emerald-200">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Weaknesses */}
                {diagProfile.weaknesses.length > 0 && (
                  <div className="bg-amber-50 rounded-2xl border border-amber-200/70 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-semibold text-amber-700">Нужно подтянуть</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {diagProfile.weaknesses.map((w, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-lg bg-white text-sm text-amber-700 font-medium border border-amber-200">
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Base gaps */}
                {diagProfile.baseGaps.length > 0 && (
                  <div className="bg-red-50 rounded-2xl border border-red-200/70 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <h3 className="text-sm font-semibold text-red-600">Возможный базовый пробел</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {diagProfile.baseGaps.map((g, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-lg bg-white text-sm text-red-600 font-medium border border-red-200">
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hurry warning */}
                {diagProfile.hurryWarning && (
                  <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm">
                    <Zap className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Возможно, ты торопишься. Попробуй отвечать внимательнее — скорость не влияет на оценку, но спешка может приводить к ошибкам.</span>
                  </div>
                )}
              </div>
            )}

            {/* Readiness verdict */}
            {diagProfile?.readinessVerdict && (
              <div className={`rounded-2xl p-5 mb-5 border ${
                overallPct >= 70 ? 'bg-emerald-50 border-emerald-200' : overallPct >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
              }`}>
                <p className={`text-sm font-medium ${
                  overallPct >= 70 ? 'text-emerald-700' : overallPct >= 40 ? 'text-amber-700' : 'text-red-600'
                }`}>{diagProfile.readinessVerdict}</p>
              </div>
            )}

            {/* Recommendation */}
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white mb-6 shadow-lg shadow-emerald-600/20">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5" />
                <h3 className="font-bold">Рекомендуемый следующий шаг</h3>
              </div>
              <div className="text-2xl font-bold mb-2">
                {diagProfile?.recommendedTopicLabel ?? topicLabel(Object.entries(topicResults).sort((a, b) => a[1].pct - b[1].pct)[0]?.[0] ?? '')}
              </div>
              <p className="text-sm text-emerald-100">
                {diagProfile?.recommendationReason ?? 'Эта тема сейчас сильнее всего влияет на твой дальнейший маршрут.'}
              </p>
            </div>

            {error && (
              <div className="mt-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-between mt-6">
              <button
                onClick={() => {
                  const prevStep = goalDef?.needsTopicSelection ? 3 : 2;
                  setQIndex(0);
                  setAnswers({});
                  setDiagPhase('questions');
                  setDiagProfile(null);
                  setStep(prevStep);
                }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-slate-600 font-semibold hover:bg-slate-100 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Назад
              </button>
              <button
                onClick={finishDiagnostic}
                disabled={saving}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-60 transition-all shadow-lg shadow-emerald-600/20"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Navigation className="w-5 h-5" />}
                {saving ? 'Строим маршрут…' : 'Построить мой маршрут'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function topicLabel(t: string) {
  const map: Record<string, string> = {
    percentages: 'Проценты',
    fractions: 'Дроби',
    equations: 'Линейные уравнения',
    functions: 'Функции',
    systems_of_equations: 'Системы уравнений',
    quadratic_equations: 'Квадратные уравнения',
    geometry: 'Геометрия',
    probability: 'Теория вероятностей',
    progressions: 'Прогрессии',
    word_problems: 'Текстовые задачи',
    patterns: 'Закономерности',
    logic: 'Логические задачи',
    combinatorics: 'Комбинаторика',
  };
  return map[t] ?? t;
}

function levelLabel(l: number) {
  return ['', 'Базовый', 'Средний', 'Продвинутый'][l] ?? '';
}
