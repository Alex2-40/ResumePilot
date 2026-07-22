import { NextResponse } from "next/server";
import { parseJdTextToJson } from "@/lib/parse-jd";

export const runtime = "nodejs";

type ParseJdRequest = {
  jdText?: string;
};

export async function POST(request: Request) {
  let body: ParseJdRequest;

  try {
    body = (await request.json()) as ParseJdRequest;
  } catch {
    return NextResponse.json({ error: "请求体不是有效 JSON" }, { status: 400 });
  }

  const jdText = body.jdText?.trim();

  if (!jdText) {
    return NextResponse.json({ error: "请先提供岗位 JD 文本" }, { status: 400 });
  }

  try {
    const jdJson = await parseJdTextToJson(jdText);
    return NextResponse.json({ jdJson });
  } catch (error) {
    const message = error instanceof Error ? error.message : "JD 解析失败";
    return NextResponse.json(
      { error: message },
      { status: 502 },
    );
  }
}
