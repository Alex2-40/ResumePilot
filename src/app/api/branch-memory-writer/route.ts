import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GapType =
  | "missing_jd_keyword"
  | "missing_related_action"
  | "missing_business_result"
  | "missing_metric"
  | "missing_method_or_tool"
  | "generic_expression";

type AnswerStatus = "positive" | "negative" | "skipped" | "unclear";
type WriterStatus = "answered" | "skipped" | "unclear";

type BranchMemoryWriterRequest = {
  gapType?: unknown;
  gapTitle?: unknown;
  mainQuestion?: unknown;
  userFormAnswer?: unknown;
};

type BranchMemoryWriterResponse = {
  userAnswer: string;
  answerStatus: AnswerStatus;
  extractedPositiveFacts: string[];
  extractedNegativeFacts: string[];
  status: WriterStatus;
};

const SYSTEM_PROMPT = `
你是简历助手流程中的 Memory Writer API。

你的唯一任务是：根据当前 Gap 信息和用户填写的回答，将这条回答拆分为结构化结果，供外层系统写回数据库。

你不负责：
- 优化简历
- 生成简历内容
- 判断用户意图
- 分析 JD
- 修改数据库
- 修改任何完整状态对象

【输入内容】

你会收到：

1. gapType
2. gapTitle
3. mainQuestion
4. userFormAnswer

你只能根据这四个字段判断输出内容。
不得补充上下文。
不得推断用户没明确说出的内容。

【输出字段】

你需要输出：

- userAnswer
- answerStatus
- extractedPositiveFacts
- extractedNegativeFacts
- status

【answerStatus 枚举】

answerStatus 只能为：

- positive
- negative
- skipped
- unclear

判断规则：

- positive：用户提供了明确、真实、可用于简历优化的信息
- negative：用户明确表示没有相关信息
- skipped：用户明确表示跳过当前差距，或选择“不弥补该差距”
- unclear：用户回答过于模糊，无法提取有效信息

【写入规则】

1. userAnswer
- 直接返回 userFormAnswer 原文
- 不改写，不润色，不摘要

2. extractedPositiveFacts
- 仅当 answerStatus = positive 时提取
- 只提取与当前 gap 直接相关的真实信息
- 不得推断、虚构、补全

3. extractedNegativeFacts
- 仅当 answerStatus = negative 时提取
- 只提取与当前 gap 直接相关的否定信息
- 不得推断、虚构、补全

4. status
- positive -> answered
- negative -> answered
- skipped -> skipped
- unclear -> unclear

【输出格式】

你必须输出严格 JSON：

{
  "userAnswer": "string",
  "answerStatus": "positive | negative | skipped | unclear",
  "extractedPositiveFacts": ["string"],
  "extractedNegativeFacts": ["string"],
  "status": "answered | skipped | unclear"
}

【输出要求】

- 只输出合法 JSON
- 不输出解释
- 不输出推理过程
- 不输出 JSON 之外的任何内容
`.trim();

const GAP_TYPES: GapType[] = [
  "missing_jd_keyword",
  "missing_related_action",
  "missing_business_result",
  "missing_metric",
  "missing_method_or_tool",
  "generic_expression",
];

const ANSWER_STATUSES: AnswerStatus[] = ["positive", "negative", "skipped", "unclear"];
const WRITER_STATUSES: WriterStatus[] = ["answered", "skipped", "unclear"];

function stringifyInput(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === undefined || value === null) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error("Memory Writer API 没有返回内容");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Memory Writer API 返回内容不是合法 JSON");
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

function isGapType(value: unknown): value is GapType {
  return typeof value === "string" && GAP_TYPES.includes(value as GapType);
}

function isAnswerStatus(value: unknown): value is AnswerStatus {
  return typeof value === "string" && ANSWER_STATUSES.includes(value as AnswerStatus);
}

function isWriterStatus(value: unknown): value is WriterStatus {
  return typeof value === "string" && WRITER_STATUSES.includes(value as WriterStatus);
}

function validateStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 必须是数组`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(`${fieldName}[${index}] 必须是字符串`);
    }

    return item.trim();
  });
}

function validateResponse(value: unknown): BranchMemoryWriterResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Memory Writer API 返回结构不是对象");
  }

  const candidate = value as Record<string, unknown>;
  const userAnswer = candidate.userAnswer;
  const answerStatus = candidate.answerStatus;
  const extractedPositiveFacts = candidate.extractedPositiveFacts;
  const extractedNegativeFacts = candidate.extractedNegativeFacts;
  const status = candidate.status;

  if (typeof userAnswer !== "string") {
    throw new Error("userAnswer 无效");
  }

  if (!isAnswerStatus(answerStatus)) {
    throw new Error("answerStatus 无效");
  }

  if (!isWriterStatus(status)) {
    throw new Error("status 无效");
  }

  return {
    userAnswer,
    answerStatus,
    extractedPositiveFacts: validateStringArray(extractedPositiveFacts, "extractedPositiveFacts"),
    extractedNegativeFacts: validateStringArray(extractedNegativeFacts, "extractedNegativeFacts"),
    status,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "缺少 DEEPSEEK_API_KEY 环境变量" }, { status: 500 });
  }

  let body: BranchMemoryWriterRequest;

  try {
    body = (await request.json()) as BranchMemoryWriterRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const gapType = body.gapType;
  const gapTitle = stringifyInput(body.gapTitle);
  const mainQuestion = stringifyInput(body.mainQuestion);
  const userFormAnswer = stringifyInput(body.userFormAnswer);

  if (!isGapType(gapType)) {
    return NextResponse.json({ error: "gapType 无效" }, { status: 400 });
  }

  if (!gapTitle || !mainQuestion || !userFormAnswer) {
    return NextResponse.json(
      { error: "请同时提供 gapTitle、mainQuestion 和 userFormAnswer" },
      { status: 400 },
    );
  }

  const model = process.env.DEEPSEEK_BRANCH_MEMORY_MODEL ?? "deepseek-v4-flash";
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            "===== gapType =====",
            gapType,
            "",
            "===== gapTitle =====",
            gapTitle,
            "",
            "===== mainQuestion =====",
            mainQuestion,
            "",
            "===== userFormAnswer =====",
            userFormAnswer,
          ].join("\n"),
        },
      ],
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

  const rawResult = data.choices?.[0]?.message?.content?.trim() ?? "";

  try {
    const parsed = JSON.parse(extractJsonObject(rawResult)) as unknown;
    const result = validateResponse(parsed);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Memory Writer API 返回解析失败",
        raw: rawResult,
      },
      { status: 502 },
    );
  }
}
