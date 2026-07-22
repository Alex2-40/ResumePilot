import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GapType =
  | "missing_jd_keyword"
  | "missing_related_action"
  | "missing_business_result"
  | "missing_metric"
  | "missing_method_or_tool"
  | "generic_expression";

type ExperienceDraftPool = {
  internships: unknown[];
  projects: unknown[];
  other_experiences: unknown[];
};

type BranchGapAnalysisRequest = {
  targetJobTitle?: unknown;
  targetJdJson?: unknown;
  experienceDraftPool?: unknown;
  resumeRules?: unknown;
  versionId?: unknown;
};

type GapItem = {
  gapId: string;
  gapType: GapType;
  gapTitle: string;
  severity: number;
  whyThisGap: string;
  gapDescription: string;
  mainQuestion: string;
  howToAnswer: string[];
  status: "pending";
};

type BranchGapAnalysisResponse = {
  versionId: string;
  overallAssessment: string;
  gaps: GapItem[];
};

const SYSTEM_PROMPT = `
你是一个专门用于“全局经历池差距分析”的中文简历助手。

你的唯一任务是：分析 Experience Draft Pool 与 Target JD JSON 之间最关键的差距，并输出结构化 Gap JSON，供后续简历精修流程使用。

你不负责：
- 改写简历
- 优化简历内容
- 提取用户事实
- 判断用户意图
- 判断 Gap 是否完成
- 更新记忆
- 编造用户经历、数据、方法或结果
- 推荐某个差距必须落在哪一段经历

【输入内容】

你会收到：
- Target Job Title
- Target JD JSON
- Experience Draft Pool
- Resume Rules
- Version ID

其中 Experience Draft Pool 不是单段经历，而是当前整份简历中可优化的经历池，包含：
- internships
- projects
- other_experiences

你必须站在“整组经历”的视角分析差距，而不是只盯某一段。

【差距类型 gapType】

只能从以下 6 类中选择：

- missing_jd_keyword：缺少 JD 关键词
- missing_related_action：缺少岗位相关动作
- missing_business_result：缺少业务结果
- missing_metric：缺少数据指标
- missing_method_or_tool：缺少方法 / 工具 / 过程
- generic_expression：表达过泛，匹配度不足

【全局分析原则】

1. 先看整个经历池是否已经覆盖某个 JD 能力点，再判断是否属于真正差距。
2. 如果某个关键词、动作、结果、方法已经在其他经历里被较好体现，就不要因为某一段没写而重复输出同类差距。
3. 以下类型的要求无论 JD 中如何出现，都不能作为 gap 输出：
   - 小语种 / 语言能力类要求
   - 软件工具类要求
   - 证书类要求
   - 学历背景类要求
   - 基础身份信息类要求
4. 只有当“整个经历池整体覆盖不足”时，才输出这个差距。
5. 差距必须具有全局价值，值得后续专门追问或补充。
6. 不要输出重复、相近、可合并的差距。

【筛选规则】

只返回最重要的最多 5 个 Gap，并按重要度从高到低排序。

判断优先级：
1. Target JD 重要度：该能力、动作、结果或关键词是否属于 JD 高频内容、关键职责或岗位核心要求。
2. Experience Draft Pool 缺口强度：当前经历池是完全没写、写得很弱、写得很泛，还是虽然提到但整体支撑不足。

severity 使用 1-10 的整数。

【主问题设计规则】

每个 Gap 只允许输出 1 个主问题 mainQuestion。

这个主问题必须：
- 尽量一次性收集补足该差距所需的关键信息
- 使用自然、白话、像靠谱简历顾问会说的话
- 不要太机械
- 不要诱导用户编造信息
- 可以鼓励用户提供：具体动作、对象、流程、方法、工具、结果、数据、大概范围、替代性证据

【回答引导 howToAnswer 设计规则】

howToAnswer 是给用户的回答提示，必须是字符串数组。

要求：
- 2 到 4 条最合适
- 每条都是用户容易理解的白话提示
- 帮助用户知道可以从哪些角度回答
- 可以提到“没有精确数据也可以给大概范围”“如果没有结果可以说完整流程”之类
- 不要要求用户虚构信息

【返回 JSON 结构】

{
  "versionId": "string，与输入 Version ID 一致",
  "overallAssessment": "一句总体判断",
  "gaps": [
    {
      "gapId": "gap_001",
      "gapType": "missing_jd_keyword | missing_related_action | missing_business_result | missing_metric | missing_method_or_tool | generic_expression",
      "gapTitle": "差距标题",
      "severity": 1,
      "whyThisGap": "为什么这是当前最值得优先处理的差距",
      "gapDescription": "当前经历池与 Target JD 之间缺失的关键信息或表达",
      "mainQuestion": "面向用户的一个主问题",
      "howToAnswer": ["回答提示1", "回答提示2"],
      "status": "pending"
    }
  ]
}

【字段要求】

- versionId 必须等于输入的 Version ID。
- overallAssessment 必须对整个经历池与目标岗位的匹配情况做一句话总结。
- gaps 最多返回 5 个。
- 可以少于 5 个。
- gapId 从 gap_001 开始递增。
- gapType 必须从指定 6 类中选择。
- gapTitle 必须简洁明确。
- gapDescription 必须说明“整个经历池”相对 Target JD 还缺什么。
- mainQuestion 必须只有 1 个。
- howToAnswer 必须是字符串数组。
- status 固定为 pending。

【输出要求】

- 只输出合法 JSON。
- 不输出解释、备注或 Markdown。
- 不直接改写简历。
- 不输出推荐经历。
- 不输出问题链。
- 不输出 goalCriteria。
- 不输出任何未定义字段。
`.trim();

