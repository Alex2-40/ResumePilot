import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GapType =
  | "missing_jd_keyword"
  | "missing_related_action"
  | "missing_business_result"
  | "missing_metric"
  | "missing_method_or_tool"
  | "generic_expression";

type GapAnswerStatus = "positive" | "negative" | "skipped" | "unclear";
type GapItemStatus = "pending" | "answered" | "skipped" | "unclear";

type LegacyOptimizeRequest = {
  jdJson?: unknown;
  targetJd?: unknown;
  targetType?: "bullet" | "item" | string;
  targetDraftJson?: unknown;
  rewriteRules?: string[] | string;
  userPrompt?: string;
};

type TargetJobInput = {
  title?: unknown;
  jd?: unknown;
};

type GapContextItemInput = {
  gapId?: unknown;
  gapType?: unknown;
  gapTitle?: unknown;
  mainQuestion?: unknown;
  status?: unknown;
  userAnswer?: unknown;
  answerStatus?: unknown;
  extractedPositiveFacts?: unknown;
  extractedNegativeFacts?: unknown;
  isCurrentGap?: unknown;
};

type EnhanceOptimizeRequest = LegacyOptimizeRequest & {
  targetJob?: unknown;
  currentDraft?: unknown;
  gapContext?: unknown;
  resumeRules?: unknown;
};

const SYSTEM_PROMPT = `
你是一名专业的中文简历优化助手，擅长基于目标岗位 JD，对当前经历沙箱中的简历内容进行定向增强优化。

你的唯一任务是：根据 targetJob、currentDraft、gapContext 和 resumeRules，对当前经历沙箱中的 currentDraft 进行增强式优化，使其更加符合目标岗位，同时保持真实、专业、自然，并能够直接写回 Draft JSON。

你的任务不是重写整份简历，而是仅优化当前经历沙箱中的 currentDraft。

你不负责：

- 编造用户经历
- 修改当前经历沙箱之外的内容
- 修改其他经历、其他模块或其他简历

【输入内容】

你会收到：

1. targetJob
2. currentDraft
3. gapContext
4. resumeRules

其中：

- targetJob.title：目标岗位名称
- targetJob.jd：目标岗位 JD JSON
- currentDraft：当前经历沙箱对应的 Draft 内容
- gapContext：当前经历沙箱中已经积累的结构化 Gap 记忆
- resumeRules：简历优化规则

【gapContext 结构】

gapContext 的格式如下：

[
  {
    "gapId": "...",
    "gapType": "...",
    "gapTitle": "...",
    "mainQuestion": "...",
    "status": "pending | answered | skipped | unclear",
    "userAnswer": "...",
    "answerStatus": "positive | negative | skipped | unclear | \\"\\"",
    "extractedPositiveFacts": [],
    "extractedNegativeFacts": [],
    "isCurrentGap": false
  }
]

其中：

- extractedPositiveFacts：用户明确确认、可以写入简历的真实信息
- extractedNegativeFacts：用户明确否定、禁止写入简历的信息

【gapContext 使用规则】

1. 只有 answerStatus = positive 的 extractedPositiveFacts 可以作为新增事实来源。
2. answerStatus = negative 的 extractedNegativeFacts 不能写入简历，但必须作为限制条件使用。
3. answerStatus = skipped / unclear / pending 的内容不得作为新增事实来源。
4. 不得根据 gapType、gapTitle、mainQuestion 或 targetJob.jd 自行推断用户没有明确提供的内容。

【优化原则】

currentDraft 已经是一份结构完整、表达较好的简历内容。

你的任务是在保留原有真实内容的基础上，根据 targetJob、gapContext 和 resumeRules，对 currentDraft 做增强优化，而不是完全重写。

优化目标：

- 保持 currentDraft 的结构和写作风格
- 保留所有原有真实信息
- 补充用户已确认的正向事实
- 提高岗位匹配度和 ATS 关键词覆盖
- 输出结果可直接写回 Draft JSON

【内容融合原则】

1. 所有新增内容必须来源于：
- gapContext 中 answerStatus = positive 的 extractedPositiveFacts

2. 新增内容可以：
- 融合到已有 Bullet
- 无法融合时新增一个 Bullet

3. 禁止：
- 使用 skipped、unclear、pending 的内容作为新增事实来源
- 将 extractedNegativeFacts 中被否定的信息写入简历
- 根据 JD 推断用户没有确认的职责、成果、数据、工具、技能或项目
- 删除、覆盖或弱化 currentDraft 中任何真实内容

【表达目标】

- 更符合目标岗位 JD
- 优先强化岗位职责、关键词、硬技能及核心能力
- 保持专业、简洁、结果导向
- 尽量体现动作、对象、方法、产出和结果
- 与 currentDraft 保持一致的写作风格
- JD 原词优先使用，不随意替换

【优化优先级】

1. gapContext 中 answerStatus = positive 的 extractedPositiveFacts
2. gapContext 中 answerStatus = negative 的 extractedNegativeFacts（作为限制条件）
3. currentDraft
4. targetJob.jd
5. resumeRules
6. 表达优化

注意：

- targetJob.jd 仅用于指导表达方向、关键词和岗位贴合度
- targetJob.jd 不得作为新增事实来源

【作用域规则】

- 只允许修改当前经历沙箱中的 currentDraft
- 不得修改其他经历
- 不得修改其他模块
- 不得扩展到当前输入范围之外的内容

【限制条件】

- 不得将“参与”改为“主导”，除非有事实支持
- 不得夸大职责、权限或成果
- 不得使用学生式表达
- 不得把“具备……能力”“提升……能力”作为句子核心
- 如果用户明确否定某项信息，后续不得再次写入该项内容

【输出要求】

- 保持与输入 currentDraft 一致的 Draft JSON 结构
- 保留原有 id
- 只输出合法 JSON
- 不输出解释、备注或分析
- 不删除任何原有真实内容
- 所有新增内容必须来源于 gapContext 中 answerStatus = positive 的 extractedPositiveFacts
`.trim();

