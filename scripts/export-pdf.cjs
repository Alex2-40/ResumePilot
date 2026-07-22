const fs = require("node:fs/promises");
const path = require("node:path");

const PLAYWRIGHT_MODULE_PATH =
  "/Users/alexis/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright";
const CHROME_EXECUTABLE_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  const payloadPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!payloadPath || !outputPath) {
    throw new Error("缺少导出参数。");
  }

  const payloadRaw = await fs.readFile(payloadPath, "utf8");
  const payload = JSON.parse(payloadRaw);
  const html = payload.html?.trim();

  if (!html) {
    throw new Error("缺少可导出的简历内容。");
  }

  const { chromium } = require(PLAYWRIGHT_MODULE_PATH);

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_EXECUTABLE_PATH,
    args: ["--disable-web-security", "--font-render-hinting=none"],
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 794, height: 1123 },
      deviceScaleFactor: 1,
    });

    await page.setContent(html, {
      waitUntil: "networkidle",
    });

    await page.emulateMedia({ media: "print" });

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
