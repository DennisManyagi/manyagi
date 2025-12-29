import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPagePdf } from "./build-pdf";

/**
 * POST /api/studio/download-page
 * body: { universe_id, page_type }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    // 1) Auth
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) throw new Error("Missing auth token");

    const {
      data: { user },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !user) throw new Error("Unauthorized");

    const { universe_id, page_type } = req.body;
    if (!universe_id || !page_type) throw new Error("Missing parameters");

    // 2) Entitlement check
    const { data: ent } = await supabaseAdmin
      .from("studio_entitlements")
      .select("tier,status,expires_at")
      .eq("user_id", user.id)
      .eq("universe_id", universe_id)
      .maybeSingle();

    const now = new Date();
    const valid =
      ent &&
      ent.status === "active" &&
      (!ent.expires_at || new Date(ent.expires_at) > now);

    if (!valid) throw new Error("No active entitlement");

    // 3) Load page
    const { data: page } = await supabaseAdmin
      .from("studio_pages")
      .select("*")
      .eq("universe_id", universe_id)
      .eq("page_type", page_type)
      .eq("status", "published")
      .single();

    if (!page) throw new Error("Page not found");

    // 4) Generate PDF
    const pdfBuffer = await buildPagePdf(page, {
      watermark: "CONFIDENTIAL — MANYAGI STUDIOS",
    });

    // 5) Upload to PRIVATE studio bucket
    const path = `studios/${universe_id}/pages/${page.page_type}.pdf`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("studio")
      .upload(path, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    // 6) Signed URL
    const { data: signed, error: signErr } =
      await supabaseAdmin.storage
        .from("studio")
        .createSignedUrl(path, 60 * 10); // 10 minutes

    if (signErr) throw signErr;

    // 7) (Optional) Download log
    await supabaseAdmin.from("studio_download_logs").insert({
      user_id: user.id,
      universe_id,
      page_type,
      file_path: path,
    });

    return res.json({ url: signed.signedUrl });
  } catch (e) {
    console.error("download-page error:", e);
    return res.status(401).json({ error: e.message });
  }
}
