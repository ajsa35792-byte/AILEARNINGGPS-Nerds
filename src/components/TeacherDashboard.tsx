import { useEffect, useState } from 'react';
import { supabase, type Student, type DiagnosticResult, type StudentProgress, type TopicRow } from '@/lib/supabase';
import { calculatePredictedScore, getDisplayMetrics } from '@/lib/routeEngine';
import { getMetricsForGoal, type GoalType } from '@/lib/goals';
import { Navigation, ArrowLeft, Users, Search, TrendingUp, Target, Clock, AlertTriangle, CheckCircle2, GraduationCap, MapPin, ChevronRight } from 'lucide-react';

type Props = { onBack: () => void };

type StudentOverview = {
  student: Student;
  diagnosticScore: number;
  currentTopic: string | null;
  predictedScore: number;
  targetScore: number;
  completedCount: number;
  totalTopics: number;
  goalType: string;
};

const GOAL_LABELS_RU: Record<string, string> = {
  ent: 'ЕНТ',
  olympiad: 'Олимпиада',
  test: 'Контрольная',
  revision: 'Повторение',
  school: 'Школьная программа',
};

export default function TeacherDashboard({ onBack }: Props) {
  const [overviews, setOverviews] = useState<StudentOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [s, t, r, p] = await Promise.all([
        supabase.from('students').select('*').order('created_at', { ascending: false }),
        supabase.from('topics').select('*').eq('subject', 'math').order('display_order'),
        supabase.from('diagnostic_results').select('*'),
        supabase.from('student_progress').select('*'),
      ]);

      const students = (s.data ?? []) as Student[];
      const topics = (t.data ?? []) as TopicRow[];
      const results = (r.data ?? []) as DiagnosticResult[];
      const progress = (p.data ?? []) as StudentProgress[];

      const topicData = topics.map((t) => ({
        key: t.key,
        label: t.label,
        impact: t.impact,
        time_hours: Number(t.time_hours),
        parent_key: t.parent_key,
      }));

      const overviews: StudentOverview[] = students.map((student) => {
        const studentResults = results.filter((r) => r.student_id === student.id);
        const studentProgress = progress.filter((p) => p.student_id === student.id);
        const completedKeys = new Set(studentProgress.filter((p) => p.completed).map((p) => p.topic_key));

        const masteryByTopic: Record<string, number> = {};
        for (const r of studentResults) masteryByTopic[r.topic] = Number(r.mastery_pct);

        const goalType = student.goal_type ?? 'school';
        const predictedScore = calculatePredictedScore(topicData, completedKeys, masteryByTopic, goalType);
        const targetScore = student.target_score ?? getMetricsForGoal(goalType as GoalType).defaultTarget;

        const diagnosticScore = studentResults.length > 0
          ? Math.round(studentResults.reduce((a, b) => a + Number(b.mastery_pct), 0) / studentResults.length)
          : 0;

        const lastCompleted = [...studentProgress]
          .filter((p) => p.completed && p.completed_at)
          .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0];

        const currentTopic = lastCompleted
          ? topicData.find((t) => t.key === lastCompleted.topic_key)?.label ?? null
          : topicData.length > 0
          ? topicData[0].label
          : null;

        return {
          student,
          diagnosticScore,
          currentTopic,
          predictedScore,
          targetScore,
          completedCount: completedKeys.size,
          totalTopics: topics.length,
          goalType,
        };
      });

      setOverviews(overviews);
      setLoading(false);
    })();
  }, []);

  const filtered = overviews.filter(
    (o) =>
      o.student.name.toLowerCase().includes(query.toLowerCase()) ||
      String(o.student.grade).includes(query) ||
      GOAL_LABELS_RU[o.goalType]?.toLowerCase().includes(query.toLowerCase())
  );

  const selected = overviews.find((o) => o.student.id === selectedId) ?? null;
  const selectedResults = overviews.find((o) => o.student.id === selectedId);

  // Summary stats
  const totalStudents = overviews.length;
  const avgProgress = totalStudents > 0
    ? Math.round(overviews.reduce((sum, o) => sum + (o.predictedScore / o.targetScore) * 100, 0) / totalStudents)
    : 0;
  const fallingBehind = overviews.filter((o) => (o.predictedScore / o.targetScore) * 100 < 50).length;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950 pointer-events-none" />
      <div className="fixed inset-0 opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(6,182,212,0.15), transparent 60%)' }} />

      <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-950/60 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold tracking-tight">Панель учителя</span>
          </div>
          <button
            onClick={onBack}
            className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-white/5"
          >
            <ArrowLeft className="w-4 h-4" />
            На главную
          </button>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-5 py-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryCard icon={Users} label="Всего учеников" value={`${totalStudents}`} color="cyan" />
          <SummaryCard icon={TrendingUp} label="Средний прогресс" value={`${avgProgress}%`} color="emerald" />
          <SummaryCard icon={AlertTriangle} label="Отстают" value={`${fallingBehind}`} color="amber" />
          <SummaryCard icon={Target} label="Активных целей" value={`${overviews.filter((o) => o.student.exam_date).length}`} color="violet" />
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-pulse text-cyan-400 flex items-center gap-2 justify-center">
              <Navigation className="w-5 h-5 animate-spin" />
              Загружаем данные учеников…
            </div>
          </div>
        ) : totalStudents === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400">Пока нет учеников — они появятся здесь после прохождения онбординга</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Student list */}
            <div className="lg:col-span-3">
              {/* Search */}
              <div className="relative mb-4">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по имени, классу или цели"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 outline-none transition-all text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2.5">
                {filtered.map((o) => {
                  const displayMetrics = getDisplayMetrics(o.goalType, o.predictedScore, o.targetScore);
                  const progressPct = Math.round((o.predictedScore / o.targetScore) * 100);
                  const isSelected = selectedId === o.student.id;
                  return (
                    <button
                      key={o.student.id}
                      onClick={() => setSelectedId(o.student.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        isSelected
                          ? 'border-cyan-400/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
                              {o.student.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-white truncate">{o.student.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 ml-10">
                            <span className="flex items-center gap-1">
                              <GraduationCap className="w-3 h-3" />
                              {o.student.grade} кл.
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-300">
                              {GOAL_LABELS_RU[o.goalType] ?? o.student.goal}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-slate-500">Диагностика</div>
                          <div className={`font-bold ${o.diagnosticScore >= 60 ? 'text-emerald-400' : o.diagnosticScore >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {o.diagnosticScore}%
                          </div>
                        </div>
                      </div>

                      {/* Current topic */}
                      {o.currentTopic && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2.5 ml-10">
                          <MapPin className="w-3 h-3 text-cyan-400" />
                          <span>Текущая тема: <span className="text-slate-300">{o.currentTopic}</span></span>
                        </div>
                      )}

                      {/* Progress bar */}
                      <div className="ml-10">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-500">{displayMetrics.currentLabel}</span>
                          <span className={`font-mono ${progressPct >= 75 ? 'text-emerald-400' : progressPct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {displayMetrics.current}/{displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''} → {displayMetrics.goal}
                          </span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${progressBarColor(progressPct)}`}
                            style={{ width: `${Math.min(100, progressPct)}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-8">Ничего не найдено</p>
                )}
              </div>
            </div>

            {/* Detail panel */}
            <div className="lg:col-span-2">
              {selected && selectedResults ? (
                <StudentDetail overview={selected} />
              ) : (
                <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-slate-500 sticky top-24">
                  <Users className="w-10 h-10 mx-auto mb-3 text-slate-700" />
                  Выбери ученика слева, чтобы увидеть подробности
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StudentDetail({ overview }: { overview: StudentOverview }) {
  const { student, diagnosticScore, currentTopic, predictedScore, targetScore, completedCount, totalTopics, goalType } = overview;
  const displayMetrics = getDisplayMetrics(goalType, predictedScore, targetScore);
  const progressPct = Math.round((predictedScore / targetScore) * 100);
  const daysRemaining = student.exam_date
    ? Math.max(0, Math.ceil((new Date(student.exam_date).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-5 sticky top-24">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white font-bold text-lg shrink-0">
          {student.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-white text-lg truncate">{student.name}</h3>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            <span>{student.grade} класс</span>
            <span className="text-slate-600">•</span>
            <span>{GOAL_LABELS_RU[goalType] ?? student.goal}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <DetailField icon={Target} label="Диагностика" value={`${diagnosticScore}%`} />
        <DetailField icon={CheckCircle2} label="Пройдено тем" value={`${completedCount}/${totalTopics}`} />
        <DetailField
          icon={TrendingUp}
          label={displayMetrics.currentLabel}
          value={`${displayMetrics.current}/${displayMetrics.max}${displayMetrics.unit === 'percent' ? '%' : ''}`}
        />
        <DetailField
          icon={Clock}
          label="Дней до дедлайна"
          value={student.exam_date ? `${daysRemaining}` : '—'}
        />
      </div>

      {/* Overall progress */}
      <div className="mb-5">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-slate-400">Общий прогресс к цели</span>
          <span className={`font-mono font-bold ${progressPct >= 75 ? 'text-emerald-400' : progressPct >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
            {progressPct}%
          </span>
        </div>
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${progressBarColor(progressPct)}`}
            style={{ width: `${Math.min(100, progressPct)}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1.5">
          <span>{displayMetrics.current}/{displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''}</span>
          <span>Цель: {displayMetrics.goal}/{displayMetrics.max}{displayMetrics.unit === 'percent' ? '%' : ''}</span>
        </div>
      </div>

      {currentTopic && (
        <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/20 p-3.5 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-cyan-300">Текущая тема на карте</span>
          </div>
          <p className="text-sm text-white font-medium">{currentTopic}</p>
        </div>
      )}

      {student.exam_date && (
        <div className="rounded-xl bg-white/5 p-3.5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>Дата экзамена: {new Date(student.exam_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      )}

      {progressPct < 50 && (
        <div className="mt-4 flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Ученик отстаёт от цели — прогресс ниже 50%. Рекомендуется дополнительное внимание.</span>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: string; color: 'cyan' | 'emerald' | 'amber' | 'violet' }) {
  const colors = {
    cyan: 'text-cyan-400 bg-cyan-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
  };
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2.5 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-xs text-slate-400 font-medium">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function DetailField({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  );
}

function progressBarColor(pct: number) {
  if (pct >= 75) return 'bg-gradient-to-r from-emerald-400 to-emerald-500';
  if (pct >= 50) return 'bg-gradient-to-r from-amber-400 to-orange-500';
  return 'bg-gradient-to-r from-rose-400 to-rose-500';
}
