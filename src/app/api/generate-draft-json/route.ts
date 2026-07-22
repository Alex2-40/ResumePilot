import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateDraftJsonRequest = {
  optimizedResumeText?: string;
};

const DRAFT_JSON_SCHEMA = `{
  "basic_info": {
    "status": "pending",
    "items": [
      {
        "label": "姓名",
        "value": ""
      },
      {
        "label": "电话",
        "value": ""
      },
      {
        "label": "邮箱",
        "value": ""
      },
      {
        "label": "意向岗位",
        "value": ""
      },
      {
        "label": "作品集",
        "value": ""
      },
      {
        "label": "GitHub",
        "value": ""
      },
      {
        "label": "政治面貌",
        "value": ""
      }
    ]
  },
  "education": {
    "status": "pending",
    "items": [
      {
        "id": "edu_1",
        "school": "",
        "major": "",
        "degree": "",
        "start_date": "",
        "end_date": "",
        "gpa": "",
        "ranking": "",
        "courses": [],
        "honors": []
      }
    ]
  },
  "internships": {
    "status": "pending",
    "items": [
      {
        "id": "internship_1",
        "company": "",
        "role": "",
        "start_date": "",
        "end_date": "",
        "bullets": [
          {
            "id": "internship_1_bullet_1",
            "label": "",
            "content": ""
          }
        ]
      }
    ]
  },
  "projects": {
    "status": "pending",
    "items": [
      {
        "id": "project_1",
        "name": "",
        "role": "",
        "start_date": "",
        "end_date": "",
        "bullets": [
          {
            "id": "project_1_bullet_1",
            "label": "",
            "content": ""
          }
        ]
      }
    ]
  },
  "other_experiences": {
    "status": "pending",
    "items": [
      {
        "id": "other_1",
        "type": "",
        "name": "",
        "role": "",
        "start_date": "",
        "end_date": "",
        "bullets": [
          {
            "id": "other_1_bullet_1",
            "label": "",
            "content": ""
          }
        ]
      }
    ]
  },
  "skills": {
    "status": "pending",
    "items": [
      {
        "label": "",
        "content": ""
      }
    ]
  },
  "personal_advantages": {
    "status": "pending",
    "items": [
      {
        "id": "advantage_1",
        "content": ""
      }
    ]
  }
}`;

