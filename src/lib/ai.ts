const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ai-tutor`;

const TIMEOUT_MS = 3000;
const LONG_TIMEOUT_MS = 25000;

async function callAiTutor(body: Record<string, unknown>, timeoutMs = TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data.text && typeof data.text === "string") {
      return data.text;
    }
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function callAiTutorJson<T>(body: Record<string, unknown>, timeoutMs = LONG_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    return data as T;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export async function analyzeError(
  question: string,
  studentAnswer: string,
  correctAnswer: string
): Promise<{ text: string; isAi: boolean }> {
  const aiText = await callAiTutor({
    action: "analyze_error",
    question,
    studentAnswer,
    correctAnswer,
  });

  if (aiText) {
    return { text: aiText, isAi: true };
  }

  return {
    text: "Похоже, здесь не хватает внимательности. Проверь знаки и порядок действий — чаще всего ошибка кроется именно там.",
    isAi: false,
  };
}

const TOPIC_FALLBACKS: Record<string, string> = {
  fractions:
    'Дроби — это части целого. Представь пиццу: если разрезать её на 4 равных куска и взять 1, это 1/4. Числитель (верх) — сколько взял, знаменатель (низ) — на сколько разрезали. Складывать и вычитать дроби легко, когда знаменатели одинаковые: работаем только с числителями. Если знаменатели разные — приводим к общему, как находим общий язык. Умножение дробей — просто перемножаем верх с верхом, низ с низом. Деление — переворачиваем вторую дробь и умножаем.',
  equations:
    'Линейное уравнение — это равенство с неизвестным (обычно x), которое нужно найти. Главное правило: что бы ты ни делал с одной стороной уравнения — то же делай с другой. Переносишь число через знак «=» — меняй его знак на противоположный. Делишь обе части на коэффициент при x — получаешь ответ. Уравнение — как весы: убрал гирьку слева, убери такую же справа, чтобы сохранить баланс.',
  functions:
    'Функция — это правило, которое каждому значению x ставит в соответствие значение y. Представь автомат: кидаешь монетку (x) — получаешь билет (y). Линейная функция y = kx + b рисуется прямой линией: k — наклон, b — точка пересечения с осью Y. Квадратичная функция y = ax² + bx + c рисуется параболой — дугой. Нули функции — это значения x, при которых y = 0, то есть точки, где график пересекает ось X.',
  percentages:
    'Процент — это сотая часть числа. 1% = 1/100. Чтобы найти процент от числа, переведи его в десятичную дробь (раздели на 100) и умножь на число. Например, 20% от 150 = 0.2 × 150 = 30. Чтобы найти число по его проценту — раздели известную часть на долю (например, 1400 — это 70%, значит целое = 1400/0.7 = 2000). При последовательных изменениях проценты не складываются: рост на 10% и потом ещё на 10% даёт рост на 21%, а не на 20%.',
  systems_of_equations:
    'Система уравнений — это несколько уравнений с одними и теми же неизвестными, которые нужно решить одновременно. Основные методы: подстановка (вырази одну переменную через другую и подставь), сложение (сложи или вычти уравнения, чтобы убрать одну переменную). Если уравнения пропорциональны — система имеет бесконечно много решений. Если после преобразований получилось неверное равенство (например, 0 = 5) — решений нет.',
  quadratic_equations:
    'Квадратное уравнение имеет вид ax² + bx + c = 0. Главное — найти дискриминант D = b² − 4ac. Если D > 0 — два корня, D = 0 — один корень, D < 0 — действительных корней нет. Корни находятся по формуле x = (−b ± √D) / 2a. Теорема Виета: сумма корней = −b/a, произведение = c/a. Уравнения вида x² = n дают x = ±√n. Неполные уравнения (без c или без bx) решаются вынесением общего множителя.',
  geometry:
    'Геометрия изучает формы, размеры и свойства фигур. Площадь прямоугольника = длина × ширина, треугольника = (основание × высота) / 2, круга = π × r². Теорема Пифагора: в прямоугольном треугольнике квадрат гипотенузы равен сумме квадратов катетов (c² = a² + b²). Сумма углов треугольника — 180°. Диагональ квадрата = сторона × √2. Зная базовые формулы и теоремы, можно решить большинство задач планиметрии.',
  probability:
    'Вероятность события — это число от 0 до 1, показывающее шанс его наступления. Классическая формула: P = (число подходящих исходов) / (общее число исходов). Например, вероятность орла при броске монеты = 1/2 = 0.5. Для несовместных событий вероятность их объединения — сумма вероятностей. Вероятность противоположного события = 1 − P(A). При бросании двух кубиков всего 36 равновозможных исходов — считай подходящие комбинации.',
  progressions:
    'Арифметическая прогрессия — последовательность, где каждый следующий член получается прибавлением постоянной разности d: aₙ = a₁ + (n−1)d. Сумма n членов: Sₙ = (2a₁ + d(n−1)) × n / 2. Геометрическая прогрессия — каждый следующий член умножается на знаменатель q: bₙ = b₁ × q^(n−1). Сумма бесконечной прогрессии при |q| < 1: S = b₁ / (1 − q). Прогрессии встречаются в задачах про вклады, кредиты и рост.',
  word_problems:
    'Текстовые задачи — это перевод жизненной ситуации на язык уравнений. Алгоритм: обозначь неизвестное за x, составь уравнение по условию, реши его и проверь ответ на реалистичность. В задачах на движение используй формулу S = v × t. В задачах на работу — объём = производительность × время. В задачах на смеси — считай количество вещества в каждой части. Главное — внимательно прочитать условие и записать все данные.',
};

export async function explainTopic(
  topicLabel: string,
  topicKey: string,
  grade: number
): Promise<{ text: string; isAi: boolean }> {
  const aiText = await callAiTutor({
    action: 'explain_topic',
    topicLabel,
    grade,
  });

  if (aiText) {
    return { text: aiText, isAi: true };
  }

  return {
    text: TOPIC_FALLBACKS[topicKey] ?? `Тема «${topicLabel}» — важный раздел математики. Внимательно изучи основные определения и формулы, затем переходи к практике на заданиях.`,
    isAi: false,
  };
}

export async function explainRoute(
  completedTopics: string[],
  masteryByTopic: Record<string, number>,
  daysRemaining: number,
  nextTopic: string,
  topicImpact: number,
  topicTime: number,
  goal: string,
  targetScore: number,
  nextTopicMastery?: number
): Promise<{ text: string; isAi: boolean }> {
  const aiText = await callAiTutor({
    action: "explain_route",
    completedTopics,
    masteryByTopic,
    daysRemaining,
    nextTopic,
    topicImpact,
    topicTime,
    goal,
    targetScore,
    nextTopicMastery,
  });

  if (aiText) {
    return { text: aiText, isAi: true };
  }

  const masteryAvg = Object.values(masteryByTopic).length > 0
    ? Math.round(Object.values(masteryByTopic).reduce((a, b) => a + b, 0) / Object.values(masteryByTopic).length)
    : 0;

  if (daysRemaining > 0 && daysRemaining < 30) {
    const masteryNote = nextTopicMastery !== undefined ? ` Уровень по теме: ${nextTopicMastery}%.` : '';
    return {
      text: `До дедлайна ${daysRemaining} дней — эта тема даёт максимум баллов за минимум времени (${topicImpact}/5 за ${topicTime}ч).${masteryNote} Двигаемся к цели: ${goal}.`,
      isAi: false,
    };
  }

  const masteryNote = nextTopicMastery !== undefined ? ` Уровень по диагностике: ${nextTopicMastery}%.` : '';
  return {
    text: `Тема «${nextTopic}» — оптимальный шаг к цели «${goal}» (цель ${targetScore}/100). Важность ${topicImpact}/5 при ${topicTime}ч.${masteryNote} Текущий средний mastery ${masteryAvg}%, продолжаем по маршруту.`,
    isAi: false,
  };
}

// ── Goal-based topic ranking ──────────────────────────────────────────

export async function rankTopicsForGoal(
  goal: string,
  grade: number,
  topics: string[]
): Promise<Record<string, number> | null> {
  const data = await callAiTutorJson<{ weights: Record<string, number> }>(
    { action: "rank_topics_for_goal", goal, grade, topics },
    15000
  );
  if (data?.weights && typeof data.weights === "object") {
    return data.weights;
  }
  return null;
}

// ── AI-generated diagnostic questions ─────────────────────────────────

export type AiDiagnosticQuestion = {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correctIndex: number;
};

export async function generateDiagnosticQuestions(
  goal: string,
  grade: number,
  topics: string[],
  goalType: string,
  selectedTopics?: string[]
): Promise<AiDiagnosticQuestion[] | null> {
  const data = await callAiTutorJson<{ questions: AiDiagnosticQuestion[] }>(
    { action: "generate_diagnostic", goal, grade, topics, goalType, selectedTopics },
    25000
  );
  if (Array.isArray(data?.questions) && data.questions.length > 0) {
    return data.questions;
  }
  return null;
}

// ── Diagnostic profile analysis ───────────────────────────────────────

export type DiagnosticProfile = {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  baseGaps: string[];
  recommendedTopic: string;
  recommendedTopicLabel: string;
  recommendationReason: string;
  hurryWarning: boolean;
  readinessVerdict?: string;
  skillsBreakdown?: Record<string, number>;
};

export type DiagnosticAnswerRecord = {
  question: string;
  topic: string;
  studentAnswer: string;
  correct: boolean;
  timeMs?: number;
};

export async function analyzeDiagnostic(
  grade: number,
  goal: string,
  goalType: string,
  answers: DiagnosticAnswerRecord[]
): Promise<DiagnosticProfile | null> {
  const data = await callAiTutorJson<{ profile: DiagnosticProfile }>(
    { action: "analyze_diagnostic", grade, goal, goalType, answers },
    20000
  );
  if (data?.profile && typeof data.profile.overallScore === "number") {
    return data.profile;
  }
  return null;
}

// ── AI-generated learning route ───────────────────────────────────────

export type AiRouteNode = {
  key: string;
  label: string;
  reason: string;
  impact: number;
  time_hours: number;
  priority: number;
};

export async function generateLearningRoute(
  grade: number,
  goalType: string,
  goal: string,
  masteryByTopic: Record<string, number>,
  missedTopics: string[],
  completedTopics: string[],
  deadline: string | null,
  selectedTopics?: string[]
): Promise<AiRouteNode[] | null> {
  const data = await callAiTutorJson<{ route: AiRouteNode[] }>(
    { action: "generate_route", grade, goalType, goal, masteryByTopic, missedTopics, completedTopics, deadline, selectedTopics },
    20000
  );
  if (Array.isArray(data?.route) && data.route.length > 0) {
    return data.route;
  }
  return null;
}
