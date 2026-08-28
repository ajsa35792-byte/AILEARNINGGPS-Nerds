import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const TOPIC_LABELS: Record<string, string> = {
  fractions: "Дроби",
  percentages: "Проценты",
  equations: "Линейные уравнения",
  systems_of_equations: "Системы уравнений",
  functions: "Функции",
  quadratic_equations: "Квадратные уравнения",
  geometry: "Геометрия",
  probability: "Теория вероятностей",
  progressions: "Прогрессии",
  word_problems: "Текстовые задачи",
  patterns: "Закономерности",
  logic: "Логические задачи",
  combinatorics: "Комбинаторика",
};

type RequestBody =
  | { action: "analyze_error"; question: string; studentAnswer: string; correctAnswer: string }
  | {
      action: "explain_route";
      completedTopics: string[];
      masteryByTopic: Record<string, number>;
      daysRemaining: number;
      nextTopic: string;
      topicImpact: number;
      topicTime: number;
      goal: string;
      targetScore: number;
      nextTopicMastery?: number;
    }
  | { action: "explain_topic"; topicLabel: string; grade: number }
  | { action: "rank_topics_for_goal"; goal: string; grade: number; topics: string[] }
  | {
      action: "generate_diagnostic";
      goal: string;
      grade: number;
      topics: string[];
      goalType: string;
      selectedTopics?: string[];
    }
  | {
      action: "analyze_diagnostic";
      grade: number;
      goal: string;
      goalType: string;
      answers: { question: string; topic: string; studentAnswer: string; correct: boolean; timeMs?: number }[];
    }
  | {
      action: "generate_route";
      grade: number;
      goalType: string;
      goal: string;
      masteryByTopic: Record<string, number>;
      missedTopics: string[];
      completedTopics: string[];
      deadline: string | null;
      selectedTopics?: string[];
    };

