import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";
import type { RenderOptions } from "../../packages/shared/src/schemas/job";

const DEFAULT_TIMEOUT_MS = 30000;

const getTimeoutMs = () => {
  const raw = process.env.RENDER_TIMEOUT_MS;
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
};

export const renderPdf = async ({
  html,
  url,
  options,
}: {
  html: string | null;
  url: string | null;
  options?: RenderOptions | null;
}) => {
  const browser = await playwright.chromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: typeof chromium.headless === "boolean" ? chromium.headless : true,
  });

  try {
    const contextOptions: Record<string, unknown> = {};
    if (options?.auth) {
      contextOptions.httpCredentials = {
        username: options.auth.username,
        password: options.auth.password,
      };
    }
    if (options?.httpHeaders) {
      contextOptions.extraHTTPHeaders = options.httpHeaders;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    if (options?.cookies?.length) {
      await context.addCookies(options.cookies);
    }

    const timeout = getTimeoutMs();
    if (url) {
      await page.goto(url, { waitUntil: "networkidle", timeout });
    } else if (html !== null) {
      await page.setContent(html, { waitUntil: "networkidle", timeout });
    } else {
      throw new Error("Missing html or url to render");
    }

    return await page.pdf({
      printBackground: true,
      format: "A4",
    });
  } finally {
    await browser.close();
  }
};