const GAP_TYPES: GapType[] = [
  "missing_jd_keyword",
  "missing_related_action",
  "missing_business_result",
  "missing_metric",
  "missing_method_or_tool",
  "generic_expression",
];

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
    throw new Error("Gap Analysis API 没有返回内容");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("Gap Analysis API 返回内容不是合法 JSON");
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

function isGapType(value: unknown): value is GapType {
  return typeof value === "string" && GAP_TYPES.includes(value as GapType);
}

function validateStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 必须是数组`);
  }

  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new Error(`${fieldName}[${index}] 必须是非空字符串`);
    }

    return item.trim();
  });
}

function validateExperienceDraftPool(value: unknown): ExperienceDraftPool {
  if (!value || typeof value !== "object") {
    throw new Error("experienceDraftPool 必须是对象");
  }

  const candidate = value as Record<string, unknown>;
  const internships = candidate.internships;
  const projects = candidate.projects;
  const otherExperiences = candidate.other_experiences;

  if (!Array.isArray(internships)) {
    throw new Error("experienceDraftPool.internships 必须是数组");
  }

  if (!Array.isArray(projects)) {
    throw new Error("experienceDraftPool.projects 必须是数组");
  }

  if (!Array.isArray(otherExperiences)) {
    throw new Error("experienceDraftPool.other_experiences 必须是数组");
  }

  return {
    internships,
    projects,
    other_experiences: otherExperiences,
  };
}

function validateGapItem(value: unknown, index: number): GapItem {
  if (!value || typeof value !== "object") {
    throw new Error(`gaps[${index}] 不是对象`);
  }

  const candidate = value as Record<string, unknown>;
  const gapId = candidate.gapId;
  const gapType = candidate.gapType;
  const gapTitle = candidate.gapTitle;
  const severity = candidate.severity;
  const whyThisGap = candidate.whyThisGap;
  const gapDescription = candidate.gapDescription;
  const mainQuestion = candidate.mainQuestion;
  const howToAnswer = candidate.howToAnswer;
  const status = candidate.status;

  if (typeof gapId !== "string" || !gapId.trim()) {
    throw new Error(`gaps[${index}].gapId 无效`);
  }

  if (!isGapType(gapType)) {
    throw new Error(`gaps[${index}].gapType 无效`);
  }

  if (typeof gapTitle !== "string" || !gapTitle.trim()) {
    throw new Error(`gaps[${index}].gapTitle 无效`);
  }

  if (!Number.isInteger(severity) || (severity as number) < 1 || (severity as number) > 10) {
    throw new Error(`gaps[${index}].severity 无效`);
  }

  if (typeof whyThisGap !== "string" || !whyThisGap.trim()) {
    throw new Error(`gaps[${index}].whyThisGap 无效`);
  }

  if (typeof gapDescription !== "string" || !gapDescription.trim()) {
    throw new Error(`gaps[${index}].gapDescription 无效`);
  }

  if (typeof mainQuestion !== "string" || !mainQuestion.trim()) {
    throw new Error(`gaps[${index}].mainQuestion 无效`);
  }

  if (status !== "pending") {
    throw new Error(`gaps[${index}].status 必须为 pending`);
  }

  return {
    gapId: gapId.trim(),
    gapType,
    gapTitle: gapTitle.trim(),
    severity: severity as number,
    whyThisGap: whyThisGap.trim(),
    gapDescription: gapDescription.trim(),
    mainQuestion: mainQuestion.trim(),
    howToAnswer: validateStringArray(howToAnswer, `gaps[${index}].howToAnswer`),
    status: "pending",
  };
}

function validateResponse(value: unknown, expectedVersionId: string): BranchGapAnalysisResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Gap Analysis API 返回结构不是对象");
  }

  const candidate = value as Record<string, unknown>;
  const versionId = candidate.versionId;
  const overallAssessment = candidate.overallAssessment;
  const gaps = candidate.gaps;

  if (typeof versionId !== "string" || !versionId.trim()) {
    throw new Error("versionId 无效");
  }

  if (versionId.trim() !== expectedVersionId) {
    throw new Error("versionId 与输入不一致");
  }

  if (typeof overallAssessment !== "string" || !overallAssessment.trim()) {
    throw new Error("overallAssessment 无效");
  }

  if (!Array.isArray(gaps)) {
    throw new Error("gaps 必须是数组");
  }

  if (gaps.length > 5) {
    throw new Error("gaps 最多只能返回 5 个");
  }

  return {
    versionId: versionId.trim(),
    overallAssessment: overallAssessment.trim(),
    gaps: gaps.map((item, index) => validateGapItem(item, index)),
  };
}

function isRetryableNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("terminated") ||
    message.includes("socket") ||
    message.includes("fetch failed") ||
    message.includes("network")
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "缺少 DEEPSEEK_API_KEY 环境变量" }, { status: 500 });
  }

  let body: BranchGapAnalysisRequest;

  try {
    body = (await request.json()) as BranchGapAnalysisRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const targetJobTitle = stringifyInput(body.targetJobTitle);
  const targetJdJson = body.targetJdJson;
  const resumeRules = body.resumeRules;
  const versionId = stringifyInput(body.versionId) || "draft_v1";

  let experienceDraftPool: ExperienceDraftPool;

  try {
    experienceDraftPool = validateExperienceDraftPool(body.experienceDraftPool);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "experienceDraftPool 校验失败" },
      { status: 400 },
    );
  }

  if (!targetJdJson) {
    return NextResponse.json({ error: "请提供 targetJdJson" }, { status: 400 });
  }

  const model = process.env.DEEPSEEK_BRANCH_GAP_MODEL ?? "deepseek-v4-flash";
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

  const requestBody = JSON.stringify({
    model,
    temperature: 0.2,
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
          "===== Target Job Title =====",
          targetJobTitle || "无",
          "",
          "===== Target JD JSON =====",
          stringifyInput(targetJdJson),
          "",
          "===== Experience Draft Pool =====",
          stringifyInput(experienceDraftPool),
          "",
          "===== Resume Rules =====",
          stringifyInput(resumeRules),
          "",
          "===== Version ID =====",
          versionId,
        ].join("\n"),
      },
    ],
  });

  let response: Response;

  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
  } catch (error) {
    if (!isRetryableNetworkError(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? `Gap Analysis 请求失败：${error.message}` : "Gap Analysis 请求失败" },
        { status: 502 },
      );
    }

    await sleep(500);

    try {
      response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });
    } catch (retryError) {
      return NextResponse.json(
        {
          error:
            retryError instanceof Error
              ? `Gap Analysis 请求失败（重试后仍失败）：${retryError.message}`
              : "Gap Analysis 请求失败（重试后仍失败）",
        },
        { status: 502 },
      );
    }
  }

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
    const result = validateResponse(parsed, versionId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Gap Analysis API 返回解析失败",
        raw: rawResult,
      },
      { status: 502 },
    );
  }
}
