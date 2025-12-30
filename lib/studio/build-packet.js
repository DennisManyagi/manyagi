import archiver from "archiver";
import { PassThrough } from "stream";
import { finished } from "stream/promises";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { buildPagePdf } from "./build-pdf";

/**
 * buildPacketZip({ pages, tier, mode })
 * pages = array of studio_pages rows
 *
 * ✅ FIX: resolve zip correctly (wait for readable "end")
 * ✅ FIX: stable serverless chromium launch
 * ✅ FIX: safer archiver drain + error handling
 *
 * ✅ NEW FIX (empty buffer):
 * - DO NOT silently skip invalid PDFs
 * - Coerce pdf output to Buffer (Buffer | Uint8Array | ArrayBuffer | string)
 * - Throw with exact page filename + root error if PDF build fails
 * - Throw if zero PDFs were added (prevents empty ~22 byte zip)
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

// ✅ Coerce buildPagePdf return type into a Buffer (supports multiple return shapes safely)
function coerceToBuffer(pdfRaw) {
  if (!pdfRaw) return null;
  if (Buffer.isBuffer(pdfRaw)) return pdfRaw;
  if (pdfRaw instanceof Uint8Array) return Buffer.from(pdfRaw);
  if (pdfRaw instanceof ArrayBuffer) return Buffer.from(new Uint8Array(pdfRaw));
  if (typeof pdfRaw === "string") return Buffer.from(pdfRaw);
  return null;
}

export async function buildPacketZip({ pages = [], tier = "producer", mode = "full" } = {}) {
  const archive = archiver("zip", { zlib: { level: 9 } });

  // PassThrough is BOTH writable and readable; we read from it to collect bytes
  const stream = new PassThrough();
  const chunks = [];

  // Collect output
  stream.on("data", (d) => chunks.push(d));

  // Pipe archive -> stream
  archive.pipe(stream);

  // Warnings should not crash
  archive.on("warning", (err) => {
    console.warn("zip warning:", err?.message || err);
  });

  // Hard errors must reject
  const errorPromise = new Promise((_, reject) => {
    archive.on("error", reject);
    stream.on("error", reject);
  });

  // ✅ IMPORTANT: Wait until the readable side ENDS (not "finish")
  // finished(stream) resolves on 'end'/'close' for readable streams.
  const drainPromise = finished(stream);

  const executablePath = await resolveExecutablePath();

  if (!isProd && !executablePath && !process.env.PUPPETEER_EXECUTABLE_PATH) {
    throw new Error(
      "Local PDF build requires Chrome. Set PUPPETEER_EXECUTABLE_PATH to your Chrome/Chromium executable."
    );
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: isProd ? chromium.headless : true,
    defaultViewport: chromium.defaultViewport, // ✅ important on serverless
    ignoreHTTPSErrors: true,
  });

  let added = 0;

  try {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];

      const pageType = slugify(page?.page_type || `page-${i + 1}`);
      const titlePart = slugify(page?.title || "");
      const name = `${String(i + 1).padStart(2, "0")}-${pageType}${titlePart ? `-${titlePart}` : ""}.pdf`;

      const watermark = mode === "preview" ? "PREVIEW — MANYAGI STUDIOS" : "CONFIDENTIAL — MANYAGI STUDIOS";

      let pdfRaw;
      try {
        // buildPagePdf should return something convertible to Buffer
        pdfRaw = await buildPagePdf(page, {
          watermark,
          browser,
          fast: true,
        });
      } catch (e) {
        // ✅ DO NOT silently skip — throw exact failing page name so you know what broke
        throw new Error(`buildPagePdf failed for "${name}": ${e?.message || e}`);
      }

      const pdf = coerceToBuffer(pdfRaw);

      // ✅ If empty/invalid, fail loudly (this is what was producing "empty buffer")
      if (!pdf || pdf.length < 100) {
        throw new Error(`buildPagePdf returned empty/invalid PDF for "${name}" (bytes=${pdf?.length ?? 0})`);
      }

      archive.append(pdf, { name });
      added++;
    }

    // Finalize zip creation
    archive.finalize();

    // ✅ Wait for either an error or full drain
    await Promise.race([Promise.all([drainPromise]), errorPromise]);

    const out = Buffer.concat(chunks);

    // ✅ If we added nothing, this prevents "empty zip" situations from passing through
    if (added === 0) {
      throw new Error("No PDFs were added to the zip (all PDF builds failed).");
    }

    return out;
  } finally {
    try {
      await browser.close();
    } catch {}
  }
}
