import puppeteer from "puppeteer";

/**
 * buildPagePdf(page)
 * ------------------
 * Converts a studio_pages row into a studio-grade PDF.
 *
 * page = {
 *   title,
 *   page_type,
 *   content_md,
 *   metadata
 * }
 */
export async function buildPagePdf(page, options = {}) {
  const {
    watermark = null, // e.g. "CONFIDENTIAL – MANYAGI STUDIOS"
    footer = "© Manyagi Studios — All Rights Reserved",
  } = options;

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const pdfPage = await browser.newPage();

  const bodyHtml = renderMarkdown(page.content_md || "");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(page.title || "Studio Page")}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Helvetica Neue", Arial, sans-serif;
      font-size: 12.5px;
      line-height: 1.6;
      color: #111;
      padding: 56px 64px 80px 64px;
    }
    h1 {
      font-size: 26px;
      margin-bottom: 12px;
    }
    h2 {
      font-size: 18px;
      margin-top: 32px;
      margin-bottom: 10px;
    }
    h3 {
      font-size: 15px;
      margin-top: 24px;
      margin-bottom: 8px;
    }
    p {
      margin: 8px 0;
    }
    ul {
      padding-left: 18px;
    }
    li {
      margin-bottom: 6px;
    }
    .kicker {
      text-transform: uppercase;
      letter-spacing: 0.28em;
      font-size: 10px;
      opacity: 0.6;
      margin-bottom: 6px;
    }
    .page-type {
      font-size: 11px;
      opacity: 0.6;
      margin-bottom: 24px;
    }
    footer {
      position: fixed;
      bottom: 18px;
      left: 64px;
      right: 64px;
      font-size: 9px;
      opacity: 0.6;
      text-align: center;
    }
    .watermark {
      position: fixed;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-20deg);
      font-size: 64px;
      color: rgba(0,0,0,0.05);
      white-space: nowrap;
      pointer-events: none;
      z-index: 999;
    }
  </style>
</head>
<body>
  ${watermark ? `<div class="watermark">${escapeHtml(watermark)}</div>` : ""}

  <div class="kicker">Manyagi Studios</div>
  <h1>${escapeHtml(page.title || "")}</h1>
  <div class="page-type">${escapeHtml(page.page_type || "")}</div>

  ${bodyHtml}

  <footer>${escapeHtml(footer)}</footer>
</body>
</html>
`;

  await pdfPage.setContent(html, { waitUntil: "networkidle0" });

  const buffer = await pdfPage.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "40px",
      bottom: "60px",
      left: "40px",
      right: "40px",
    },
  });

  await browser.close();
  return buffer;
}

/* -------------------------
   Helpers
--------------------------*/

function renderMarkdown(md = "") {
  const lines = String(md).split("\n");
  return lines
    .map((line) => {
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) {
        const lvl = h[1].length;
        const tag = lvl === 1 ? "h1" : lvl === 2 ? "h2" : "h3";
        return `<${tag}>${escapeHtml(h[2])}</${tag}>`;
      }
      if (line.trim().startsWith("- ")) {
        return `<li>${escapeHtml(line.replace(/^- /, ""))}</li>`;
      }
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
