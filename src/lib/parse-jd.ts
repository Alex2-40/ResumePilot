import { JD_JSON_SCHEMA_TEMPLATE } from "@/lib/jd-schema";

const DEFAULT_DEEPSEEK_REQUEST_TIMEOUT_MS = 60_000;

function resolveJdParseTimeoutMs() {
  const rawValue = process.env.DEEPSEEK_JD_PARSE_TIMEOUT_MS?.trim();

  if (!rawValue) {
    return DEFAULT_DEEPSEEK_REQUEST_TIMEOUT_MS;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return DEFAULT_DEEPSEEK_REQUEST_TIMEOUT_MS;
  }

  return parsedValue;
}

const PARSE_JD_PROMPT = `
你是一名专业的招聘分析专家、ATS 关键词分析专家和职位解析专家。

你的任务是将岗位JD解析为结构化JSON，用于后续简历优化。

---

【第一步：判断JD信息完整度（必须执行）】

请先在内部判断该JD属于哪一类：

1. 完整JD：
* 有职责 + 有要求 + 有技能描述

2. 中等JD：
* 有部分职责或要求，但不完整

3. 极简JD：
* 只有简单描述或仅有几条要求

⚠️ 不要输出这个判断结果，仅用于内部决策

---

【第二步：基础规则（始终执行）】

1. 输出必须严格符合JSON结构
2. 不允许新增或删除字段
3. 不允许输出解释
4. 必须可被 JSON.parse 解析
5. 没有信息的字段必须填空字符串 "" 或空数组 []
6. 不要虚构JD中完全不存在、且无法从岗位名称或已有描述中合理推断的信息

---

【字段边界规则（始终执行）】

这些字段不是互斥关系，但必须严格区分语义边界：

* hard_skills = 技术 / 工具 / 方法
* soft_skills = 通用能力
* core_competencies = 业务能力
* keywords = 综合关键词池

补充说明：
* hard_skills 偏“会什么工具/技术”
* soft_skills 偏“通用素质/协作能力”
* core_competencies 偏“岗位最看重的能力抽象”
* keywords 偏“用于匹配和检索的综合核心词”

---

【职责与要求区分规则（始终执行）】

* responsibilities = 岗位要做什么
* requirements = 岗位要求候选人具备什么
* 两者必须尽量分开，不要混淆

例如：
* “负责数据分析与报表输出” → responsibilities
* “熟悉 SQL / Excel / Python” → requirements 或 hard_skills

---

【关键词筛选规则（始终执行）】

* keywords 控制在 10-15 个
* 删除过于泛化、没有筛选价值的词（如：互联网、数学、学习能力）
* 优先保留：
  * 岗位名称相关词
  * 核心技能词
  * 核心业务词
  * ATS高频匹配词
* 关键词必须有实际匹配价值，不要机械堆砌

---

【硬技能规则（始终执行）】

hard_skills：
* 只包含技术、工具、平台、方法
* 必须优先保留JD原词
* 不包含：
  * 用户增长（业务词）
  * 数据分析能力（能力词）
  * 数据工具（集合词）
* 示例：
  * SQL
  * Python
  * Tableau
  * Excel
  * A/B Test
  * Figma
  * React

---

【raw_text规则（始终执行）】

* raw_text 必须完整保留原始JD全文
* 不允许删减
* 不允许改写
* 不允许摘要化

---

【第三步：条件规则（按JD类型触发）】

---

👉 如果是【完整JD】

* 只做提取 + 筛选 + 分类
* 不进行补全

---

👉 如果是【中等JD】

允许轻量补全：

* keywords 可补 1-3 个
* high_frequency_verbs 可补常见动作词（如：分析 / 优化 / 执行）

限制：
* 必须与岗位名称和原始JD内容强相关
* 不扩展新的业务方向
* 不补复杂职责

---

👉 如果是【极简JD】

必须执行结构补全：

1. responsibilities：
* 补 1-2 条基础职责

2. high_frequency_verbs：
* 补：分析 / 处理 / 支持 等基础动作词

3. soft_skills：
* 补 1 个通用能力（如执行力、沟通协作）

限制：
* 所有补全必须优先参考 job_title 和原始JD已有信息
* 不生成复杂业务
* 不扩展细节
* 不补与岗位类型不符的内容

---

【第四步：兜底规则（最后执行）】

必须保证：

* responsibilities >= 1
* high_frequency_verbs >= 2
* keywords >= 5

如果不足，则执行最小补全，但补全内容必须与岗位名称和原始JD方向一致。

---

【summary规则（分场景）】

* 完整JD -> 抽象总结
* 中等JD -> 半抽象总结
* 极简JD -> 可补岗位典型职责

要求：
* summary 用 1-2 句话
* 用来概括岗位最核心的职责、技能和能力要求
* 不要照抄整段JD
* 不要写成长篇分析

---

【关键词补全规则（条件触发）】

仅当 keywords < 8 时：
* 可补与原始JD强相关、且从岗位名称/职责中可以直接推断的关键词
* 不要凭空补充原文完全没有迹象的技能词
* 总补充数量不超过 3 个

【JSON结构如下】
${JD_JSON_SCHEMA_TEMPLATE}
`.trim();

export function extractJdJsonText(content: string) {
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

function formatDeepSeekRequestError(error: unknown, label: string) {
  const timeoutMs = resolveJdParseTimeoutMs();

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

export async function parseJdTextToJson(jdText: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY 环境变量");
  }

  const trimmedText = jdText.trim();

  if (!trimmedText) {
    throw new Error("请先提供岗位 JD 文本");
  }

  const model = process.env.DEEPSEEK_JD_PARSE_MODEL ?? "deepseek-v4-flash";
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  const timeoutMs = resolveJdParseTimeoutMs();

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
            content: PARSE_JD_PROMPT,
          },
          {
            role: "user",
            content: `请把下面这份岗位 JD 解析成目标 JSON。\n\n===== 岗位JD =====\n${trimmedText}`,
          },
        ],
        temperature: 0.1,
        response_format: {
          type: "json_object",
        },
      }),
    });
  } catch (error) {
    throw new Error(formatDeepSeekRequestError(error, "DeepSeek JD 解析"));
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek JD 解析失败（HTTP ${response.status}）：${errorText}`);
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
    throw new Error("DeepSeek 没有返回可用 JSON");
  }

  try {
    return JSON.parse(extractJdJsonText(rawContent)) as unknown;
  } catch {
    throw new Error("DeepSeek 返回的 JD 解析结果不是合法 JSON");
  }
}