const GAP_TYPES: GapType[] = [
  "missing_jd_keyword",
  "missing_related_action",
  "missing_business_result",
  "missing_metric",
  "missing_method_or_tool",
  "generic_expression",
];

const GAP_ANSWER_STATUSES: GapAnswerStatus[] = ["positive", "negative", "skipped", "unclear"];
const GAP_ITEM_STATUSES: GapItemStatus[] = ["pending", "answered", "skipped", "unclear"];

function stringifyInput(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === undefined || value === null) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

function normalizeStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function isGapType(value: unknown): value is GapType {
  return typeof value === "string" && GAP_TYPES.includes(value as GapType);
}

function isGapAnswerStatus(value: unknown): value is GapAnswerStatus {
  return typeof value === "string" && GAP_ANSWER_STATUSES.includes(value as GapAnswerStatus);
}

function isGapItemStatus(value: unknown): value is GapItemStatus {
  return typeof value === "string" && GAP_ITEM_STATUSES.includes(value as GapItemStatus);
}

function validateTargetJob(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("targetJob 必须是对象");
  }

  const targetJob = value as TargetJobInput;
  const title = typeof targetJob.title === "string" ? targetJob.title.trim() : "";
  const jd = targetJob.jd;

  if (!jd) {
    throw new Error("targetJob.jd 无效");
  }

  return {
    title,
    jd,
  };
}

