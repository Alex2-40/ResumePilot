import { NextResponse } from "next/server";

const DEFAULT_DEEPSEEK_REQUEST_TIMEOUT_MS = 60_000;

function resolveResumeParseTimeoutMs() {
  const rawValue = process.env.DEEPSEEK_RESUME_PARSE_TIMEOUT_MS?.trim();

  if (!rawValue) {
    return DEFAULT_DEEPSEEK_REQUEST_TIMEOUT_MS;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_DEEPSEEK_REQUEST_TIMEOUT_MS;
  }

  return parsedValue;
}

export const runtime = "nodejs";

type ParseResumeRequest = {
  resumeText?: string;
};

const RESUME_JSON_SCHEMA = `{
  "basic_info": {
    "name": "",
    "phone": "",
    "email": "",
    "target_role": "",
    "portfolio": "",
    "github": "",
    "political_status": ""
  },
  "education": [
    {
      "school": "",
      "degree": "",
      "major": "",
      "start_date": "",
      "end_date": "",
      "gpa": "",
      "ranking": "",
      "courses": [],
      "honors": []
    }
  ],
  "internships": [
    {
      "company": "",
      "role": "",
      "start_date": "",
      "end_date": "",
      "bullets": []
    }
  ],
  "projects": [
    {
      "name": "",
      "role": "",
      "start_date": "",
      "end_date": "",
      "bullets": []
    }
  ],
  "other_experiences": [
    {
      "type": "",
      "name": "",
      "role": "",
      "start_date": "",
      "end_date": "",
      "bullets": []
    }
  ],
  "skills": {
    "office_tools": [],
    "data_tools": [],
    "design_tools": [],
    "content_tools": [],
    "ai_tools": [],
    "language_skills": [],
    "certifications": []
  },
  "self_summary": ""
}`;

const PARSE_PROMPT = `
你是一个专业的中文简历结构化解析助手（Resume Parser）。

你的任务是把用户提供的原始简历文本，提取并整理成固定 JSON 结构。

这份 JSON 的主要用途不是直接展示给用户，而是：

1. 预填前端的结构化简历表单
2. 作为后续文本简历优化的结构化输入
3. 作为后续 AI 定向修改的底层数据来源

因此，你的核心目标不是“写总结”，而是：
尽可能把原始简历中的内容准确拆解，并映射到对应字段中。

你必须严格遵守以下要求：

【总体要求】
- 只输出合法 JSON
- 不要输出 Markdown 代码块
- 不要输出解释、分析、备注
- 不要添加 schema 中不存在的字段
- 没有的信息请保留为空字符串、空数组或空对象对应字段
- 尽量根据原文提取真实信息，不要编造
- bullets 必须是字符串数组
- 日期字段统一保留原文表达，不要擅自改写格式
- 当前任务是“结构化解析”，不是“润色”、不是“优化”、不是“总结”

【解析目标】
你的输出必须尽量服务“表单预填”：
- 能直接填进表单的字段，优先拆出来
- 不要把本应进入主字段的信息随意丢到其他字段
- 不要把多条经历压缩成总结
- 不要改写原始 bullet
- 要尽量保留原始经历内容的颗粒度

【字段提取优先级】
请优先确保以下字段的提取准确性：

第一优先级：
- basic_info.name
- basic_info.phone
- basic_info.email

第二优先级：
- education 中的 school / degree / major / start_date / end_date
- internships 中的 company / role / start_date / end_date / bullets
- projects 中的 name / role / start_date / end_date / bullets

第三优先级：
- basic_info.target_role
- basic_info.portfolio
- basic_info.github
- basic_info.political_status
- education.gpa
- education.ranking
- education.courses
- education.honors
- other_experiences
- skills 各分类
- self_summary

【字段分类规则】

1. basic_info
提取并填写：
- name
- phone
- email
- target_role
- portfolio
- github
- political_status

规则：
- 如果原文未明确出现，不要猜测
- target_role 只有在原文明确写出求职意向时才填写
- portfolio / github 只有原文明确给出链接或明确描述时才填写

2. education
每一段教育经历拆为一个 item，字段包括：
- school
- degree
- major
- start_date
- end_date
- gpa
- ranking
- courses
- honors

规则：
- 每段教育都要尽量拆开
- degree 允许出现：专科 / 本科 / 硕士 / 博士 / 交换项目
- 如果原文出现交换项目、交换生、海外交换等教育阶段信息，可放入 degree = "交换项目"
- 主修课程放入 courses 数组
- 荣誉、奖学金、教育相关奖项优先放入 honors 数组
- ranking 仅在原文明确出现时填写
- 不要自行生成 GPA / 排名

3. internships
每一段工作/实习经历拆为一个 item，字段包括：
- company
- role
- start_date
- end_date
- bullets

规则：
- 优先收纳真实公司/组织中的工作或实习经历
- bullets 必须尽量保持原始条目粒度
- 不要把多条经历合并成一句总结
- 不要润色 bullet
- 不要把 bullet 改写成更正式的表达

4. projects
每一个项目拆为一个 item，字段包括：
- name
- role
- start_date
- end_date
- bullets

规则：
- 项目名称、角色、时间、原始 bullet 尽量拆清楚
- bullets 保持原始粒度
- 不要总结
- 不要改写

5. other_experiences
对于不适合归入 internships 或 projects 的经历，统一放入 other_experiences。
每段拆为一个 item，字段包括：
- type
- name
- role
- start_date
- end_date
- bullets

type 仅允许以下值之一：
- 校园
- 创业
- 自媒体
- 科研
- 比赛

规则：
- 创业类经历 -> type = "创业"
- 科研类经历 -> type = "科研"
- 自媒体/内容账号运营类经历 -> type = "自媒体"
- 校园组织、学生会、社团、志愿活动等 -> type = "校园"
- 比赛、竞赛、挑战赛等 -> type = "比赛"
- 如果无法明确判断，但明显不属于 internships 或 projects，优先保守归为“校园”或最贴近原文的类型
- bullets 仍然保持原始粒度

6. skills
技能必须按以下分类提取：
- office_tools
- data_tools
- design_tools
- content_tools
- ai_tools
- language_skills
- certifications

规则：
- 仅提取原文明确出现的技能/工具/证书/语言
- 不要凭空推断用户掌握某项技能
- 不要用 hard_skills / soft_skills 这种旧结构
- 语言考试、语言等级、语言成绩优先进入 language_skills
- 证书、资格认证、从业资格优先进入 certifications

7. self_summary
仅当原文明确存在“自我评价”“个人总结”“个人优势”等内容时填写
否则留空

规则：
- 不要自行总结
- 不要根据经历推断出一段总结
- 当前任务不是写自我评价，而是提取原文已有内容

【内容保留规则】
- internships.bullets / projects.bullets / other_experiences.bullets 都必须尽量保留原始内容
- 不要润色
- 不要精简
- 不要扩写
- 不要改写
- 不要合并多个 bullet
- 如果原文本身就是按条列出，尽量一条对应一条
- 如果原文是一整段描述，映射后也必须保留为一整段
- 不要为了结构化而擅自拆分原始内容

【保守策略】
- 如果字段信息不确定，不要编造
- 但如果原文已经能明显判断边界，应尽量拆开，而不是整体留空
- 例如：公司 / 岗位 / 时间并列出现时，应尽量分别提取

【输出目标 JSON 结构】
${RESUME_JSON_SCHEMA}
`.trim();

