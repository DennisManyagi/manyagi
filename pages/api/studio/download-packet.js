import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPacketZip } from "./build-packet";

const TIER_RANK = { public: 0, priority: 1, producer: 2, packaging: 3 };

function canAccess(viewerTier, pageTier) {
  return (TIER_RANK[viewerTier] ?? 0) >= (TIER_RANK[pageTier] ?? 0);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    // 1) Auth
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) throw new Error("Missing auth token");

    const {
      data: { user },
    } = await supabaseAdmin.auth.getUser(token);

    if (!user) throw new Error("Unauthorized");

    const { universe_id, tier = "producer" } = req.body;
    if (!universe_id) throw new Error("Missing universe_id");

    // 2) Entitlement
    const { data: ent } = await supabaseAdmin
      .from("studio_entitlements")
      .select("tier,status,expires_at")
      .eq("user_id", user.id)
      .eq("universe_id", universe_id)
      .maybeSingle();

    const now = new Date();
    if (
      !ent ||
      ent.status !== "active" ||
      (ent.expires_at && new Date(ent.expires_at) < now) ||
      !canAccess(ent.tier, tier)
    ) {
      throw new Error("No access to this packet");
    }

    // 3) Load studio pages
    const { data: pages } = await supabaseAdmin
      .from("studio_pages")
      .select("*")
      .eq("universe_id", universe_id)
      .eq("status", "published");

    // 4) Filter pages by tier
    const allowedPages = pages.filter((p) => {
      const md = p.metadata || {};
      const pageTier = md.access_tier || "public";
      return canAccess(ent.tier, pageTier);
    });

    if (!allowedPages.length) throw new Error("No pages available");

    // 5) Build ZIP
    const zipBuffer = await buildPacketZip({
      pages: allowedPages,
      tier,
    });

    // 6) Upload
    const path = `studios/${universe_id}/packets/${tier}.zip`;

    await supabaseAdmin.storage
      .from("studio")
      .upload(path, zipBuffer, {
        contentType: "application/zip",
        upsert: true,
      });

    // 7) Signed URL
    const { data: signed } = await supabaseAdmin.storage
      .from("studio")
      .createSignedUrl(path, 60 * 10);

    // 8) Log
    await supabaseAdmin.from("studio_download_logs").insert({
      user_id: user.id,
      universe_id,
      packet_tier: tier,
      file_path: path,
    });

    return res.json({ url: signed.signedUrl });
  } catch (e) {
    console.error("download-packet error:", e);
    return res.status(401).json({ error: e.message });
  }
}