function validateGapContext(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("gapContext 必须是数组");
  }

  return value.map((item, gapIndex) => {
    if (!item || typeof item !== "object") {
      throw new Error(`gapContext[${gapIndex}] 不是对象`);
    }

    const gap = item as GapContextItemInput;
    const gapId = gap.gapId;
    const gapType = gap.gapType;
    const gapTitle = gap.gapTitle;
    const mainQuestion = gap.mainQuestion;
    const status = gap.status;
    const userAnswer = gap.userAnswer;
    const answerStatus = gap.answerStatus;
    const extractedPositiveFacts = gap.extractedPositiveFacts ?? [];
    const extractedNegativeFacts = gap.extractedNegativeFacts ?? [];
    const isCurrentGap = gap.isCurrentGap ?? false;

    if (typeof gapId !== "string" || !gapId.trim()) {
      throw new Error(`gapContext[${gapIndex}].gapId 无效`);
    }

    if (!isGapType(gapType)) {
      throw new Error(`gapContext[${gapIndex}].gapType 无效`);
    }

    if (typeof gapTitle !== "string" || !gapTitle.trim()) {
      throw new Error(`gapContext[${gapIndex}].gapTitle 无效`);
    }

    if (typeof mainQuestion !== "string" || !mainQuestion.trim()) {
      throw new Error(`gapContext[${gapIndex}].mainQuestion 无效`);
    }

    if (!isGapItemStatus(status)) {
      throw new Error(`gapContext[${gapIndex}].status 无效`);
    }

    if (typeof userAnswer !== "string") {
      throw new Error(`gapContext[${gapIndex}].userAnswer 无效`);
    }

    if (answerStatus !== "" && !isGapAnswerStatus(answerStatus)) {
      throw new Error(`gapContext[${gapIndex}].answerStatus 无效`);
    }

    if (!Array.isArray(extractedPositiveFacts)) {
      throw new Error(`gapContext[${gapIndex}].extractedPositiveFacts 无效`);
    }

    if (!Array.isArray(extractedNegativeFacts)) {
      throw new Error(`gapContext[${gapIndex}].extractedNegativeFacts 无效`);
    }

    if (typeof isCurrentGap !== "boolean") {
      throw new Error(`gapContext[${gapIndex}].isCurrentGap 无效`);
    }

    return {
      gapId: gapId.trim(),
      gapType,
      gapTitle: gapTitle.trim(),
      mainQuestion: mainQuestion.trim(),
      status,
      userAnswer: userAnswer.trim(),
      answerStatus: (answerStatus ?? "") as GapAnswerStatus | "",
      extractedPositiveFacts: extractedPositiveFacts
        .filter((fact): fact is string => typeof fact === "string")
        .map((fact) => fact.trim())
        .filter(Boolean),
      extractedNegativeFacts: extractedNegativeFacts
        .filter((fact): fact is string => typeof fact === "string")
        .map((fact) => fact.trim())
        .filter(Boolean),
      isCurrentGap,
    };
  });
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error("DeepSeek 没有返回可用 JSON");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("返回内容不是合法 JSON");
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "缺少 DEEPSEEK_API_KEY 环境变量" }, { status: 500 });
  }

  let body: EnhanceOptimizeRequest;

  try {
    body = (await request.json()) as EnhanceOptimizeRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const targetJobInput = body.targetJob ?? (body.targetJd || body.jdJson ? { title: "", jd: body.targetJd ?? body.jdJson } : null);
  const currentDraft = body.currentDraft ?? body.targetDraftJson;
  const resumeRules = normalizeStringList(body.resumeRules ?? body.rewriteRules);
  const targetType = typeof body.targetType === "string" ? body.targetType.trim() : "";

  let targetJob: ReturnType<typeof validateTargetJob>;
  let gapContext: ReturnType<typeof validateGapContext>;

  try {
    targetJob = validateTargetJob(targetJobInput);
    gapContext = validateGapContext(body.gapContext);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Optimize API 输入参数校验失败" },
      { status: 400 },
    );
  }

  if (!currentDraft) {
    return NextResponse.json(
      { error: "请提供 currentDraft" },
      { status: 400 },
    );
  }

  const model = process.env.DEEPSEEK_OPTIMIZE_MODEL ?? "deepseek-v4-flash";
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            targetType ? "===== 当前目标类型 =====" : "",
            targetType,
            targetType ? "" : "",
            "===== targetJob =====",
            stringifyInput(targetJob),
            "",
            "===== currentDraft =====",
            stringifyInput(currentDraft),
            "",
            "===== gapContext =====",
            stringifyInput(gapContext),
            "",
            "===== resumeRules =====",
            resumeRules.length > 0 ? resumeRules.map((rule) => `- ${rule}`).join("\n") : "无",
          ]
            .filter((item, index, arr) => {
              if (item !== "") {
                return true;
              }
              const prev = arr[index - 1];
              const next = arr[index + 1];
              return prev !== "" && next !== "";
            })
            .join("\n"),
        },
      ],
      temperature: 0.2,
      response_format: {
        type: "json_object",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: `DeepSeek 请求失败：${errorText}` },
      { status: 502 },
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
      };
    }>;
  };

  const result = data.choices?.[0]?.message?.content?.trim() ?? "";

  if (!result) {
    return NextResponse.json({ error: "DeepSeek 没有返回可用 JSON" }, { status: 502 });
  }

  try {
    const normalized = extractJsonObject(result);
    return NextResponse.json({ result: normalized });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "优化结果解析失败", raw: result },
      { status: 502 },
    );
  }
}
