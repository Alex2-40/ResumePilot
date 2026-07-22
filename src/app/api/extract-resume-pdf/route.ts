import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const PYTHON_PATH =
  "/Users/alexis/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const SWIFT_PATH = "/usr/bin/swift";
const SWIFT_MODULE_CACHE_PATH = path.join(process.cwd(), ".swift-module-cache");

const EXTRACT_SCRIPT = `
import sys
from pypdf import PdfReader

try:
    import pdfplumber
except Exception:
    pdfplumber = None

file_path = sys.argv[1]
text_parts = []

if pdfplumber is not None:
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text_parts.append(page.extract_text() or "")
    except Exception:
        text_parts = []

text = "\\n".join(part for part in text_parts if part and part.strip())

if not text.strip():
    try:
        reader = PdfReader(file_path)
        text = "\\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        text = ""

sys.stdout.write(text.strip())
`.trim();

const OCR_SCRIPT = `
import Foundation
import AppKit
import PDFKit
import Vision

let filePath = CommandLine.arguments[1]

guard let document = PDFDocument(url: URL(fileURLWithPath: filePath)) else {
    FileHandle.standardError.write(Data("Unable to open PDF".utf8))
    exit(1)
}

func recognizeText(from cgImage: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["zh-Hans", "en-US"]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    try handler.perform([request])

    let observations = request.results ?? []
    return observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\\n")
}

var pageTexts: [String] = []

for pageIndex in 0..<document.pageCount {
    guard let page = document.page(at: pageIndex) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let scale: CGFloat = 2.0
    let width = max(Int(bounds.width * scale), 1)
    let height = max(Int(bounds.height * scale), 1)

    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: width,
        pixelsHigh: height,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        continue
    }

    bitmap.size = NSSize(width: bounds.width, height: bounds.height)

    NSGraphicsContext.saveGraphicsState()
    if let context = NSGraphicsContext(bitmapImageRep: bitmap) {
        NSGraphicsContext.current = context
        NSColor.white.setFill()
        context.cgContext.fill(CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
        context.cgContext.scaleBy(x: scale, y: scale)
        page.draw(with: .mediaBox, to: context.cgContext)
        context.flushGraphics()
    }
    NSGraphicsContext.restoreGraphicsState()

    guard let cgImage = bitmap.cgImage else { continue }

    do {
        let text = try recognizeText(from: cgImage).trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
            pageTexts.append(text)
        }
    } catch {
        continue
    }
}

print(pageTexts.joined(separator: "\\n\\n").trimmingCharacters(in: .whitespacesAndNewlines))
`.trim();

export async function POST(request: Request) {
  let uploadedFile: File | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传 PDF 文件" }, { status: 400 });
    }

    uploadedFile = file;
  } catch {
    return NextResponse.json({ error: "上传内容解析失败" }, { status: 400 });
  }

  if (uploadedFile.type && uploadedFile.type !== "application/pdf") {
    return NextResponse.json({ error: "当前仅支持 PDF 文件" }, { status: 400 });
  }

  const tempFilePath = path.join(os.tmpdir(), `resume-${randomUUID()}.pdf`);
  const tempSwiftPath = path.join(os.tmpdir(), `resume-ocr-${randomUUID()}.swift`);

  try {
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    await fs.writeFile(tempFilePath, buffer);

    const { stdout, stderr } = await execFileAsync(PYTHON_PATH, ["-c", EXTRACT_SCRIPT, tempFilePath], {
      maxBuffer: 20 * 1024 * 1024,
    });

    if (stderr?.trim()) {
      return NextResponse.json({ error: `PDF 文本提取失败：${stderr.trim()}` }, { status: 500 });
    }

    const resumeText = stdout.trim();

    if (resumeText) {
      return NextResponse.json({ resumeText });
    }

    await fs.mkdir(SWIFT_MODULE_CACHE_PATH, { recursive: true });
    await fs.writeFile(tempSwiftPath, OCR_SCRIPT, "utf8");

    const { stdout: ocrStdout, stderr: ocrStderr } = await execFileAsync(
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

    if (ocrStderr?.trim()) {
      return NextResponse.json({ error: `PDF OCR 识别失败：${ocrStderr.trim()}` }, { status: 500 });
    }

    const ocrResumeText = ocrStdout.trim();

    if (!ocrResumeText) {
      return NextResponse.json({ error: "PDF 中没有提取到可用文本" }, { status: 422 });
    }

    return NextResponse.json({ resumeText: ocrResumeText });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: `PDF 文本提取失败：${message}` }, { status: 500 });
  } finally {
    await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
    await fs.rm(tempSwiftPath, { force: true }).catch(() => undefined);
  }
}
