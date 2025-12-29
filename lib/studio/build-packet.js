import archiver from "archiver";
import { PassThrough } from "stream";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { buildPagePdf } from "./build-pdf";

/**
 * buildPacketZip({ pages, tier, mode })
 * pages = array of studio_pages rows
 *
 * ✅ FIX 1: Correct stream handling (pipe -> PassThrough, wait for readable "end/close")
 * ✅ FIX 2: Reuse ONE Chromium instance for all pages (perf + stability)
 * ✅ FIX 3: Unique, safe filenames inside zip (no collisions)
 */

const isProd = process.env.NODE_ENV === "production";

function safeStr(v) {
  return String(v ?? "").trim();
}

function slugify(s) {
  return (
    safeStr(s)
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "page"
  );
}

async function resolveExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    const p = await chromium.executablePath();
    if (p) return p;
  } catch {}
  return undefined;
}

export async function buildPacketZip({ pages = [], tier = "producer", mode = "full" } = {}) {
  // --- ZIP stream setup (correct way) ---
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks = [];

  stream.on("data", (d) => chunks.push(d));

  // IMPORTANT: archive is piped to stream
  archive.pipe(stream);

  // archiver warnings are often non-fatal; keep them as console warnings
  archive.on("warning", (err) => {
    console.warn("zip warning:", err?.message || err);
  });

  // ✅ Wait for the readable side to finish emitting all bytes
  const finished = new Promise((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("close", resolve);
    stream.on("error", reject);
    archive.on("error", reject);
  });

  // --- Browser setup (ONE instance) ---
  const executablePath = await resolveExecutablePath();

  // Local dev guard (puppeteer-core needs a real Chrome path locally if chromium.executablePath isn't usable)
  if (!isProd && !executablePath && !process.env.PUPPETEER_EXECUTABLE_PATH) {
    throw new Error(
      "Local PDF build requires Chrome. Set PUPPETEER_EXECUTABLE_PATH to your Chrome/Chromium executable."
    );
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: isProd ? chromium.headless : true,
  });

  try {
    // Sequential is safest for serverless memory; add concurrency later if you want
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];

      // ✅ Unique, safe filename (index + page_type + optional title)
      const pageType = slugify(page?.page_type || `page-${i + 1}`);
      const titlePart = slugify(page?.title || "");
      const name = `${String(i + 1).padStart(2, "0")}-${pageType}${titlePart ? `-${titlePart}` : ""}.pdf`;

      const watermark =
        mode === "preview"
          ? "PREVIEW — MANYAGI STUDIOS"
          : "CONFIDENTIAL — MANYAGI STUDIOS";

      // ✅ Reuse the shared browser via options.browser (buildPagePdf remains backwards compatible)
      const pdf = await buildPagePdf(page, {
        watermark,
        browser,
      });

      archive.append(pdf, { name });
    }

    // Finalize zip AFTER all append() calls
    await archive.finalize();

    // ✅ Do NOT call stream.end() manually — archiver will end the stream.
    await finished;

    return Buffer.concat(chunks);
  } finally {
    await browser.close();
  }
}