const GENERATE_DRAFT_JSON_PROMPT = `
你是一名简历结构化解析专家（Resume Parser）。

我会给你一份已经优化完成的完整简历（纯文本）。
你的任务不是改写简历，而是：在不改变任何内容的前提下，将该简历严格拆解为指定的 Draft JSON 结构。

【核心原则】

1. 禁止改写
- 不要润色、优化、替换词语、调整语序、压缩或扩写
- 必须完全保留原始文本内容

2. 禁止删减
- 每一条经历必须保留
- 每一个 bullet 必须保留
- 原始简历中真实出现的以下模块信息都应尽量保留：
  - basic_info
  - education
  - internships
  - projects
  - other_experiences
  - skills
  - personal_advantages

3. 禁止新增
- 不要补充不存在的内容
- 不要推断缺失字段
- 不要生成新的 bullet
- 不要生成原始简历中不存在的新模块内容

4. 只做结构拆分
- 你的唯一任务是把文本拆成 JSON
- 不是写、不是优化、不是润色、不是总结

【结构拆解规则】

你必须将简历拆解为以下七个模块：
- basic_info
- education
- internships
- projects
- other_experiences
- skills
- personal_advantages

### 1. basic_info
- 提取：姓名、电话、邮箱、意向岗位、作品集、GitHub、政治面貌
- 以 label + value 形式保存
- 没有的信息填 ""
- 不要猜测或补全未明确出现的信息
- 姓名、电话、邮箱优先提取，其余字段仅在原文明确出现时填写

### 2. education
每段教育拆为一个 item，字段包括：
- id
- school
- major
- degree
- start_date
- end_date
- gpa
- ranking
- courses
- honors

规则：
- courses 用于保存课程信息
- honors 用于保存荣誉、奖学金等教育奖励信息
- gpa、ranking 仅在原文明确出现时填写，否则填 ""
- 不要把课程、荣誉、GPA、排名混装
- 所有内容必须来自原文
- 没有课程则 courses 为 []
- 没有荣誉/奖学金则 honors 为 []

### 3. internships
每段实习拆为一个 item，字段包括：
- id
- company
- role
- start_date
- end_date
- bullets

### 4. projects
每段项目拆为一个 item，字段包括：
- id
- name
- role
- start_date
- end_date
- bullets

### 5. other_experiences
每段其他经历拆为一个 item，字段包括：
- id
- type
- name
- role
- start_date
- end_date
- bullets

规则：
- type 用于标识类型，如：校园、创业、自媒体、科研、比赛
- 不要编造 type；若原文不明确，只做最克制、最直接的归类
- 所有内容必须来自原文

### 6. skills
skills 模块用于保存简历文本中“技能工具”部分的内容，字段包括：
- id
- label
- content

规则：
- 尽量按简历文本中的写法直接搬运
- 不要强行改成固定分类
- 不要重新归类、重命名或总结
- 原文有类别名则保留为 label
- 原文是一整段则保留为一条 content
- 原文有多条分类则尽量按分类拆分
- 不要新增原文中不存在的技能、语言或证书

### 7. personal_advantages
字段包括：
- id
- content

规则：
- 只承接原文中已存在的个人优势内容
- 不要额外总结新的优势判断
- 原文有多条则尽量按条拆分
- 原文是一整段则保留为一整段 content

【bullets 拆解规则】
internships、projects、other_experiences 中的每条 bullet 必须拆为：

{
  "id": "",
  "label": "",
  "content": ""
}

规则：
- 如果原始 bullet 形如“标签：正文”
  - label = 冒号前内容
  - content = 冒号后完整内容
- 如果一条 bullet 中有多个冒号，只以第一个冒号为分界点
- content 必须保留第一个冒号之后的全部原文内容
- 如果没有冒号：
  - 前 4-6 个字作为 label（尽量保持原语义）
  - 剩余作为 content
- 不要改写原句
- 不要总结

【顺序保留规则】
- education.items、internships.items、projects.items、other_experiences.items、skills.items、personal_advantages.items 的顺序必须与原始简历文本中的出现顺序一致
- internships.items、projects.items、other_experiences.items 下的 bullets 顺序也必须与原文一致
- 不要重排内容顺序

【id 规则】

* education.items 必须包含 id，如：edu_1、edu_2
* internships.items 必须包含 id，如：internship_1、internship_2
* internships.bullets 必须包含 id，如：internship_1_bullet_1、internship_1_bullet_2
* projects.items 必须包含 id，如：project_1、project_2
* projects.bullets 必须包含 id，如：project_1_bullet_1、project_1_bullet_2
* other_experiences.items 必须包含 id，如：other_1、other_2
* other_experiences.bullets 必须包含 id，如：other_1_bullet_1、other_1_bullet_2
* personal_advantages.items 必须包含 id，如：advantage_1、advantage_2

要求：

* id 必须稳定、清晰、可读
* 不要省略 id
* 不要使用随机字符串

---

【状态字段规则】
- 每个板块必须包含 "status": "pending"
- status 只出现在：
  - basic_info
  - education
  - internships
  - projects
  - other_experiences
  - skills
  - personal_advantages
- 不要在 bullet 上加 status

【输出要求】
1. 只输出 JSON
2. 不要输出 Markdown
3. 不要输出解释或分析
4. JSON 必须合法，可直接 JSON.parse
5. 所有字段必须存在
6. 没有值的字段用 ""、[] 或对应空值结构
7. 不允许输出 null
8. 不允许多余字段
9. 不允许丢字段

【Draft JSON 结构如下】

${DRAFT_JSON_SCHEMA}

字段说明：

* basic_info、education、internships、projects、other_experiences、skills、personal_advantages 是前端确认与交互的板块。应用键和修改键应针对这些板块生效。
* 每个板块只保留一个 status 字段，用于表示该板块当前是否待确认。
* 生成阶段所有板块默认 status 为 "pending"，后续确认流再推动状态变化。
* basic_info.items 用于保存基础信息下的各项内容，每项采用 label + value 形式。
* education.items 用于保存教育背景下的具体内容。
* internships.items 用于保存实习经历下的具体内容。
* projects.items 用于保存项目经历下的具体内容。
* other_experiences.items 用于保存其他经历下的具体内容。
* skills.items 用于保存技能工具部分的具体内容。
* personal_advantages.items 用于保存个人优势部分的具体内容。
* education.items 中的 gpa、ranking、courses、honors 分别用于承接教育补充信息。
* internships.bullets、projects.bullets、other_experiences.bullets 仍需拆分为数组项，便于后端针对用户指定的修改点进行局部优化。
* bullet 不需要设置 status，因为前端不针对单条 bullet 提供应用键或修改键。
* bullet.label 保存该条经历的前置标签。
* bullet.content 保存该条经历的完整正文，不要把 label 重复写进 content。
* skills 模块应尽量按照原始简历文本中的写法直接搬运，不要为了结构化而强行改写为固定技能分类。
* personal_advantages 模块只承接原文中已经存在的个人优势内容，不要额外总结新的优势判断。
* 如果某个字段没有信息，请填空字符串 ""、空数组 []，或对应的空值结构，不要输出 null。

【输入内容】
===== 简历文本 =====
{{textResume}}
`.trim();

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

  let body: GenerateDraftJsonRequest;

  try {
    body = (await request.json()) as GenerateDraftJsonRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const optimizedResumeText = body.optimizedResumeText?.trim();

  if (!optimizedResumeText) {
    return NextResponse.json(
      { error: "请先提供优化后的简历文本" },
      { status: 400 },
    );
  }

  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const model = process.env.DEEPSEEK_DRAFT_JSON_MODEL ?? "deepseek-v4-flash";

  let response: Response;

  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
            content: GENERATE_DRAFT_JSON_PROMPT,
          },
          {
            role: "user",
            content: `请把下面已经优化完成的简历文本拆解成 Draft JSON。\n\n===== 优化后的简历文本 =====\n${optimizedResumeText}`,
          },
        ],
        temperature: 0.1,
        response_format: {
          type: "json_object",
        },
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知网络错误";
    return NextResponse.json(
      { error: `DeepSeek Draft JSON 生成请求失败：${message}` },
      { status: 502 },
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: `DeepSeek Draft JSON 生成失败：${errorText}` },
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
    return NextResponse.json(
      { error: "DeepSeek 没有返回可用 Draft JSON" },
      { status: 502 },
    );
  }

  try {
    const draftResumeJson = JSON.parse(extractJsonText(rawContent)) as unknown;
    return NextResponse.json({ draftResumeJson });
  } catch {
    return NextResponse.json(
      { error: "DeepSeek 返回的 Draft JSON 不是合法 JSON" },
      { status: 502 },
    );
  }
}
