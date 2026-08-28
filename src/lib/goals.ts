export type GoalType = 'ent' | 'olympiad' | 'test' | 'revision' | 'school' | 'custom';

export type GradeBand = '7-8' | '9-10' | '11-12';

export type MetricsConfig = {
  currentLabel: string;
  goalLabel: string;
  unit: 'points' | 'percent';
  max: number;
  defaultTarget: number;
};

export type GoalDef = {
  type: GoalType;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  needsTopicSelection: boolean;
  metrics: MetricsConfig;
};

export function getGradeBand(grade: number): GradeBand {
  if (grade <= 8) return '7-8';
  if (grade <= 10) return '9-10';
  return '11-12';
}

export const GOALS: Record<GoalType, GoalDef> = {
  ent: {
    type: 'ent',
    label: 'Подготовка к ЕНТ',
    shortLabel: 'ЕНТ',
    description: 'Комплексная подготовка к экзамену',
    icon: 'GraduationCap',
    needsTopicSelection: false,
    metrics: {
      currentLabel: 'Текущий балл',
      goalLabel: 'Целевой балл',
      unit: 'points',
      max: 100,
      defaultTarget: 85,
    },
  },
  olympiad: {
    type: 'olympiad',
    label: 'Олимпиада',
    shortLabel: 'Олимпиада',
    description: 'Подготовка к олимпиаде по математике',
    icon: 'Trophy',
    needsTopicSelection: false,
    metrics: {
      currentLabel: 'Готовность',
      goalLabel: 'Цель готовности',
      unit: 'percent',
      max: 100,
      defaultTarget: 80,
    },
  },
  test: {
    type: 'test',
    label: 'Контрольная работа',
    shortLabel: 'Контрольная',
    description: 'Подготовка к контрольной по конкретным темам',
    icon: 'ClipboardCheck',
    needsTopicSelection: true,
    metrics: {
      currentLabel: 'Готовность',
      goalLabel: 'Цель готовности',
      unit: 'percent',
      max: 100,
      defaultTarget: 85,
    },
  },
  revision: {
    type: 'revision',
    label: 'Повторение темы',
    shortLabel: 'Повторение',
    description: 'Освежить конкретную тему',
    icon: 'RotateCw',
    needsTopicSelection: true,
    metrics: {
      currentLabel: 'Освоение',
      goalLabel: 'Цель освоения',
      unit: 'percent',
      max: 100,
      defaultTarget: 75,
    },
  },
  school: {
    type: 'school',
    label: 'Школьная программа',
    shortLabel: 'Программа',
    description: 'Изучение программы по классу',
    icon: 'BookOpen',
    needsTopicSelection: false,
    metrics: {
      currentLabel: 'Уровень освоения',
      goalLabel: 'Цель освоения',
      unit: 'percent',
      max: 100,
      defaultTarget: 75,
    },
  },
  custom: {
    type: 'custom',
    label: 'Своя цель',
    shortLabel: 'Своя цель',
    description: 'Опиши свою цель и шкалу результата сам',
    icon: 'Target',
    needsTopicSelection: false,
    metrics: {
      currentLabel: 'Текущий результат',
      goalLabel: 'Желаемый результат',
      unit: 'points',
      max: 100,
      defaultTarget: 85,
    },
  },
};

export function getGoalsForGrade(grade: number): GoalDef[] {
  const band = getGradeBand(grade);
  const order: GoalType[] = band === '11-12'
    ? ['ent', 'test', 'revision', 'olympiad', 'school', 'custom']
    : band === '9-10'
    ? ['school', 'test', 'revision', 'olympiad', 'ent', 'custom']
    : ['school', 'test', 'revision', 'olympiad', 'custom'];

  return order.map((t) => GOALS[t]);
}

export function getGoalDef(type: GoalType): GoalDef {
  return GOALS[type];
}

export function getMetricsForGoal(type: GoalType): MetricsConfig {
  return GOALS[type].metrics;
}

export const GOAL_TOPIC_LABELS: Record<string, string> = {
  fractions: 'Дроби',
  percentages: 'Проценты',
  equations: 'Линейные уравнения',
  systems_of_equations: 'Системы уравнений',
  functions: 'Функции',
  quadratic_equations: 'Квадратные уравнения',
  geometry: 'Геометрия',
  probability: 'Теория вероятностей',
  progressions: 'Прогрессии',
  word_problems: 'Текстовые задачи',
  patterns: 'Закономерности',
  logic: 'Логические задачи',
  combinatorics: 'Комбинаторика',
};

export function getTopicsForGrade(grade: number): { key: string; label: string }[] {
  const band = getGradeBand(grade);
  const base = [
    { key: 'fractions', label: 'Дроби' },
    { key: 'percentages', label: 'Проценты' },
    { key: 'equations', label: 'Линейные уравнения' },
    { key: 'systems_of_equations', label: 'Системы уравнений' },
    { key: 'functions', label: 'Функции' },
    { key: 'quadratic_equations', label: 'Квадратные уравнения' },
    { key: 'geometry', label: 'Геометрия' },
    { key: 'probability', label: 'Теория вероятностей' },
  ];

  if (band === '7-8') {
    return base.slice(0, 6);
  }
  if (band === '9-10') {
    return [...base, { key: 'progressions', label: 'Прогрессии' }];
  }
  return [...base, { key: 'progressions', label: 'Прогрессии' }, { key: 'word_problems', label: 'Текстовые задачи' }];
}
