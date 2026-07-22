import { NextRequest } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);
const BUNDLED_NODE_PATH =
  "/Users/alexis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node";
const EXPORT_SCRIPT_PATH = path.join(process.cwd(), "scripts/export-pdf.cjs");

type ExportPdfRequest = {
  html?: string;
  fileName?: string;
};

export async function POST(request: NextRequest) {
  let payloadPath = "";
  let outputPath = "";

  try {
    const contentType = request.headers.get("content-type") || "";
    let body: ExportPdfRequest;

    if (contentType.includes("application/json")) {
      body = (await request.json()) as ExportPdfRequest;
    } else {
      const formData = await request.formData();
      body = {
        html: typeof formData.get("html") === "string" ? String(formData.get("html")) : undefined,
        fileName:
          typeof formData.get("fileName") === "string" ? String(formData.get("fileName")) : undefined,
      };
    }

    const html = body.html?.trim();

    if (!html) {
      return Response.json({ error: "缺少可导出的简历内容。" }, { status: 400 });
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "resume-pdf-"));
    payloadPath = path.join(tempDir, "payload.json");
    outputPath = path.join(tempDir, "resume.pdf");

    await fs.writeFile(
      payloadPath,
      JSON.stringify({
        html,
      }),
      "utf8",
    );

    await execFileAsync(BUNDLED_NODE_PATH, [EXPORT_SCRIPT_PATH, payloadPath, outputPath], {
      maxBuffer: 10 * 1024 * 1024,
    });

    const pdf = await fs.readFile(outputPath);

    const fileName = `${(body.fileName || "resume").replace(/[^a-zA-Z0-9-_]/g, "_") || "resume"}.pdf`;

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 导出失败，请稍后再试。";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await Promise.allSettled(
      [payloadPath, outputPath]
        .filter(Boolean)
        .map(async (filePath) => {
          await fs.rm(path.dirname(filePath), { recursive: true, force: true });
        }),
    );
  }
}
