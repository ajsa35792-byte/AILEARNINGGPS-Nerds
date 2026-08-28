import { getMetricsForGoal, type GoalType } from '@/lib/goals';

export type Topic = {
  key: string;
  label: string;
  impact: number;
  time_hours: number;
  parent_key: string | null;
};

export type RouteStep = {
  topic: Topic;
  priorityScore: number;
  confidenceMultiplier: number;
  reason: string;
};

export type RouteResult = {
  nextStep: RouteStep | null;
  upcoming: RouteStep[];
  completed: Topic[];
  allSteps: RouteStep[];
  isRushing: boolean;
  remainingTimeHours: number;
};

/**
 * Deterministic fallback route engine — used when AI route generation is unavailable.
 *
 * priority_score = (impact / time) * masteryGap * confidence_multiplier * goal_multiplier
 *
 * masteryGap: (1 - mastery/100) * 1.5 + 0.25 — low mastery boosts priority significantly,
 *   high mastery (≥70%) reduces it to ~0.7, preventing well-known topics from appearing first.
 *   Topics with no diagnostic data get masteryGap = 1.0 (neutral).
 *
 * confidence_multiplier:
 *   1.2 — topic is a direct dependency of the just-completed topic
 *   1.0 — default
 *   1.5 — "rushing mode": remaining days < total time of unfinished impact>=3 topics
 *
 * Topics with an unfinished parent are excluded from selection (dependency order).
 * Goal weights from AI multiply priority (weight/3, so 5 = 1.67x, 1 = 0.33x).
 */
export function calculateRoute(
  topics: Topic[],
  completedKeys: Set<string>,
  examDate: string | null,
  lastCompletedKey: string | null,
  goalWeights: Record<string, number> | null,
  masteryByTopic?: Record<string, number> | null
): RouteResult {
  const completed = topics.filter((t) => completedKeys.has(t.key));
  const unfinished = topics.filter((t) => !completedKeys.has(t.key));

  let daysRemaining = 0;
  if (examDate) {
    const diff = Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000);
    daysRemaining = Math.max(0, diff);
  }

  const highImpactTime = unfinished
    .filter((t) => t.impact >= 3)
    .reduce((sum, t) => sum + t.time_hours, 0);
  const hoursPerDay = 2;
  const daysNeeded = highImpactTime / hoursPerDay;
  const isRushing = examDate !== null && daysRemaining < daysNeeded && daysRemaining > 0;

  const available = unfinished.filter((t) => {
    if (!t.parent_key) return true;
    return completedKeys.has(t.parent_key);
  });

  const remainingTimeHours = unfinished.reduce((sum, t) => sum + t.time_hours, 0);

  const scored: RouteStep[] = available.map((t) => {
    let multiplier = 1.0;
    let reason = 'Оптимальное соотношение важности и времени.';

    const goalWeight = goalWeights?.[t.key];
    const goalMultiplier = goalWeight ? goalWeight / 3 : 1;

    // Mastery gap: low mastery = high priority, high mastery = low priority
    const mastery = masteryByTopic?.[t.key];
    let masteryGap = 1.0;
    if (mastery !== undefined) {
      masteryGap = (1 - mastery / 100) * 1.5 + 0.25;
      if (mastery >= 70) {
        reason = `Тема освоена на ${mastery}% — revisit позже, если останется время.`;
      } else if (mastery < 40) {
        reason = `По диагностике уровень всего ${mastery}% — серьёзный пробел, высокий приоритет.`;
      } else if (mastery < 60) {
        reason = `По диагностике уровень ${mastery}% — тема требует внимания.`;
      }
    }

    if (isRushing) {
      multiplier = 1.5;
      reason = 'Режим «торопимся»: до дедлайна меньше времени, чем нужно на ключевые темы. Ускоряем приоритеты.';
    } else if (lastCompletedKey && t.parent_key === lastCompletedKey) {
      multiplier = 1.2;
      reason = `Прямое продолжение темы «${topics.find((x) => x.key === lastCompletedKey)?.label ?? ''}» — закрепляем связанный материал.`;
    }

    if (goalWeight && goalWeight >= 4 && !isRushing) {
      reason = `Эта тема особенно важна для твоей цели (оценка ${goalWeight}/5 от AI). ${reason}`;
    }

    const priorityScore = (t.impact / t.time_hours) * masteryGap * multiplier * goalMultiplier;

    return {
      topic: t,
      priorityScore: Math.round(priorityScore * 100) / 100,
      confidenceMultiplier: multiplier,
      reason,
    };
  });

  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  const nextStep = scored.length > 0 ? scored[0] : null;
  const upcoming = scored.slice(1, 4);

  return {
    nextStep,
    upcoming,
    completed,
    allSteps: scored,
    isRushing,
    remainingTimeHours,
  };
}

