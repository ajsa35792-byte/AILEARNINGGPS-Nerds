import { useState, useEffect, useCallback } from 'react';
import { supabase, type Student } from '@/lib/supabase';
import { loadLocalData, clearLocalData, type LocalStudent } from '@/lib/localStore';
import Landing from '@/components/Landing';
import Onboarding from '@/components/Onboarding';
import RouteScreen from '@/components/RouteScreen';
import ProfileScreen from '@/components/ProfileScreen';
import TeacherDashboard from '@/components/TeacherDashboard';
import { Navigation } from 'lucide-react';

type View =
  | { name: 'loading' }
  | { name: 'landing' }
  | { name: 'onboarding' }
  | { name: 'route'; studentId: string }
  | { name: 'profile'; studentId: string }
  | { name: 'teacher-dashboard' };

export default function App() {
  const [view, setView] = useState<View>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#/teacher-dashboard') {
      return { name: 'teacher-dashboard' };
    }
    return { name: 'loading' };
  });
  const [student, setStudent] = useState<Student | null>(null);

  const loadStudent = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data as Student | null;
  }, []);

  // Convert a LocalStudent to the Student type expected by RouteScreen
  const localToStudent = (ls: LocalStudent): Student => ({
    id: ls.id,
    name: ls.name,
    email: ls.email,
    user_id: ls.user_id,
    grade: ls.grade,
    subject: ls.subject,
    goal: ls.goal,
    goal_type: ls.goal_type,
    custom_goal_text: ls.custom_goal_text,
    selected_topics: ls.selected_topics,
    target_score: ls.target_score,
    score_max: ls.score_max,
    score_current: ls.score_current,
    score_target: ls.score_target,
    goal_topic_weights: ls.goal_topic_weights,
    exam_date: ls.exam_date,
    password: null,
    diagnostic_skills: ls.diagnostic_skills,
    last_readiness: ls.last_readiness,
    created_at: ls.created_at,
  });

  useEffect(() => {
    if (view.name === 'teacher-dashboard') return;

    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        loadStudent(session.user.id).then((s) => {
          if (!mounted) return;
          if (s) {
            setStudent(s);
            setView({ name: 'route', studentId: s.id });
          } else {
            // No student record in Supabase — check localStorage fallback
            const local = loadLocalData();
            if (local && local.student.user_id === session.user!.id) {
              setStudent(localToStudent(local.student));
              setView({ name: 'route', studentId: local.student.id });
            } else {
              setView({ name: 'onboarding' });
            }
          }
        });
      } else {
        // No Supabase session — check localStorage fallback before going to landing
        const local = loadLocalData();
        if (local) {
          setStudent(localToStudent(local.student));
          setView({ name: 'route', studentId: local.student.id });
        } else {
          setView({ name: 'landing' });
        }
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        clearLocalData();
        setStudent(null);
        setView({ name: 'landing' });
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (!session?.user) return;
        loadStudent(session.user.id).then((s) => {
          if (!mounted) return;
          if (s) {
            setStudent(s);
            setView({ name: 'route', studentId: s.id });
          } else {
            const local = loadLocalData();
            if (local && local.student.user_id === session.user!.id) {
              setStudent(localToStudent(local.student));
              setView({ name: 'route', studentId: local.student.id });
            } else {
              setView((prev) => prev.name === 'onboarding' ? prev : { name: 'onboarding' });
            }
          }
        });
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadStudent]);

  function navigate(next: View) {
    if (next.name === 'teacher-dashboard') {
      window.history.replaceState(null, '', '#/teacher-dashboard');
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
    setView(next);
  }

  async function handleSignOut() {
    clearLocalData();
    await supabase.auth.signOut();
    setStudent(null);
    navigate({ name: 'landing' });
  }

  if (view.name === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2.5 text-emerald-600">
          <Navigation className="w-6 h-6 animate-pulse" />
          <span className="font-semibold">AI Learning GPS</span>
        </div>
      </div>
    );
  }

  if (view.name === 'teacher-dashboard') {
    return <TeacherDashboard onBack={() => navigate({ name: 'landing' })} />;
  }

  if (view.name === 'landing') {
    return (
      <Landing
        onStart={() => navigate({ name: 'onboarding' })}
        onTeacher={() => navigate({ name: 'teacher-dashboard' })}
      />
    );
  }

  if (view.name === 'onboarding') {
    return (
      <Onboarding
        onComplete={(studentId) => navigate({ name: 'route', studentId })}
        onBack={() => navigate({ name: 'landing' })}
      />
    );
  }

  if (view.name === 'route') {
    return (
      <RouteScreen
        studentId={view.studentId}
        onBack={handleSignOut}
        onProfile={() => navigate({ name: 'profile', studentId: view.studentId })}
      />
    );
  }

  if (view.name === 'profile') {
    return (
      <ProfileScreen
        studentId={view.studentId}
        onBack={() => navigate({ name: 'route', studentId: view.studentId })}
      />
    );
  }

  return null;
}
