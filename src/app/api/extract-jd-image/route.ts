import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { parseJdTextToJson } from "@/lib/parse-jd";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const SWIFT_PATH = "/usr/bin/swift";
const SWIFT_MODULE_CACHE_PATH = path.join(process.cwd(), ".swift-module-cache");

const OCR_SCRIPT = `
import Foundation
import AppKit
import Vision

let filePath = CommandLine.arguments[1]

guard let image = NSImage(contentsOfFile: filePath) else {
    FileHandle.standardError.write(Data("Unable to open image".utf8))
    exit(1)
}

var rect = CGRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    FileHandle.standardError.write(Data("Unable to convert image".utf8))
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["zh-Hans", "en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
    try handler.perform([request])
    let observations = request.results ?? []
    let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\\n")
    print(text.trimmingCharacters(in: .whitespacesAndNewlines))
} catch {
    FileHandle.standardError.write(Data(error.localizedDescription.utf8))
    exit(1)
}
`.trim();

function normalizeOcrText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  let uploadedFile: File | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传岗位 JD 图片" }, { status: 400 });
    }

    uploadedFile = file;
  } catch {
    return NextResponse.json({ error: "上传内容解析失败" }, { status: 400 });
  }

  const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
  const hasValidName = /\.(png|jpe?g|webp)$/i.test(uploadedFile.name);

  if ((uploadedFile.type && !allowedTypes.has(uploadedFile.type)) || (!uploadedFile.type && !hasValidName)) {
    return NextResponse.json({ error: "当前仅支持 PNG、JPG、JPEG 或 WEBP 图片" }, { status: 400 });
  }

  const extension = path.extname(uploadedFile.name) || ".png";
  const tempFilePath = path.join(os.tmpdir(), `jd-image-${randomUUID()}${extension}`);
  const tempSwiftPath = path.join(os.tmpdir(), `jd-image-ocr-${randomUUID()}.swift`);

  try {
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    await fs.writeFile(tempFilePath, buffer);
    await fs.mkdir(SWIFT_MODULE_CACHE_PATH, { recursive: true });
    await fs.writeFile(tempSwiftPath, OCR_SCRIPT, "utf8");

    const { stdout, stderr } = await execFileAsync(
      SWIFT_PATH,
      ["-module-cache-path", SWIFT_MODULE_CACHE_PATH, tempSwiftPath, tempFilePath],
      {
        env: {
          ...process.env,
          SWIFT_MODULE_CACHE_PATH,
        },
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    if (stderr?.trim()) {
      return NextResponse.json({ error: `JD 图片 OCR 识别失败：${stderr.trim()}` }, { status: 500 });
    }

    const jdText = normalizeOcrText(stdout);

    if (!jdText) {
      return NextResponse.json({ error: "JD 图片中没有识别到可用文本" }, { status: 422 });
    }

    const jdJson = await parseJdTextToJson(jdText);
    return NextResponse.json({ jdJson });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: `JD 图片识别失败：${message}` }, { status: 500 });
  } finally {
    await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
    await fs.rm(tempSwiftPath, { force: true }).catch(() => undefined);
  }
}
