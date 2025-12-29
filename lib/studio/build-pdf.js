import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { marked } from "marked";

/**
 * buildPagePdf(page, { watermark, html, browser })
 *
 * ✅ Backward compatible:
 * - If options.browser is NOT provided: launches + closes its own browser (original behavior)
 * - If options.browser IS provided: reuses it (used by build-packet.js for perf)
 */

const isProd = process.env.NODE_ENV === "production";

function safeStr(v) {
  return String(v ?? "").trim();
}

function safeJson(v, fallback = {}) {
  try {
    if (!v) return fallback;
    if (typeof v === "object") return v;
    const parsed = JSON.parse(String(v));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function getStudioBodyHtml(page) {
  const md = safeJson(page?.metadata, {});

  const raw =
    safeStr(page?.content_html) ||
    safeStr(page?.html) ||
    safeStr(page?.content_md) ||
    safeStr(md?.content || md?.body || md?.markdown) ||
    safeStr(page?.content) ||
    "";

  // If it's already HTML-ish, keep it; otherwise treat as markdown.
  const looksLikeHtml =
    raw.includes("<p") ||
    raw.includes("<div") ||
    raw.includes("<h1") ||
    raw.includes("<h2") ||
    raw.includes("<br") ||
    raw.includes("<ul") ||
    raw.includes("<ol") ||
    raw.includes("<li");

  return looksLikeHtml ? raw : marked.parse(raw);
}

// Optional helper: renders your studio page content -> HTML
function buildHtmlFromStudioPage(page, watermark = "") {
  const title = safeStr(page?.title || page?.page_type || "Studio Page");
  const bodyHtml = getStudioBodyHtml(page);
  const wm = safeStr(watermark);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; }
      .watermark {
        position: fixed;
        bottom: 18px;
        right: 24px;
        opacity: 0.15;
        font-size: 12px;
        letter-spacing: 2px;
        text-transform: uppercase;
      }
      h1 { margin: 0 0 16px; font-size: 24px; }
      p { line-height: 1.6; margin: 0 0 10px; }
      ul { margin: 10px 0 10px 20px; }
      ol { margin: 10px 0 10px 20px; }
      li { margin: 6px 0; }
      pre { white-space: pre-wrap; }
      code { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <div>${bodyHtml}</div>
    ${wm ? `<div class="watermark">${wm}</div>` : ""}
  </body>
</html>`;
}

async function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;

  try {
    const p = await chromium.executablePath();
    if (p) return p;
  } catch {
    // ignore
  }

  return undefined;
}

export async function buildPagePdf(page, options = {}) {
  const watermark = safeStr(options?.watermark || "");
  const html = options?.html || buildHtmlFromStudioPage(page, watermark);

  // ✅ Optional shared browser (used by build-packet.js)
  const externalBrowser = options?.browser || null;

  let browser = externalBrowser;
  let ownsBrowser = false;

  if (!browser) {
    const executablePath = await resolveExecutablePath();
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: isProd ? chromium.headless : true,
    });
    ownsBrowser = true;
  }

  try {
    const p = await browser.newPage();

    await p.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
    await p.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await p.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
    });

    await p.close();

    return pdfBuffer;
  } finally {
    // ✅ Only close if we launched it here
    if (ownsBrowser && browser) {
      await browser.close();
    }
  }
}