/**
 * Build a RouteResult from an AI-generated route (array of AiRouteNode).
 * Falls back gracefully if the AI route is incomplete.
 */
export function buildRouteFromAi(
  aiNodes: { key: string; label: string; reason: string; impact: number; time_hours: number; priority: number }[],
  allTopics: Topic[],
  completedKeys: Set<string>
): RouteResult {
  const completed = allTopics.filter((t) => completedKeys.has(t.key));

  const steps: RouteStep[] = aiNodes
    .filter((node) => !completedKeys.has(node.key))
    .map((node) => {
      const topic: Topic = {
        key: node.key,
        label: node.label,
        impact: node.impact,
        time_hours: node.time_hours,
        parent_key: allTopics.find((t) => t.key === node.key)?.parent_key ?? null,
      };
      return {
        topic,
        priorityScore: node.priority,
        confidenceMultiplier: 1.0,
        reason: node.reason,
      };
    })
    .sort((a, b) => a.priorityScore - b.priorityScore);

  const remainingTimeHours = steps.reduce((sum, s) => sum + s.topic.time_hours, 0);

  return {
    nextStep: steps.length > 0 ? steps[0] : null,
    upcoming: steps.slice(1, 4),
    completed,
    allSteps: steps,
    isRushing: false,
    remainingTimeHours,
  };
}

/**
 * Predicted score on a 0-100 percentage scale (mastery-weighted).
 * The caller scales this to the user's custom max via getDisplayMetrics.
 */
export function calculatePredictedScore(
  topics: Topic[],
  completedKeys: Set<string>,
  masteryByTopic: Record<string, number>,
  _goalType: string | null
): number {
  const maxPerTopic = 100 / topics.length;
  const total = topics.reduce((sum, t) => {
    const mastery = completedKeys.has(t.key) ? 100 : (masteryByTopic[t.key] ?? 0);
    return sum + (mastery / 100) * maxPerTopic;
  }, 0);
  return Math.round(total);
}

export type DisplayMetrics = {
  currentLabel: string;
  goalLabel: string;
  current: number;
  goal: number;
  max: number;
  unit: 'points' | 'percent';
};

/**
 * Build display metrics from the student's custom scale.
 * - If scoreMax is provided and != 100, scales the 0-100 predicted score to that max.
 * - If scoreMax is null or 100, shows raw percentage.
 * - scoreTarget overrides targetScore when set.
 * - scoreCurrent (self-reported) overrides the calculated predicted score when set.
 */
export function getDisplayMetrics(
  goalType: string | null,
  predictedScorePct: number,
  targetScore: number | null,
  scoreMax?: number | null,
  scoreCurrent?: number | null,
  scoreTarget?: number | null,
  customGoalText?: string | null
): DisplayMetrics {
  const metrics = getMetricsForGoal((goalType ?? 'school') as GoalType);
  const max = scoreMax ?? metrics.max;
  const isPercent = !scoreMax || scoreMax === 100;

  const current = scoreCurrent != null
    ? scoreCurrent
    : isPercent
      ? predictedScorePct
      : Math.round((predictedScorePct / 100) * max);

  const goal = scoreTarget ?? targetScore ?? metrics.defaultTarget;

  return {
    currentLabel: customGoalText ? 'Текущий результат' : metrics.currentLabel,
    goalLabel: customGoalText ? 'Желаемый результат' : metrics.goalLabel,
    current,
    goal,
    max,
    unit: isPercent ? 'percent' : 'points',
  };
}