async function callGemini(
  prompt: string,
  apiKey: string,
  maxTokens: number,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function extractJson(raw: string, openChar: string, closeChar: string): string {
  let cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf(openChar);
  const end = cleaned.lastIndexOf(closeChar);
  if (start >= 0 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return cleaned;
}

function gradeStyle(grade: number): string {
  if (grade <= 8) return "базовый уровень: простые бытовые примеры, короткие числа, одношаговые задачи. НЕ давай сложных задач.";
  if (grade <= 10) return "средний уровень: стандартные формулировки, 2-3 шага решения, дроби и проценты в задачах.";
  return `ПРОДВИНУТЫЙ уровень для ${grade} класса: многошаговые задачи (3-5 шагов), системы уравнений, производные, логарифмы, сложные функции, тригонометрия, задачи уровня ЕНТ и олимпиад. Вопросы должны быть СЛОЖНЫМИ — не ниже уровня выпускных экзаменов. Запрещено давать простые одношаговые задачи.`;
}

function buildDiagnosticPrompt(
  goal: string,
  grade: number,
  topics: string[],
  goalType: string,
  selectedTopics?: string[]
): string {
  const topicList = topics.map((t) => `${t} (${TOPIC_LABELS[t] ?? t})`).join(", ");
  const style = gradeStyle(grade);
  const base = `Ты — составитель диагностических тестов по математике. Ученик ${grade} класса поставил цель: «${goal}».\n\n`;

  if (goalType === "ent") {
    return `${base}Составь 12 диагностических вопросов с вариантами ответов (по 4 варианта, один правильный) для подготовки к ЕНТ.

КРИТИЧЕСКИ ВАЖНО — УРОВЕНЬ СЛОЖНОСТИ:
${style}

Вопросы должны:
- Покрывать темы: ${topicList}
- Строго соответствовать уровню ${grade} класса. Для 11-12 классов — задачи уровня ЕНТ: производные, логарифмы, тригонометрия, системы уравнений, сложные функции. Для 7-8 классов — простые задачи на дроби и проценты.
- Включить 4-5 базовых вопросов и 7-8 задач уровня ЕНТ
- Проверять понимание, а не только вычисления
- Каждый вопрос должен требовать 2-4 шага решения для 9-12 классов

Ответь ТОЛЬКО в формате JSON (без markdown, без \`\`\`):
[{"id": "d1", "topic": "percentages", "question": "Текст вопроса", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]`;
  }

  if (goalType === "olympiad") {
    const olympiadTopics = ["patterns", "logic", "combinatorics", "equations", "geometry", "word_problems"];
    const olympiadList = olympiadTopics.map((t) => `${t} (${TOPIC_LABELS[t] ?? t})`).join(", ");
    return `${base}Составь 10 диагностических вопросов с вариантами ответов (по 4 варианта, один правильный) для олимпиадной подготовки.

КРИТИЧЕСКИ ВАЖНО — УРОВЕНЬ СЛОЖНОСТИ:
${style}

Вопросы должны:
- Включать нестандартные задачи: ${olympiadList}
- Для ${grade} класса: ${style}
- 3-4 вопроса на закономерности и логику, 3-4 на нестандартные уравнения и многошаговые задачи, 2-3 на комбинаторику
- Для 11-12 классов: задачи уровня республиканской олимпиады, требующие 4-6 шагов
- Для 7-8 классов: задачи уровня школьного тура олимпиады

Ответь ТОЛЬКО в формате JSON (без markdown, без \`\`\`):
[{"id": "d1", "topic": "patterns", "question": "Текст вопроса", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]`;
  }

  if (goalType === "test" || goalType === "revision") {
    const selTopics = selectedTopics?.length ? selectedTopics : topics;
    const selList = selTopics.map((t) => `${t} (${TOPIC_LABELS[t] ?? t})`).join(", ");
    return `${base}Составь ${goalType === "revision" ? 8 : 10} диагностических вопросов с вариантами ответов (по 4 варианта, один правильный).

КРИТИЧЕСКИ ВАЖНО — УРОВЕНЬ СЛОЖНОСТИ:
${style}

Вопросы должны:
- Включить 4-5 базовых вопросов по математике
- Остальные вопросы СТРОГО по темам: ${selList}
- Уровень строго ${grade} класса. Для 11-12 классов — сложные многошаговые задачи, НЕ простые одношаговые.
- Проверять понимание выбранных тем на глубоком уровне

Ответь ТОЛЬКО в формате JSON (без markdown, без \`\`\`):
[{"id": "d1", "topic": "functions", "question": "Текст вопроса", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]`;
  }

  // school program
  return `${base}Составь 10 диагностических вопросов с вариантами ответов (по 4 варианта, один правильный).

КРИТИЧЕСКИ ВАЖНО — УРОВЕНЬ СЛОЖНОСТИ:
${style}

Вопросы должны:
- Покрывать темы: ${topicList}
- Соответствовать школьной программе ${grade} класса.
- Для 11-12 классов: задачи с производными, логарифмами, интегралами, тригонометрией.
- Для 7-8 классов: базовые задачи на дроби, проценты, простые уравнения.
- Проверять понимание тем на уровне, соответствующем классу

Ответь ТОЛЬКО в формате JSON (без markdown, без \`\`\`):
[{"id": "d1", "topic": "fractions", "question": "Текст вопроса", "options": ["A", "B", "C", "D"], "correctIndex": 0}, ...]`;
}

function buildRoutePrompt(
  grade: number,
  goalType: string,
  goal: string,
  masteryByTopic: Record<string, number>,
  missedTopics: string[],
  completedTopics: string[],
  deadline: string | null,
  selectedTopics?: string[]
): string {
  const masteryEntries = Object.entries(masteryByTopic)
    .sort((a, b) => a[1] - b[1]);
  const masteryStr = masteryEntries.map(([k, v]) => `${TOPIC_LABELS[k] ?? k}: ${v}%`).join(", ") || "нет данных";
  const strongStr = masteryEntries.filter(([, v]) => v >= 70).map(([k]) => TOPIC_LABELS[k] ?? k).join(", ") || "нет";
  const weakStr = masteryEntries.filter(([, v]) => v < 60).map(([k]) => TOPIC_LABELS[k] ?? k).join(", ") || "нет";
  const completedStr = completedTopics.map((t) => TOPIC_LABELS[t] ?? t).join(", ") || "нет";
  const selStr = selectedTopics?.length ? selectedTopics.map((t) => TOPIC_LABELS[t] ?? t).join(", ") : "все темы";

  let goalContext = "";
  if (goalType === "ent") {
    goalContext = `Маршрут подготовки к ЕНТ — комплексный. Покрывает все темы, важные для ЕНТ, но НАЧИНАТЬ с тех, где ученик слабее. Сильные темы (≥70%) ставить в конец или вообще исключить.`;
  } else if (goalType === "olympiad") {
    goalContext = `Маршрут олимпиадной подготовки — акцент на нестандартные задачи, логику, закономерности. Начинать со слабых тем, без базы которых не решить олимпиадные задачи.`;
  } else if (goalType === "test") {
    goalContext = `Маршрут к контрольной — КОРОТКИЙ, только по темам: ${selStr}. Сначала проверь базовые темы, нужные для контрольной, потом основную тему. Если до контрольной мало времени — только критичные темы.`;
  } else if (goalType === "revision") {
    goalContext = `Маршрут повторения — фокус на: ${selStr}. Начинать с тем, где ученик слабее.`;
  } else {
    goalContext = `Маршрут по школьной программе — последовательно. Начинать со слабых тем (mastery < 60%), сильные (≥70%) ставить в конец.`;
  }

  const daysLeft = deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)) : null;
  const deadlineStr = daysLeft !== null ? `До дедлайна осталось ${daysLeft} дней.` : "Дедлайн не задан — маршрут без спешки.";

  return `Ты — AI-навигатор учебного маршрута. Ученик ${grade} класса, цель: «${goal}».

${goalContext}

РЕЗУЛЬТАТЫ ДИАГНОСТИКИ (mastery по каждой теме, от слабой к сильной):
${masteryStr}

СИЛЬНЫЕ темы (≥70% — НЕ ставить в начало маршрута): ${strongStr}
СЛАБЫЕ темы (<60% — ставить в начало): ${weakStr}
Пройденные темы: ${completedStr}
${deadlineStr}

КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:
1. ДВА ученика с разными результатами диагностики НЕ должны получать одинаковый маршрут.
2. Темы с mastery ≥70% НЕ ставить в начало — они уже освоены.
3. Темы с mastery <60% ставить ПЕРВЫМИ — это пробелы.
4. Учитывай ЗАВИСИМОСТИ между темами: если ученик плохо знает линейные уравнения И квадратные, сначала поставить линейные (база), потом квадратные. НЕ выбирать квадратные только из-за самого низкого балла.
5. Порядок тем зависит от: (а) насколько плохо знает тему, (б) важности для цели, (в) нужна ли как база для следующих тем, (г) времени на изучение, (д) дней до дедлайна.
6. reason для первой темы должен ссылаться на конкретный процент по диагностике, например: «По диагностике твой уровень по функциям — 38%. Эта тема нужна для следующих разделов и сейчас имеет высокий приоритет для твоей цели».

Построй маршрут из 4-6 тем в порядке изучения.

Ответь ТОЛЬКО в формате JSON (без markdown, без \`\`\`):
[{"key": "functions", "label": "Функции", "reason": "По диагностике уровень 38%, база для следующих тем", "impact": 4, "time_hours": 2, "priority": 1}, ...]

priority: 1 = первая тема, 2 = вторая и т.д. impact: 1-5 (важность для цели). time_hours: время изучения.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured", fallback: true }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json() as RequestBody;

    // ── rank_topics_for_goal ──────────────────────────────────────────
    if (body.action === "rank_topics_for_goal") {
      const topicList = body.topics.map((t) => `${t} (${TOPIC_LABELS[t] ?? t})`).join(", ");
      const prompt = `Ты — AI-аналитик образовательных маршрутов. Ученик ${body.grade} класса поставил цель: «${body.goal}».

Оцени важность каждой темы для достижения цели по шкале от 1 до 5, где 5 — критически важна, 1 — почти не нужна.

Темы: ${topicList}

Ответь ТОЛЬКО в формате JSON (без markdown, без \`\`\`):
{"fractions": 3, "percentages": 5, "equations": 4, ...}`;

      const text = await callGemini(prompt, apiKey, 500, 15000);
      if (!text) {
        return new Response(JSON.stringify({ error: "Gemini returned empty", fallback: true }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let weights: Record<string, number>;
      try {
        weights = JSON.parse(extractJson(text, "{", "}"));
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse weights", fallback: true, raw: text }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      for (const t of body.topics) {
        const v = weights[t];
        if (typeof v !== "number" || isNaN(v)) weights[t] = 3;
        else weights[t] = Math.max(1, Math.min(5, Math.round(v)));
      }

      return new Response(JSON.stringify({ weights }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── generate_diagnostic ────────────────────────────────────────────
    if (body.action === "generate_diagnostic") {
      const prompt = buildDiagnosticPrompt(body.goal, body.grade, body.topics, body.goalType, body.selectedTopics);
      const text = await callGemini(prompt, apiKey, 4000, 30000);
      if (!text) {
        return new Response(JSON.stringify({ error: "Gemini returned empty", fallback: true }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let questions: unknown;
      try {
        questions = JSON.parse(extractJson(text, "[", "]"));
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse questions", fallback: true, raw: text }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ questions }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── analyze_diagnostic ────────────────────────────────────────────
    if (body.action === "analyze_diagnostic") {
      const answersStr = body.answers.map((a, i) =>
        `${i + 1}. Тема: ${a.topic}. Вопрос: "${a.question}". Ответ ученика: "${a.studentAnswer}". ${a.correct ? "Верно" : "Неверно"}.${a.timeMs ? ` Время: ${Math.round(a.timeMs / 1000)}с.` : ""}`
      ).join("\n");

      const style = gradeStyle(body.grade);

      const prompt = `Ты — AI-аналитик образовательной диагностики. Ученик ${body.grade} класса прошёл стартовую диагностику. Цель ученика: «${body.goal}» (тип: ${body.goalType}).
Уровень класса: ${style}

Результаты диагностики:
${answersStr}

Проанализируй результаты и составь профиль ученика. Определи:
1. Сильные стороны — темы, где ученик ответил правильно, с пониманием
2. Темы, требующие внимания — где есть ошибки
3. Возможные базовые пробелы — связи между темами, которые могут быть не усвоены (например, если ошибка в квадратных уравнениях, возможно не усвоены линейные)
4. Рекомендуемая тема для старта — одна, самая важная для маршрута
5. Короткий вывод-подпись (1 предложение) о том, почему именно эта тема

Ответь ТОЛЬКО в формате JSON (без markdown, без \`\`\`):
{
  "overallScore": 70,
  "strengths": ["Проценты", "Линейные уравнения"],
  "weaknesses": ["Функции", "Геометрия"],
  "baseGaps": ["Связь между функцией и графиком"],
  "recommendedTopic": "functions",
  "recommendedTopicLabel": "Функции",
  "recommendationReason": "Эта тема сейчас сильнее всего влияет на твой дальнейший маршрут.",
  "hurryWarning": false
}

overallScore — процент правильных ответов (0-100).
hurryWarning — true если ученик отвечал очень быстро (< 5 секунд) и ошибался несколько раз подряд.`;

      const text = await callGemini(prompt, apiKey, 1200, 15000);
      if (!text) {
        return new Response(JSON.stringify({ error: "Gemini returned empty", fallback: true }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let profile: unknown;
      try {
        profile = JSON.parse(extractJson(text, "{", "}"));
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse profile", fallback: true, raw: text }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ profile }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── generate_route ─────────────────────────────────────────────────
    if (body.action === "generate_route") {
      const prompt = buildRoutePrompt(
        body.grade, body.goalType, body.goal,
        body.masteryByTopic, body.missedTopics, body.completedTopics,
        body.deadline, body.selectedTopics
      );
      const text = await callGemini(prompt, apiKey, 1500, 15000);
      if (!text) {
        return new Response(JSON.stringify({ error: "Gemini returned empty", fallback: true }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let route: unknown;
      try {
        route = JSON.parse(extractJson(text, "[", "]"));
      } catch {
        return new Response(JSON.stringify({ error: "Failed to parse route", fallback: true, raw: text }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ route }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── analyze_error / explain_route / explain_topic ──────────────────
    let prompt = "";
    let maxTokens = 200;

    if (body.action === "analyze_error") {
      prompt = `Проанализируй ошибку ученика в задании по математике. Определи тип ошибки (вычислительная/непонимание концепции/невнимательность) и дай объяснение простым языком для школьника 9-11 класса, максимум 2 предложения.

Задание: ${body.question}
Ответ ученика: ${body.studentAnswer}
Правильный ответ: ${body.correctAnswer}`;
    } else if (body.action === "explain_route") {
      const masteryStr = Object.entries(body.masteryByTopic).map(([k, v]) => `${k}: ${v}%`).join(", ");
      const masteryLine = body.nextTopicMastery !== undefined
        ? `Уровень ученика по этой теме по диагностике: ${body.nextTopicMastery}%.`
        : "Уровень по этой теме неизвестен.";
      prompt = `Ты — AI-навигатор персонального маршрута обучения. Ученик описал свою цель так: «${body.goal}». Целевая оценка: ${body.targetScore} из 100. Объясни в одном-двух коротких предложениях в стиле GPS-навигатора, почему эта тема выбрана следующей, учитывая цель ученика и его уровень.

${masteryLine}
Пройденные темы: ${body.completedTopics.join(", ") || "нет"}
Текущий mastery: ${masteryStr || "нет данных"}
Дней до дедлайна: ${body.daysRemaining}
Следующая тема: ${body.nextTopic} (важность ${body.topicImpact}/5, время ${body.topicTime}ч)
Цель ученика: ${body.goal}`;
    } else if (body.action === "explain_topic") {
      const grade = body.grade;
      const style = grade <= 8 ? "объясняй максимально просто, с бытовыми примерами, короткими предложениями" : "можно чуть сложнее, с более формальным языком и связью с другими темами";
      prompt = `Объясни тему «${body.topicLabel}» школьнику ${grade} класса на русском языке. ${style}. Максимум 4-5 предложений.`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const text = await callGemini(prompt, apiKey, maxTokens, 8000);
    if (!text) {
      return new Response(JSON.stringify({ error: "Empty Gemini response", fallback: true }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ text }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, fallback: true }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
