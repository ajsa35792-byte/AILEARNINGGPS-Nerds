import { useState, useEffect } from 'react';
import { EXERCISES, type Exercise } from '@/lib/exercises';
import { supabase, type DiagnosticResult } from '@/lib/supabase';
import { analyzeError, explainTopic } from '@/lib/ai';
import { Navigation, ArrowLeft, ArrowRight, Check, X, Lightbulb, Trophy, TrendingUp, RotateCw, Compass, AlertTriangle, BookOpen, Sparkles, GraduationCap } from 'lucide-react';

type Props = {
  studentId: string;
  topicKey: string;
  grade: number;
  onBack: () => void;
  onComplete: (result: TopicResult) => void;
};

export type TopicResult = {
  topicKey: string;
  correctCount: number;
  totalCount: number;
  oldMastery: number;
  newMastery: number;
  oldScore: number;
  newScore: number;
};

export default function TopicPlayer({ studentId, topicKey, grade, onBack, onComplete }: Props) {
  const topicData = EXERCISES[topicKey];
  const [phase, setPhase] = useState<'loading' | 'explanation' | 'quiz' | 'results' | 'recalculating'>('loading');
  const [oldMastery, setOldMastery] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, number>>({}); // questionId -> wrong attempts
  const [answers, setAnswers] = useState<Record<string, 'correct' | 'wrong'>>({});
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'correct' | 'wrong' | 'hint' | 'solution'; text: string } | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [oldScore, setOldScore] = useState(0);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explanationLoading, setExplanationLoading] = useState(false);

  useEffect(() => {
    (async () => {
      // Load current mastery
      const { data } = await supabase
        .from('diagnostic_results')
        .select('*')
        .eq('student_id', studentId)
        .eq('topic', topicKey)
        .maybeSingle();
      const m = data ? Number((data as DiagnosticResult).mastery_pct) : 0;
      setOldMastery(m);

      // Load current predicted score
      const { data: allResults } = await supabase
        .from('diagnostic_results')
        .select('*')
        .eq('student_id', studentId);
      const { data: topics } = await supabase.from('topics').select('*').order('display_order');
      const { data: progress } = await supabase.from('student_progress').select('*').eq('student_id', studentId);
      const completedKeys = new Set((progress ?? []).filter((p) => p.completed).map((p) => p.topic_key));
      const masteryMap: Record<string, number> = {};
      for (const r of allResults ?? []) masteryMap[r.topic] = Number(r.mastery_pct);
      const maxPerTopic = 100 / (topics?.length ?? 10);
      const score = (topics ?? []).reduce((sum, t) => {
        const mastery = completedKeys.has(t.key) ? 100 : (masteryMap[t.key] ?? 0);
        return sum + (mastery / 100) * maxPerTopic;
      }, 0);
      setOldScore(Math.round(score));
      setPhase('explanation');

      // Fetch AI explanation for the topic
      if (topicData) {
        setExplanationLoading(true);
        setExplanation(null);
        explainTopic(topicData.topicLabel, topicKey, grade).then((result) => {
          setExplanation(result.text);
          setExplanationLoading(false);
        });
      }
    })();
  }, [studentId, topicKey]);

  if (!topicData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Тема не найдена</p>
          <button onClick={onBack} className="px-5 py-2.5 rounded-xl bg-cyan-500 text-white font-semibold">Назад</button>
        </div>
      </div>
    );
  }

  const exercises = topicData.exercises;
  const currentQ = exercises[qIndex];
  const totalQ = exercises.length;
  const progress = ((qIndex) / totalQ) * 100;

  function checkAnswer() {
    const q = currentQ;
    let isCorrect = false;

    if (q.type === 'choice') {
      isCorrect = selectedOption === q.correctIndex;
    } else {
      const normalized = inputValue.trim().toLowerCase().replace(/\s/g, '');
      const correct = (q.correctAnswer ?? '').toLowerCase().replace(/\s/g, '');
      const alt = (q as Exercise & { correctAnswerAlt?: string[] }).correctAnswerAlt;
      isCorrect = normalized === correct || (alt ? alt.some((a) => a.toLowerCase().replace(/\s/g, '') === normalized) : false);
    }

    const wrongCount = attempts[q.id] ?? 0;

    if (isCorrect) {
      setFeedback({ type: 'correct', text: q.correctComment });
      setAnswers((prev) => ({ ...prev, [q.id]: 'correct' }));
      if (!answers[q.id]) setCorrectCount((c) => c + 1);
    } else {
      const newWrongCount = wrongCount + 1;
      setAttempts((prev) => ({ ...prev, [q.id]: newWrongCount }));

      if (newWrongCount >= 2) {
        setFeedback({ type: 'solution', text: q.solution });
        setAiAnalysis(null);
      } else {
        setFeedback({ type: 'hint', text: q.hint });
        // Call AI for error analysis
        setAiLoading(true);
        setAiAnalysis(null);
        const studentAnswerText = q.type === 'choice'
          ? (q.options?.[selectedOption ?? -1] ?? '—')
          : inputValue;
        const correctAnswerText = q.type === 'choice'
          ? (q.options?.[q.correctIndex ?? -1] ?? '—')
          : (q.correctAnswer ?? '—');
        analyzeError(q.question, studentAnswerText, correctAnswerText).then((result) => {
          setAiAnalysis(result.text);
          setAiLoading(false);
        });
      }
      setAnswers((prev) => ({ ...prev, [q.id]: 'wrong' }));
    }
  }

  function nextQuestion() {
    if (qIndex < totalQ - 1) {
      setQIndex(qIndex + 1);
      setSelectedOption(null);
      setInputValue('');
      setFeedback(null);
      setAiAnalysis(null);
      setAiLoading(false);
    } else {
      finishTopic();
    }
  }

  async function finishTopic() {
    const newMastery = Math.round((correctCount / totalQ) * 100);

    // Upsert mastery in diagnostic_results
    const { data: existing } = await supabase
      .from('diagnostic_results')
      .select('id')
      .eq('student_id', studentId)
      .eq('topic', topicKey)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('diagnostic_results')
        .update({ mastery_pct: newMastery })
        .eq('id', existing.id);
    } else {
      await supabase.from('diagnostic_results').insert({
        student_id: studentId,
        topic: topicKey,
        mastery_pct: newMastery,
      });
    }

    // Mark topic as completed in student_progress
    const { data: prog } = await supabase
      .from('student_progress')
      .select('id')
      .eq('student_id', studentId)
      .eq('topic_key', topicKey)
      .maybeSingle();

    if (prog) {
      await supabase
        .from('student_progress')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', prog.id);
    } else {
      await supabase.from('student_progress').insert({
        student_id: studentId,
        topic_key: topicKey,
        completed: true,
        completed_at: new Date().toISOString(),
      });
    }

    // Calculate new predicted score
    const { data: allResults } = await supabase
      .from('diagnostic_results')
      .select('*')
      .eq('student_id', studentId);
    const { data: topics } = await supabase.from('topics').select('*').order('display_order');
    const { data: progress } = await supabase.from('student_progress').select('*').eq('student_id', studentId);
    const completedKeys = new Set((progress ?? []).filter((p) => p.completed).map((p) => p.topic_key));
    const masteryMap: Record<string, number> = {};
    for (const r of allResults ?? []) masteryMap[r.topic] = Number(r.mastery_pct);
    const maxPerTopic = 100 / (topics?.length ?? 10);
    const newScore = Math.round(
      (topics ?? []).reduce((sum, t) => {
        const mastery = completedKeys.has(t.key) ? 100 : (masteryMap[t.key] ?? 0);
        return sum + (mastery / 100) * maxPerTopic;
      }, 0)
    );

    setPhase('results');
    // Store result for the onComplete callback when user clicks "Обновить маршрут"
    setResultData({
      topicKey,
      correctCount,
      totalCount: totalQ,
      oldMastery,
      newMastery,
      oldScore,
      newScore,
    });
  }

  const [resultData, setResultData] = useState<TopicResult | null>(null);

  function handleRecalculate() {
    if (!resultData) return;
    setPhase('recalculating');
    setTimeout(() => {
      onComplete(resultData);
    }, 2800);
  }

  // ---- LOADING ----
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="animate-pulse text-cyan-400 flex items-center gap-2">
          <RotateCw className="w-5 h-5 animate-spin" />
          Загружаем…
        </div>
      </div>
    );
  }

  // ---- EXPLANATION ----
  if (phase === 'explanation' && topicData) {
    return (
      <div className="min-h-screen bg-slate-950 text-white relative">
        <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950 pointer-events-none" />
        <div className="fixed inset-0 opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 20%, rgba(6,182,212,0.12), transparent 60%)' }} />

        <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-950/60 border-b border-white/5">
          <div className="max-w-2xl mx-auto px-5 h-16 flex items-center justify-between">
            <button
              onClick={onBack}
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              К маршруту
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold tracking-tight text-sm">{topicData.topicLabel}</span>
            </div>
          </div>
        </header>

        <main className="relative max-w-2xl mx-auto px-5 py-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-400/30 flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">{topicData.topicLabel}</h1>
            <p className="text-slate-400 text-sm mt-1">Объяснение темы для {grade} класса</p>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-6">
            <div className="flex items-center gap-1.5 mb-4">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold text-violet-400">Объяснение</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-medium flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" />
                Powered by AI
              </span>
            </div>
            {explanationLoading ? (
              <div className="flex items-center gap-2.5 text-sm text-slate-400 py-4">
                <RotateCw className="w-4 h-4 animate-spin" />
                Готовим объяснение…
              </div>
            ) : explanation ? (
              <p className="text-base text-slate-200 leading-relaxed">{explanation}</p>
            ) : (
              <p className="text-base text-slate-200 leading-relaxed">Загрузка…</p>
            )}
          </div>

          <button
            onClick={() => setPhase('quiz')}
            disabled={explanationLoading}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
          >
            <BookOpen className="w-5 h-5" />
            Понятно, к заданиям
          </button>
        </main>
      </div>
    );
  }

  // ---- RECALCULATING ----
  if (phase === 'recalculating') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white relative overflow-hidden">
        <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950 pointer-events-none" />
        <div className="fixed inset-0 opacity-40 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(6,182,212,0.2), transparent 50%)' }} />
        <div className="relative text-center">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-cyan-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Compass className="w-10 h-10 text-cyan-400 animate-pulse" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Recalculating route…</h2>
          <p className="text-slate-400 text-sm">Ищем самый эффективный следующий шаг</p>
        </div>
      </div>
    );
  }

  // ---- RESULTS ----
  if (phase === 'results' && resultData) {
    const passed = resultData.newMastery >= 60;
    const improvement = resultData.newScore - resultData.oldScore;
    return (
      <div className="min-h-screen bg-slate-950 text-white relative">
        <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950 pointer-events-none" />
        <div className="fixed inset-0 opacity-30 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(6,182,212,0.15), transparent 60%)' }} />

        <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-950/60 border-b border-white/5">
          <div className="max-w-2xl mx-auto px-5 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold tracking-tight">Результат темы</span>
            </div>
          </div>
        </header>

        <main className="relative max-w-2xl mx-auto px-5 py-8">
          <div className="text-center mb-6">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${passed ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
              <Trophy className={`w-8 h-8 ${passed ? 'text-emerald-400' : 'text-amber-400'}`} />
            </div>
            <h1 className="text-2xl font-bold text-white">{topicData.topicLabel}</h1>
            <p className="text-slate-400 mt-1">Тема завершена</p>
          </div>

          {/* Score */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-4 text-center">
            <div className="text-sm text-slate-400 mb-2">Результат</div>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-5xl font-bold text-white">{resultData.correctCount}</span>
              <span className="text-2xl text-slate-500">/ {resultData.totalCount}</span>
            </div>
            <div className="text-sm text-slate-400 mt-1">правильных ответов</div>
          </div>

          {/* Mastery change */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-semibold text-slate-300">Mastery</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-500">Было: {resultData.oldMastery}%</span>
              <ArrowRight className="w-4 h-4 text-slate-600" />
              <span className="text-sm text-slate-500">Стало: {resultData.newMastery}%</span>
            </div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-1000"
                style={{ width: `${resultData.newMastery}%` }}
              />
            </div>
          </div>

          {/* Score projection */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold text-slate-300">Прогноз результата</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">Было</div>
                <div className="text-2xl font-bold text-slate-400">{resultData.oldScore}</div>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-600" />
              <div className="text-center">
                <div className="text-xs text-slate-500 mb-1">Стало</div>
                <div className="text-2xl font-bold text-white">{resultData.newScore}</div>
              </div>
              <div className="text-center pl-4 border-l border-white/10 ml-2">
                <div className="text-xs text-slate-500 mb-1">Прирост</div>
                <div className={`text-2xl font-bold ${improvement > 0 ? 'text-emerald-400' : improvement < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                  {improvement > 0 ? '+' : ''}{improvement}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-2">Estimated improvement: {improvement > 0 ? '+' : ''}{improvement} баллов</div>
          </div>

          {/* Low score warning */}
          {!passed && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 mb-6 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-300 text-sm mb-1">Маршрут скорректирован</div>
                <p className="text-sm text-amber-200/80">
                  Результат ниже 60% — рекомендуем повторить тему-родитель перед продолжением.
                  Она будет вставлена в начало очереди.
                </p>
              </div>
            </div>
          )}

          {/* Recalculate button */}
          <button
            onClick={handleRecalculate}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            <Compass className="w-5 h-5" />
            Обновить маршрут
          </button>
        </main>
      </div>
    );
  }

  // ---- QUIZ ----
  const wrongCount = attempts[currentQ.id] ?? 0;
  const canSubmit =
    currentQ.type === 'choice' ? selectedOption !== null : inputValue.trim().length > 0;
  const showNext = feedback !== null;

  return (
    <div className="min-h-screen bg-slate-950 text-white relative">
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950 via-indigo-950/60 to-slate-950 pointer-events-none" />

      <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-950/60 border-b border-white/5">
        <div className="max-w-2xl mx-auto px-5 h-16 flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-sm font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            К маршруту
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold tracking-tight text-sm">{topicData.topicLabel}</span>
          </div>
        </div>
      </header>

      <main className="relative max-w-2xl mx-auto px-5 py-6">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>Задание {qIndex + 1} из {totalQ}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Question card */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300">
              {['Базовый', 'Средний', 'Продвинутый'][currentQ.level - 1]}
            </span>
            {wrongCount > 0 && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300">
                Попытка {wrongCount + 1}
              </span>
            )}
          </div>

          <h3 className="text-lg font-semibold text-white mb-5 leading-snug">{currentQ.question}</h3>

          {currentQ.type === 'choice' ? (
            <div className="space-y-2.5">
              {currentQ.options!.map((opt, i) => {
                const selected = selectedOption === i;
                const showCorrect = feedback && i === currentQ.correctIndex;
                const showWrong = feedback && selected && i !== currentQ.correctIndex;
                return (
                  <button
                    key={i}
                    onClick={() => !showNext && setSelectedOption(i)}
                    disabled={showNext}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${
                      showCorrect
                        ? 'border-emerald-400 bg-emerald-500/15'
                        : showWrong
                        ? 'border-rose-400 bg-rose-500/15'
                        : selected
                        ? 'border-cyan-400 bg-cyan-500/10'
                        : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                        showCorrect
                          ? 'border-emerald-400 bg-emerald-400 text-emerald-950'
                          : showWrong
                          ? 'border-rose-400 bg-rose-400 text-rose-950'
                          : selected
                          ? 'border-cyan-400 bg-cyan-400 text-cyan-950'
                          : 'border-white/20 text-slate-400'
                      }`}
                    >
                      {String.fromCharCode(65 + i)}
                    </div>
                    <span className="text-slate-100">{opt}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && canSubmit && !showNext && checkAnswer()}
                disabled={showNext}
                placeholder="Введите ответ"
                className="w-full px-4 py-3.5 rounded-xl border-2 border-white/10 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 outline-none transition-all bg-slate-900/50 text-white text-lg"
              />
            </div>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`rounded-2xl border p-4 mb-4 animate-[fadeIn_0.3s_ease] ${
            feedback.type === 'correct'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : feedback.type === 'hint'
              ? 'bg-amber-500/10 border-amber-500/30'
              : feedback.type === 'solution'
              ? 'bg-rose-500/10 border-rose-500/30'
              : 'bg-rose-500/10 border-rose-500/30'
          }`}>
            <div className="flex items-start gap-3">
              {feedback.type === 'correct' ? (
                <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : feedback.type === 'hint' ? (
                <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <X className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className={`font-semibold text-sm mb-1 ${
                  feedback.type === 'correct' ? 'text-emerald-300' : feedback.type === 'hint' ? 'text-amber-300' : 'text-rose-300'
                }`}>
                  {feedback.type === 'correct' ? '✅ Верно' : feedback.type === 'hint' ? '❌ Попробуй ещё раз' : '❌ Полное решение'}
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{feedback.text}</p>
              </div>
            </div>

            {/* AI error analysis — shown on first wrong attempt */}
            {feedback.type === 'hint' && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs font-semibold text-violet-400">Анализ ошибки</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 font-medium">Powered by AI</span>
                </div>
                {aiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    Анализируем ошибку…
                  </div>
                ) : aiAnalysis ? (
                  <p className="text-sm text-slate-300 leading-relaxed">{aiAnalysis}</p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3">
          {!showNext ? (
            <button
              onClick={checkAnswer}
              disabled={!canSubmit}
              className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Проверить
            </button>
          ) : (
            <button
              onClick={nextQuestion}
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold transition-all flex items-center gap-2"
            >
              {qIndex < totalQ - 1 ? 'Далее' : 'Завершить'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
