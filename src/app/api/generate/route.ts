import { NextResponse } from "next/server";
import type { JdInput } from "@/lib/jd-schema";

export const runtime = "nodejs";

type GenerateRequest = {
  resume?: string | ResumeInput;
  jd?: string | JdInput;
  userInstruction?: string;
};

type ResumeDateRange = {
  start_date?: string;
  end_date?: string;
};

type ResumeListItem = ResumeDateRange & {
  role?: string;
  bullets?: string[];
};

type ResumeInput = {
  basic_info?: {
    name?: string;
    phone?: string;
    email?: string;
    target_role?: string;
    portfolio?: string;
    github?: string;
    political_status?: string;
  };
  education?: Array<
    ResumeDateRange & {
      school?: string;
      degree?: string;
      major?: string;
      gpa?: string;
      ranking?: string;
      courses?: string[];
      honors?: string[];
    }
  >;
  internships?: Array<
    ResumeListItem & {
      company?: string;
    }
  >;
  projects?: Array<
    ResumeListItem & {
      name?: string;
    }
  >;
  other_experiences?: Array<
    ResumeListItem & {
      type?: string;
      name?: string;
    }
  >;
  skills?: {
    office_tools?: string[];
    data_tools?: string[];
    design_tools?: string[];
    content_tools?: string[];
    ai_tools?: string[];
    language_skills?: string[];
    certifications?: string[];
  };
  self_summary?: string;
};

