import archiver from "archiver";
import { buildPagePdf } from "./build-pdf";

/**
 * buildPacketZip(pages, tier)
 * pages = array of studio_pages rows
 */
export async function buildPacketZip({ pages = [], tier = "producer" }) {
  return new Promise(async (resolve, reject) => {
    try {
      const archive = archiver("zip", { zlib: { level: 9 } });
      const chunks = [];

      archive.on("data", (d) => chunks.push(d));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);

      for (const page of pages) {
        const pdf = await buildPagePdf(page, {
          watermark: "CONFIDENTIAL — MANYAGI STUDIOS",
        });

        archive.append(pdf, {
          name: `${page.page_type}.pdf`,
        });
      }

      await archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}