function formatDeepSeekRequestError(error: unknown, label: string) {
  const timeoutMs = resolveResumeParseTimeoutMs();

  if (error instanceof Error) {
    const cause = error.cause as
      | {
          code?: string;
          errno?: string | number;
        }
      | undefined;

    if (error.name === "AbortError") {
      return `${label}请求超时（>${timeoutMs / 1000}s），请稍后重试`;
    }

    const code = cause?.code ?? cause?.errno;

    if (code === "ENOTFOUND") {
      return `${label}请求失败：无法解析 DeepSeek 域名，请检查本机网络或 DNS`;
    }

    if (code === "ECONNREFUSED") {
      return `${label}请求失败：连接被拒绝，请检查 DeepSeek 服务地址是否可用`;
    }

    if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT") {
      return `${label}请求超时，请稍后重试`;
    }

    if (code === "ECONNRESET") {
      return `${label}请求中断，连接被重置，请稍后重试`;
    }

    return `${label}请求失败：${error.message}`;
  }

  return `${label}请求失败：未知网络错误`;
}

function extractJsonText(content: string) {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少 DEEPSEEK_API_KEY 环境变量" },
      { status: 500 },
    );
  }

  let body: ParseResumeRequest;

  try {
    body = (await request.json()) as ParseResumeRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const resumeText = body.resumeText?.trim();

  if (!resumeText) {
    return NextResponse.json({ error: "请先提供原始简历文本" }, { status: 400 });
  }

  const model = process.env.DEEPSEEK_RESUME_PARSE_MODEL ?? "deepseek-v4-flash";
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const timeoutMs = resolveResumeParseTimeoutMs();

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: PARSE_PROMPT,
          },
          {
            role: "user",
            content: `请把下面这份原始简历解析成目标 JSON。\n\n===== 原始简历 =====\n${resumeText}`,
          },
        ],
        temperature: 0.1,
        response_format: {
          type: "json_object",
        },
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: formatDeepSeekRequestError(error, "DeepSeek 简历解析") },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: `DeepSeek 简历解析失败（HTTP ${response.status}）：${errorText}` },
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

  const rawContent = data.choices?.[0]?.message?.content?.trim() ?? "";

  if (!rawContent) {
    return NextResponse.json({ error: "DeepSeek 没有返回可用 JSON" }, { status: 502 });
  }

  try {
    const resumeJson = JSON.parse(extractJsonText(rawContent)) as unknown;
    return NextResponse.json({ resumeJson });
  } catch {
    return NextResponse.json(
      { error: "DeepSeek 返回的解析结果不是合法 JSON" },
      { status: 502 },
    );
  }
}