const PROMPT_TEMPLATE = `
你是一名资深招聘专家、ATS 简历优化顾问和求职策略专家。

我会给你三部分内容：
1. 候选人的 Resume JSON
2. 目标岗位的 JD JSON

你的任务不是简单润色，而是基于 JD JSON 的岗位要求和 Resume JSON 的候选人信息，重构简历表达方式，使其更容易通过 ATS 筛选，并更容易被 HR 快速判断为“高度匹配”。

你必须严格遵守以下原则：

【总目标】
- 输出一份更符合目标岗位的高质量优化简历
- 显著提升 JD 匹配度
- 提高 ATS 关键词命中率
- 强化结果表达、专业表达和岗位贴合度
- 保证整体风格像真实招聘专家修改过的简历
- 当前阶段的目标是生成一份高质量 Draft 的文本基础，而不是过早做最终删减
- 在保证岗位匹配度的前提下，尽量保留 Resume JSON 中有价值、可被优化的内容颗粒度
- 不要因为追求极致精简而提前删除后续可能需要被用户确认、修改或保留的内容
- 但也不要机械保留所有内容；对于明显重复、明显无关、或无法形成有效岗位叙事的内容，可谨慎弱化或不作为重点输出
- 不输出分析过程，只输出最终简历

【信息来源优先级】
你将收到结构化后的 Resume JSON 和 JD JSON。

它们是当前任务的主要信息来源，必须优先使用结构化字段进行判断和改写，不要脱离结构化数据自由发挥。

信息使用优先级如下：

第一层：结构化字段
- Resume JSON 是候选人的核心事实来源
- JD JSON 是岗位要求的核心判断来源

第二层：raw_text
- JD JSON 中的 raw_text 仅作为语境补充和原词参考
- 当结构化字段信息不足时，可以参考 raw_text 理解上下文
- 不要让 raw_text 推翻已存在的结构化字段判断

第三层：合理推断
- 仅当 Resume JSON 或 JD JSON 中存在明确关联线索时，才允许进行克制推断
- 推断只能用于补强表达，不能用于编造事实
- 不允许凭空补充不存在的公司、职位、学历、证书、项目或复杂技能场景

如果 Resume JSON 中某些字段为空：
- 不要编造信息
- 不要自行补充不存在的公司、职位、学历、证书、项目

【输出结构规则】
必出：
1. 基本信息
2. 教育背景

按优先级、有内容才出：
3. 实习经历
4. 项目经历
5. 其他经历
6. 技能工具
7. 个人优势

【Resume JSON 使用规则】

1. basic_info
- 用于生成基本信息
- 只做规范化整理
- 不做过度包装
- 优先保留：name、phone、email
- target_role、portfolio、github、political_status 有内容则输出

2. education
- 用于生成教育背景
- 每段教育都应尽量保留并优化表达
- 优先保留：school、degree、major、start_date、end_date
- gpa、ranking、courses、honors 有内容则输出
- 不要因为教育信息较弱就省略该模块

3. internships
- 用于生成实习经历
- 是重点优化模块
- 每段实习都应尽量保留并优化，不要因为已有更强项目经历而省略
- 重点使用：company、role、start_date、end_date、bullets

4. projects
- 用于生成项目经历
- 是重点优化模块
- 每个项目都应尽量保留并优化，不要因为已有更强实习经历而省略
- 重点使用：name、role、start_date、end_date、bullets

5. other_experiences
- 用于生成其他经历
- 包括：校园、创业、自媒体、科研、比赛
- other_experiences 不再视为边角补充内容
- 在当前生成阶段，other_experiences 与 internships、projects 一样，都是正式重点模块
- 只要内容真实存在、具备可优化空间、且对岗位叙事、能力证明或岗位匹配有帮助，就应认真展开和优化
- 不要因为已有实习经历或项目经历，就默认弱化或省略 other_experiences
- 展示时不要写“其他经历”，而要按 type 改成对应名称：
  - 校园 -> 校园经历
  - 创业 -> 创业经历
  - 自媒体 -> 自媒体经历
  - 科研 -> 科研经历
  - 比赛 -> 比赛经历

6. skills
- skills 必须作为单独的“技能工具”模块输出
- JD JSON 中出现的关键技能必须全部纳入技能工具模块，无论 Resume JSON 中是否原本明确出现
- Resume JSON 中已有的技能也应一并整合进技能工具模块
- 能与经历自然匹配的技能，尽量融入 internships / projects / other_experiences
- 不能自然融入的技能，直接保留在技能工具模块中
- skills 可以基于 JD JSON 进行强化，不必严格受限于 Resume JSON 中已有的原始表述方式
- 只要不越过明显真实性边界，skills 可以承担补足岗位匹配度、增强简历完整性和补充简历篇幅的作用
- skills 包含：
  - office_tools
  - data_tools
  - design_tools
  - content_tools
  - ai_tools
  - language_skills
  - certifications

7. self_summary
- 仅作为辅助参考
- 有真实、有价值的内容时可提炼为个人优势
- 不要机械照抄
- 不要替代真实经历内容
- 个人优势可以基于 JD JSON 进行强化，不必严格受限于 Resume JSON 中已有的原始表述方式
- 只要不越过明显真实性边界，个人优势可以承担补足岗位匹配度、增强简历完整性和补充简历篇幅的作用

【模块保留原则】
- basic_info、education、internships、projects、other_experiences 中，只要存在真实内容，就应尽量优化并输出
- 不要因为某个模块内容更强，就省略另一个已有真实内容的模块
- 当前阶段应优先保留内容颗粒度，而不是过早做删减

【JD JSON 使用优先级】
改写简历时，应按以下分层优先级使用 JD JSON：

第一层：核心锚点
1. responsibilities
- 用于判断岗位主要做什么
- 简历经历应尽量贴近这些职责方向

2. hard_skills
- 如 SQL、Python、Excel、A/B Test、React 等
- 用于提升 ATS 硬技能命中率
- 必须优先考虑命中和自然融入

第二层：匹配强化
3. keywords
- 用于自然提升 ATS 关键词覆盖
- 只能补充覆盖，不能机械堆砌

4. core_competencies
- 用于强化经历背后的能力表达
- 如数据分析能力、用户增长能力、项目推进能力等
- 必须通过具体经历体现，不能空泛喊口号

5. high_frequency_verbs
- 用于调整动作表达
- 优先使用 JD 中出现的原词，如“分析”“推动”“优化”“协调”“执行”

第三层：辅助信号
6. soft_skills
- 只能通过具体经历间接体现
- 不要直接写成空泛评价

【JD 精准匹配规则】
- 对于 JD JSON 中明确出现的岗位关键词、技能词、动作词和平台词，必须直接使用原词
- 不能替换为同义词、近义词或更泛化的表达
- 关键词必须自然融入具体经历和成果描述中，不允许生硬堆砌

【重点改写范围】
- 重点优化：实习经历、项目经历、其他经历
- 教育背景和基本信息只做必要整理

【JD字段落地与经历优化规则】
生成简历时，不允许只做通用润色，必须将 JD JSON 中的高价值字段自然落地到“实习经历”“项目经历”“其他经历”中。

每段重点经历应尽量覆盖多个 JD 高价值字段，优先覆盖以下内容：
- 1 个 responsibilities 对应动作
- 1-2 个 keywords
- 1 个 high_frequency_verbs

在有依据或合理关联时，再补充以下内容：
- 1 个 hard_skills 或低风险相关技能表达
- 1 个 core_competencies 对应能力体现

如果某个字段无法安全使用，可以跳过，但不得编造不存在的经历、工具或技能。

应优先根据 JD JSON 的职责、关键词和能力要求，对经历进行更具体、更贴近岗位的表达，而不是只做普通润色。

对于 hard_skills 的使用，必须遵守以下规则：
1. 如果 Resume JSON 中有直接依据，应优先自然落地该 hard_skills
2. 如果没有直接依据，但存在合理关联，可转化为低风险相关表达
3. 如果完全没有依据，不得编造工具使用经历或技能掌握程度

例如：
对于 JD 中出现但 Resume JSON 没有直接依据的工具或技能，如 SQL、Salesforce、HubSpot、Tableau、Power BI，不得编造使用经历。可以根据真实经历使用低风险相关表达，例如“数据整理”“客户信息归纳”“资料体系标准化”“数据可视化分析支持”。

【改写方向提示】
改写时应优先把通用经历表述提升为更贴近岗位场景的业务表达，例如把泛化的“分析、协作、策划、支持”改写为更具体的目标对象、业务动作和应用场景。

【关键硬技能体现规则】
如果 JD JSON 中存在关键 hard_skills，必须按以下规则处理：

第一档：有直接依据
如果 Resume JSON 的 internships、projects、other_experiences、skills 中已有明确相关依据：
- 可以自然强化该技能
- 可使用“使用”“基于”“通过”等表达
- 可以更明确地写入相关经历

第二档：有间接依据
如果 Resume JSON 中没有明确写出，但相关经历存在合理关联：
- 可以克制地补入
- 优先使用“参与”“协助”“支持”“配合”“基于”等低风险表达
- 只能作为弱化表达补强，不要写成熟练掌握或主导负责

第三档：无明显依据
如果完全没有相关依据：
- 不要强行写成掌握、负责或主导
- 不要编造复杂技能应用场景

【结果导向与量化表达】
- 所有经历都要尽量写成结果导向，而不是过程导向
- 优先强调：
  - 做了什么
  - 解决了什么问题
  - 产生了什么结果
  - 结果能否量化
- 如果 Resume JSON 中已有数字、比例、规模、提升幅度、项目数量、效率变化等信息，必须优先保留并强化表达
- 如果原始信息没有数字，可以增强成果表达，但不要编造具体数字

【经历表达风格】
- 改写后的语言必须简洁、专业、有说服力、强结果导向、强业务感、强岗位匹配度
- 避免空泛、自我感动式、缺乏案例和结果支撑的表达
- 不要写出学生式表述，例如：
  - “在这段经历中学习到了……”
  - “锻炼了……能力”
  - “提高了……能力”
  - “让我收获很多……”
- 类似的成长感悟式、自我评价式、能力空喊式表达都不要写
- 经历必须尽量落在真实行动、对象、方法、产出和结果上

【经历表达风格补充规则】
- 不要把“能力判断”写成句子的核心表达
- 避免直接写“具备……能力”“强化……能力”“培养……能力”“提升……能力”“表现成熟”“擅长……”等结论性表达
- 除非该判断后面紧接明确的事实、动作和结果支撑，否则应改写为具体行动、对象、方法、产出和结果

【四字真言规则】
- 在实习经历和项目经历中，每一条 bullet 的开头，尽量使用一个简洁明确的四字标签
- 优先采用“动词 + 名词”结构
- 必须贴合该条经历内容和 JD 方向
- 不能为了凑格式生造词语
- 示例：数据分析、项目推进、用户增长、内容运营

【ATS 友好规则】
- 输出必须适合 ATS 解析
- 使用清晰纯文本结构
- 不使用复杂分栏、表格、Markdown 代码块或分析说明
- 不使用影响解析的装饰性格式

【真实性与风险控制】
- 对关键技能的补入要自然、克制、合理
- 不把“参与”写成“主导”，除非 Resume JSON 明确支持
- 不添加明显不符合身份和权限的夸大表述

【输出要求】
请直接输出一份优化后的完整简历文本。
- 不要输出分析过程
- 不要输出解释说明
- 不要输出“优化建议”或“修改思路”
- 不要输出任何额外备注

===== Resume JSON =====
{{resumeJson}}

===== JD JSON =====
{{jdJson}}
`.trim();

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function compactTextList(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter(isNonEmptyString).map((item) => item.trim());
}

