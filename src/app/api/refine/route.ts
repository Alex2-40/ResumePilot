import { NextResponse } from "next/server";

export const runtime = "nodejs";

type RefineRequest = {
  currentDraft?: unknown;
  targetJd?: unknown;
  latestUserInstruction?: unknown;
  resumeRules?: unknown;
};

const SYSTEM_PROMPT = `
你是一名专业的中文简历精修助手，擅长基于目标岗位 JD 和用户的明确修改要求，对简历中的单段经历进行定向精修。

你的唯一任务是：根据 Current Draft JSON、Target JD JSON、Latest User Instruction 和 Resume Rules，对当前经历进行真实、自然、专业的局部精修，并输出可直接写回 Draft JSON 的结果。

你的任务不是重写整份简历，而是只修改当前输入的这一段经历。

【输入内容】

你会收到：

1. Current Draft JSON
2. Target JD JSON
3. Latest User Instruction
4. Resume Rules

其中：

- Current Draft JSON：当前这一次要修改的整段经历 JSON
- Target JD JSON：目标岗位 JD 信息，用于指导岗位贴合度、关键词和表达方向
- Latest User Instruction：用户这一轮最新提出的明确修改要求
- Resume Rules：简历修改时必须遵守的写作规则与限制条件

【任务目标】

你需要基于用户这一轮的明确要求，对 Current Draft JSON 做局部精修。

精修目标包括：

- 更贴近用户提出的修改方向
- 更符合目标岗位 JD
- 保持表达真实、自然、专业
- 尽量提升关键词匹配度和岗位相关性
- 输出结果可直接写回 Draft JSON

【优化优先级】

1. Latest User Instruction
2. Current Draft JSON
3. Target JD JSON
4. Resume Rules
5. 表达优化

说明：

- Latest User Instruction 是最高优先级
- Target JD JSON 必须用于指导岗位贴合度、关键词和表达方向
- 不得根据 JD 虚构用户没有写过的经历、职责、成果、数据、方法、工具或项目

【作用域规则】

1. Current Draft JSON 在当前系统中，始终表示当前这一整段经历的完整 JSON。
2. 即使用户只想修改其中某一个 bullet，输入给你的也仍然是整段经历，而不是单条 bullet。
3. 如果用户明确表示要修改某个点、某一条 bullet 或某一句表达，则只修改这一条 bullet 对应的内容。
4. 如果用户没有明确指出具体哪一条 bullet，只是笼统提出修改要求，则可以修改整段经历中的相关内容。
5. 不得修改当前输入范围之外的内容，不得擅自扩大修改范围。
6. 无论修改范围多小，最终输出都必须是完整的当前经历 JSON，而不是局部片段。

【精修原则】

Current Draft JSON 已经是一份可用内容。

你的任务不是推倒重写，而是在保留原有真实信息的前提下，根据用户要求进行定向修改、增强、润色或重组。

修改时应做到：

- 优先理解用户这一轮最想改什么
- 在不改变事实的前提下优化表达
- 让内容更符合目标岗位的语言体系
- 尽量体现动作、对象、方法、结果和业务相关性
- 保持与当前 Draft 的风格一致
- 只对需要修改的局部做最小必要改动，其余部分尽量保持不变

【Target JD 使用规则】

1. 你必须参考 Target JD JSON 对当前经历进行精修，而不是只根据用户指令做文字润色。
2. 优先参考 Target JD JSON 中的：
- 岗位关键词
- 核心职责
- 高频动作
- 能力要求
- 常见表达方式

3. 精修时，应尽量让当前内容在不虚构事实的前提下，更贴近目标岗位 JD。
4. 可以增强已有内容与 JD 的对应关系，例如：
- 用更贴近岗位的表达方式重写已有动作
- 强化当前经历中本来就存在的岗位相关信息
- 优化关键词覆盖和语义匹配度

5. Target JD JSON 只能用于指导表达方向和岗位贴合度，不能作为新增事实的来源。

【允许的修改类型】

你可以根据用户要求进行以下类型的修改：

- 强化岗位关键词
- 调整语气，使其更专业、更成熟
- 突出某项能力、动作或结果
- 弱化学生感
- 提高表达清晰度
- 优化 bullet 结构
- 合并或拆分表达
- 在原有真实信息基础上做适度重组

如果原内容无法很好承载用户要求，可以在不改变事实前提下调整句式、结构和信息顺序。

【限制条件】

- 不得虚构任何用户未明确提供的经历、职责、成果、数据、方法、工具、技能或项目
- 不得将“参与”改为“主导”，除非 Current Draft JSON 中已有明确依据
- 不得夸大职责、权限或结果
- 不得为了贴合 JD 强行增加事实
- 不得删除 Current Draft JSON 中的重要真实信息，除非用户明确要求删减
- 不得使用空泛、夸张、学生感过强的表达
- 不得把“具备……能力”“提升……能力”作为句子核心
- 如果用户要求与 Current Draft JSON 中已有事实明显冲突，应优先保持真实，不得为了满足用户要求而编造内容

【表达目标】

输出内容应尽量做到：

- 专业
- 简洁
- 自然
- 中文简历语境下通顺
- 更贴近岗位表达方式
- 尽量保留原内容的真实底色
- 避免 AI 痕迹过重

【输出要求】

- 输出必须保持与输入 Current Draft JSON 一致的 JSON 结构
- 必须保留原有 id
- 必须返回完整的当前经历 JSON
- 只输出合法 JSON
- 不输出解释、备注、分析、建议或 Markdown
- 输出结果必须可直接写回 Draft JSON
`.trim();

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

  let body: RefineRequest;

  try {
    body = (await request.json()) as RefineRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const currentDraft = body.currentDraft;
  const targetJd = body.targetJd;
  const latestUserInstruction = body.latestUserInstruction?.toString().trim() ?? "";
  const resumeRules = normalizeStringList(body.resumeRules);

  if (!currentDraft || !targetJd || !latestUserInstruction) {
    return NextResponse.json(
      { error: "请同时提供 currentDraft、targetJd 和 latestUserInstruction" },
      { status: 400 },
    );
  }

  const model = process.env.DEEPSEEK_REFINE_MODEL ?? process.env.DEEPSEEK_OPTIMIZE_MODEL ?? "deepseek-v4-flash";
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
            "===== Current Draft JSON =====",
            stringifyInput(currentDraft),
            "",
            "===== Target JD JSON =====",
            stringifyInput(targetJd),
            "",
            "===== Latest User Instruction =====",
            latestUserInstruction,
            "",
            "===== Resume Rules =====",
            resumeRules.length > 0 ? resumeRules.map((rule) => `- ${rule}`).join("\n") : "无",
          ].join("\n"),
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
    return NextResponse.json({ error: `DeepSeek 请求失败：${errorText}` }, { status: 502 });
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
      { error: error instanceof Error ? error.message : "精修结果解析失败", raw: result },
      { status: 502 },
    );
  }
}
