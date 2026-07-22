import { NextResponse } from "next/server";

export const runtime = "nodejs";

type GenerateCoverLetterRequest = {
  jdJson?: unknown;
  draftJson?: unknown;
  jobTitle?: string;
  internshipDuration?: string;
  companyName?: string;
  systemPrompt?: string;
};

function stringifyInput(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

async function parseDeepSeekJson(response: Response) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {
      ok: false as const,
      error: "DeepSeek 返回为空",
      data: null,
    };
  }

  try {
    return {
      ok: true as const,
      error: "",
      data: JSON.parse(rawText) as {
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
      },
    };
  } catch {
    return {
      ok: false as const,
      error: "DeepSeek 返回格式异常",
      data: null,
    };
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: "缺少 DEEPSEEK_API_KEY 环境变量" }, { status: 500 });
  }

  let body: GenerateCoverLetterRequest;

  try {
    body = (await request.json()) as GenerateCoverLetterRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const jdJson = body.jdJson;
  const draftJson = body.draftJson;
  const jobTitle = body.jobTitle?.trim();
  const internshipDuration = body.internshipDuration?.trim();
  const companyName = body.companyName?.trim() ?? "";
  const systemPrompt = body.systemPrompt?.trim();

  if (!jdJson || !draftJson || !jobTitle || !internshipDuration || !systemPrompt) {
    return NextResponse.json(
      { error: "请同时提供 jdJson、draftJson、jobTitle、internshipDuration 和 systemPrompt" },
      { status: 400 },
    );
  }

  const model = process.env.DEEPSEEK_COVER_LETTER_MODEL ?? "deepseek-v4-flash";
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
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            "===== 第二页表单信息 =====",
            `投递岗位名称：${jobTitle}`,
            `可实习时长：${internshipDuration}`,
            `投递公司名称：${companyName || "未填写"}`,
            "",
            "===== JD JSON =====",
            stringifyInput(jdJson),
            "",
            "===== Draft JSON =====",
            stringifyInput(draftJson),
          ].join("\n"),
        },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json({ error: `DeepSeek 请求失败：${errorText}` }, { status: 502 });
  }

  const parsed = await parseDeepSeekJson(response);

  if (!parsed.ok || !parsed.data) {
    return NextResponse.json({ error: parsed.error || "DeepSeek 返回不可用" }, { status: 502 });
  }

  const result = parsed.data.choices?.[0]?.message?.content?.trim() ?? "";

  if (!result) {
    return NextResponse.json({ error: "DeepSeek 没有返回可用的邮件求职信" }, { status: 502 });
  }

  return NextResponse.json({ result });
}