function formatDateRange(startDate?: string, endDate?: string) {
  const start = startDate?.trim();
  const end = endDate?.trim();

  if (start && end) {
    return `${start} - ${end}`;
  }

  return start ?? end ?? "";
}

function formatBullets(bullets: unknown) {
  return compactTextList(bullets)
    .map((bullet) => `- ${bullet}`)
    .join("\n");
}

function formatResumeSection(title: string, entries: string[]) {
  const validEntries = entries.filter((entry) => entry.trim().length > 0);

  if (validEntries.length === 0) {
    return "";
  }

  return [`${title}:`, ...validEntries].join("\n");
}

function formatResumeObject(resume: ResumeInput) {
  const sections: string[] = [];

  const basicInfo = resume.basic_info;
  if (basicInfo) {
    const basicFields = [
      isNonEmptyString(basicInfo.name) ? `姓名：${basicInfo.name.trim()}` : "",
      isNonEmptyString(basicInfo.phone) ? `电话：${basicInfo.phone.trim()}` : "",
      isNonEmptyString(basicInfo.email) ? `邮箱：${basicInfo.email.trim()}` : "",
      isNonEmptyString(basicInfo.target_role)
        ? `意向岗位：${basicInfo.target_role.trim()}`
        : "",
      isNonEmptyString(basicInfo.portfolio) ? `作品集：${basicInfo.portfolio.trim()}` : "",
      isNonEmptyString(basicInfo.github) ? `GitHub：${basicInfo.github.trim()}` : "",
      isNonEmptyString(basicInfo.political_status)
        ? `政治面貌：${basicInfo.political_status.trim()}`
        : "",
    ].filter(Boolean);

    if (basicFields.length > 0) {
      sections.push(`基本信息:\n${basicFields.join(" | ")}`);
    }
  }

  if (isNonEmptyString(resume.self_summary)) {
    sections.push(`个人优势:\n${resume.self_summary.trim()}`);
  }

  const educationSection = formatResumeSection(
    "教育背景",
    (resume.education ?? []).map((item) => {
      const headline = [
        isNonEmptyString(item.school) ? item.school.trim() : "",
        isNonEmptyString(item.degree) ? item.degree.trim() : "",
        isNonEmptyString(item.major) ? item.major.trim() : "",
      ]
        .filter(Boolean)
        .join(" | ");
      const dateRange = formatDateRange(item.start_date, item.end_date);
      const gpa = isNonEmptyString(item.gpa) ? `GPA：${item.gpa.trim()}` : "";
      const ranking = isNonEmptyString(item.ranking) ? `排名：${item.ranking.trim()}` : "";
      const courses = compactTextList(item.courses);
      const honors = compactTextList(item.honors);
      const extraLines = [
        dateRange,
        gpa,
        ranking,
        courses.length > 0 ? `课程：${courses.join("、")}` : "",
        honors.length > 0 ? `荣誉：${honors.join("、")}` : "",
      ].filter(Boolean);

      return [headline, ...extraLines].filter(Boolean).join("\n");
    }),
  );
  if (educationSection) {
    sections.push(educationSection);
  }

  const internshipSection = formatResumeSection(
    "实习经历",
    (resume.internships ?? []).map((item) => {
      const headline = [
        isNonEmptyString(item.company) ? item.company.trim() : "",
        isNonEmptyString(item.role) ? item.role.trim() : "",
      ]
        .filter(Boolean)
        .join(" | ");
      const dateRange = formatDateRange(item.start_date, item.end_date);
      const bullets = formatBullets(item.bullets);

      return [headline, dateRange, bullets].filter(Boolean).join("\n");
    }),
  );
  if (internshipSection) {
    sections.push(internshipSection);
  }

  const projectSection = formatResumeSection(
    "项目经历",
    (resume.projects ?? []).map((item) => {
      const headline = [
        isNonEmptyString(item.name) ? item.name.trim() : "",
        isNonEmptyString(item.role) ? item.role.trim() : "",
      ]
        .filter(Boolean)
        .join(" | ");
      const dateRange = formatDateRange(item.start_date, item.end_date);
      const bullets = formatBullets(item.bullets);

      return [headline, dateRange, bullets].filter(Boolean).join("\n");
    }),
  );
  if (projectSection) {
    sections.push(projectSection);
  }

  const otherExperienceSection = formatResumeSection(
    "其他经历",
    (resume.other_experiences ?? []).map((item) => {
      const headline = [
        isNonEmptyString(item.type) ? item.type.trim() : "",
        isNonEmptyString(item.name) ? item.name.trim() : "",
        isNonEmptyString(item.role) ? item.role.trim() : "",
      ]
        .filter(Boolean)
        .join(" | ");
      const dateRange = formatDateRange(item.start_date, item.end_date);
      const bullets = formatBullets(item.bullets);

      return [headline, dateRange, bullets].filter(Boolean).join("\n");
    }),
  );
  if (otherExperienceSection) {
    sections.push(otherExperienceSection);
  }

  const officeTools = compactTextList(resume.skills?.office_tools);
  const dataTools = compactTextList(resume.skills?.data_tools);
  const designTools = compactTextList(resume.skills?.design_tools);
  const contentTools = compactTextList(resume.skills?.content_tools);
  const aiTools = compactTextList(resume.skills?.ai_tools);
  const languageSkills = compactTextList(resume.skills?.language_skills);
  const certifications = compactTextList(resume.skills?.certifications);
  if (
    officeTools.length > 0 ||
    dataTools.length > 0 ||
    designTools.length > 0 ||
    contentTools.length > 0 ||
    aiTools.length > 0 ||
    languageSkills.length > 0 ||
    certifications.length > 0
  ) {
    sections.push(
      [
        "技能工具:",
        officeTools.length > 0 ? `办公工具：${officeTools.join("、")}` : "",
        dataTools.length > 0 ? `数据工具：${dataTools.join("、")}` : "",
        designTools.length > 0 ? `设计工具：${designTools.join("、")}` : "",
        contentTools.length > 0 ? `内容工具：${contentTools.join("、")}` : "",
        aiTools.length > 0 ? `AI 工具：${aiTools.join("、")}` : "",
        languageSkills.length > 0 ? `语言能力：${languageSkills.join("、")}` : "",
        certifications.length > 0 ? `证书：${certifications.join("、")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (isNonEmptyString(resume.self_summary)) {
    sections.push(`个人优势:\n${resume.self_summary.trim()}`);
  }

  return sections.join("\n\n").trim();
}

function normalizeResumeInput(resume: GenerateRequest["resume"]) {
  if (typeof resume === "string") {
    return resume.trim();
  }

  if (!resume || typeof resume !== "object" || Array.isArray(resume)) {
    return "";
  }

  return formatResumeObject(resume);
}

function serializeResumeJson(resume: GenerateRequest["resume"]) {
  if (typeof resume === "string") {
    return resume.trim();
  }

  if (!resume || typeof resume !== "object" || Array.isArray(resume)) {
    return "";
  }

  return JSON.stringify(resume, null, 2);
}

function normalizeJdInput(jd: GenerateRequest["jd"]) {
  if (typeof jd === "string") {
    return jd.trim();
  }

  if (!jd || typeof jd !== "object" || Array.isArray(jd)) {
    return "";
  }

  if (isNonEmptyString(jd.raw_text)) {
    return jd.raw_text.trim();
  }

  return [
    isNonEmptyString(jd.job_title) ? `岗位名称：${jd.job_title.trim()}` : "",
    isNonEmptyString(jd.company) ? `公司名称：${jd.company.trim()}` : "",
    compactTextList(jd.hard_skills).length > 0
      ? `硬技能：${compactTextList(jd.hard_skills).join("、")}`
      : "",
    compactTextList(jd.soft_skills).length > 0
      ? `软技能：${compactTextList(jd.soft_skills).join("、")}`
      : "",
    compactTextList(jd.responsibilities).length > 0
      ? `岗位职责：\n- ${compactTextList(jd.responsibilities).join("\n- ")}`
      : "",
    compactTextList(jd.requirements).length > 0
      ? `岗位要求：\n- ${compactTextList(jd.requirements).join("\n- ")}`
      : "",
    compactTextList(jd.keywords).length > 0
      ? `关键词：${compactTextList(jd.keywords).join("、")}`
      : "",
    compactTextList(jd.high_frequency_verbs).length > 0
      ? `高频动词：${compactTextList(jd.high_frequency_verbs).join("、")}`
      : "",
    compactTextList(jd.core_competencies).length > 0
      ? `核心能力：${compactTextList(jd.core_competencies).join("、")}`
      : "",
    isNonEmptyString(jd.experience_level) ? `经验要求：${jd.experience_level.trim()}` : "",
    isNonEmptyString(jd.education_requirement)
      ? `学历要求：${jd.education_requirement.trim()}`
      : "",
    isNonEmptyString(jd.summary) ? `岗位概述：${jd.summary.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function serializeJdJson(jd: GenerateRequest["jd"]) {
  if (typeof jd === "string") {
    return jd.trim();
  }

  if (!jd || typeof jd !== "object" || Array.isArray(jd)) {
    return "";
  }

  return JSON.stringify(jd, null, 2);
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少 DEEPSEEK_API_KEY 环境变量" },
      { status: 500 },
    );
  }

  let body: GenerateRequest;

  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const resume = normalizeResumeInput(body.resume);
  const jd = normalizeJdInput(body.jd);
  const resumeJson = serializeResumeJson(body.resume);
  const jdJson = serializeJdJson(body.jd);
  if (!resume || !jd) {
    return NextResponse.json({ error: "请同时填写原始简历和岗位 JD" }, { status: 400 });
  }

  if (!resumeJson || !jdJson) {
    return NextResponse.json(
      { error: "请提供有效的简历 JSON 和 JD JSON" },
      { status: 400 },
    );
  }

  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-v4-pro";
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";

  const prompt = PROMPT_TEMPLATE
    .replace("{{resumeJson}}", resumeJson)
    .replace("{{jdJson}}", jdJson);

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
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知网络错误";
    return NextResponse.json(
      { error: `DeepSeek 文本简历生成请求失败：${message}` },
      { status: 502 },
    );
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

  const result = data.choices?.[0]?.message?.content?.trim() ?? "";

  if (!result) {
    return NextResponse.json({ error: "DeepSeek 没有返回可用文本" }, { status: 502 });
  }

  return NextResponse.json({ result });
}
