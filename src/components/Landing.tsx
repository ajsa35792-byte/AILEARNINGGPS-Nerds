import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Navigation, GraduationCap, Map, Route, TrendingUp, Sparkles, ArrowRight, Users, Lock, X, Loader2, Mail, UserPlus } from 'lucide-react';

type Props = {
  onStart: () => void;
  onTeacher: () => void;
};

export default function Landing({ onStart, onTeacher }: Props) {
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/70 border-b border-slate-200/60">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Navigation className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-800 text-lg tracking-tight">AI Learning GPS</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onTeacher}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-slate-100"
            >
              <Users className="w-4 h-4" />
              Учителю
            </button>
            <button
              onClick={() => { setAuthMode('signin'); setShowAuth(true); }}
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-slate-100"
            >
              <Lock className="w-4 h-4" />
              Войти
            </button>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          Персональный маршрут обучения для школьников Казахстана
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 tracking-tight leading-[1.1] max-w-3xl mx-auto">
          Найди свой оптимальный маршрут к результату —{' '}
          <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            как GPS, но для учёбы
          </span>
        </h1>
        <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Платформа для школьников из любой школы Казахстана. Строит персональный
          маршрут подготовки к экзамену или олимпиаде и постоянно пересчитывает
          его под твой темп.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onStart}
            className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 transition-all"
          >
            Начать обучение
            <ArrowRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <button
            onClick={() => { setAuthMode('signin'); setShowAuth(true); }}
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white text-slate-700 font-semibold border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
          >
            <Lock className="w-5 h-5" />
            Войти в аккаунт
          </button>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 pb-20 grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          {
            icon: Route,
            title: 'Персональный маршрут',
            desc: 'Алгоритм строит путь подготовки на основе диагностики и твоей цели — ЕНТ, олимпиада или контрольная.',
            color: 'emerald',
          },
          {
            icon: TrendingUp,
            title: 'Адаптируется под темп',
            desc: 'Платформа пересчитывает маршрут по мере прогресса, усиливая слабые темы и ускоряя сильные.',
            color: 'teal',
          },
          {
            icon: Map,
            title: 'Доступно из любого региона',
            desc: 'Учись из любой школы Казахстана — нужен только интернет. Качественное образование без границ.',
            color: 'sky',
          },
        ].map((f) => (
          <div
            key={f.title}
            className="group p-6 rounded-2xl bg-white border border-slate-200/70 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50 transition-all"
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-${f.color}-50 text-${f.color}-600 group-hover:scale-110 transition-transform`}
            >
              <f.icon className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-slate-900 text-lg mb-2">{f.title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-slate-200/60 bg-white/50">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <GraduationCap className="w-4 h-4" />
            <span>AI Learning GPS — образование без границ</span>
          </div>
          <span className="text-xs text-slate-400">© 2026 AI Learning GPS</span>
        </div>
      </footer>

      {showAuth && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuth(false)}
          onSwitchMode={(m) => setAuthMode(m)}
          onStart={onStart}
        />
      )}
    </div>
  );
}

function AuthModal({
  mode,
  onClose,
  onSwitchMode,
  onStart,
}: {
  mode: 'signin' | 'signup';
  onClose: () => void;
  onSwitchMode: (m: 'signin' | 'signup') => void;
  onStart: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (signUpError) throw new Error(signUpError.message);
        // If signUp returned a session, user is authenticated — proceed
        if (signUpData.session) {
          onClose();
          onStart();
          return;
        }
        // No session returned — email confirmation may be required.
        // Try signing in immediately (email confirmation is OFF in this project).
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw new Error(signInError.message);
        if (signInData.session) {
          onClose();
          onStart();
          return;
        }
        // If still no session, show a message
        throw new Error('Не удалось создать сессию. Попробуйте войти.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw new Error(signInError.message);
        onClose();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Произошла ошибка';
      if (msg.includes('Invalid login credentials')) {
        setError('Неверный email или пароль');
      } else if (msg.includes('already registered') || msg.includes('already been registered')) {
        setError('Аккаунт с этим email уже существует. Войдите.');
      } else if (msg.includes('Password should be at least')) {
        setError('Пароль должен быть не короче 6 символов');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-[fadeIn_0.2s_ease]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              {mode === 'signup' ? <UserPlus className="w-4.5 h-4.5 text-white" /> : <Lock className="w-4.5 h-4.5 text-white" />}
            </div>
            <h2 className="font-bold text-slate-900 text-lg">
              {mode === 'signup' ? 'Регистрация' : 'Вход в аккаунт'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@mail.ru"
                autoFocus
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all text-slate-900"
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-emerald-600/20 transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'signup' ? <UserPlus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {loading ? 'Подождите…' : mode === 'signup' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-4">
          {mode === 'signin' ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
          <button
            onClick={() => { onSwitchMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
            className="text-emerald-600 font-medium hover:text-emerald-700"
          >
            {mode === 'signin' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>
      </div>
    </div>
  );
}
