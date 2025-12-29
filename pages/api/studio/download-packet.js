// pages/api/studio/download-packet.js
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPacketZip } from "@/lib/studio/build-packet";

/**
 * NOTE:
 * Your studio_download_logs schema requires:
 * - download_kind (page_pdf | packet_zip)
 * - viewer_tier
 * - required_tier
 * and does NOT have packet_tier.
 *
 * This file fixes logging + enforces tier rules safely.
 */

/* ------------------------------
   Shared tier helpers (safe)
--------------------------------*/
const ACCESS_TIERS = ["public", "priority", "producer", "packaging"];
const TIER_RANK = { public: 0, priority: 1, producer: 2, packaging: 3 };

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

function normalizeTier(t) {
  const v = safeStr(t).toLowerCase();
  return ACCESS_TIERS.includes(v) ? v : "public";
}

function canAccess(viewerTier, requiredTier) {
  return (TIER_RANK[normalizeTier(viewerTier)] ?? 0) >= (TIER_RANK[normalizeTier(requiredTier)] ?? 0);
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  if (Array.isArray(xf) && xf.length) return String(xf[0]).trim();
  return req.socket?.remoteAddress || null;
}

/* ------------------------------
   Packet handler
--------------------------------*/
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // log both success + locked attempts without ever crashing the API
  async function logPacketAttempt({
    user_id,
    universe_id,
    viewer_tier = "public",
    required_tier = "public",
    is_locked = false,
    file_path = null,
    file_size_bytes = null,
    packet_tier = "producer",
    download_kind = "packet_zip",
  }) {
    const ip = getClientIp(req);
    const user_agent = safeStr(req.headers["user-agent"] || "") || null;

    // Your schema doesn't have packet_tier, so we store it in share_token as a tag
    const share_token = `packet:${normalizeTier(packet_tier)}`;

    try {
      await supabaseAdmin.from("studio_download_logs").insert({
        universe_id,
        user_id: user_id || null,
        download_kind, // must match check constraint
        page_id: null, // packet download => no page_id
        viewer_tier: normalizeTier(viewer_tier),
        required_tier: normalizeTier(required_tier),
        is_locked: !!is_locked,
        share_token,
        file_path,
        file_size_bytes,
        ip,
        user_agent,
      });
    } catch (e) {
      // never break the download if logging fails
      console.warn("studio_download_logs insert failed:", e?.message || e);
    }
  }

  try {
    // 1) Auth
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) throw new Error("Missing auth token");

    const { data: auth, error: authErr } = await supabaseAdmin.auth.getUser(token);
    const user = auth?.user;
    if (authErr || !user) throw new Error("Unauthorized");

    // keep your existing inputs, but support future options cleanly
    const { universe_id, tier = "producer", mode = "full", include_vault = false } = req.body || {};
    if (!universe_id) throw new Error("Missing universe_id");

    const packetTier = normalizeTier(tier);

    // 2) Entitlement (✅ bulletproof: pick most recently updated row)
    const { data: ent } = await supabaseAdmin
      .from("studio_entitlements")
      .select("tier,status,expires_at,updated_at")
      .eq("user_id", user.id)
      .eq("universe_id", universe_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    const active =
      ent &&
      ent.status === "active" &&
      (!ent.expires_at || new Date(ent.expires_at) > now);

    const viewerTier = active ? normalizeTier(ent.tier) : "public";

    // must be entitled and entitled tier must cover requested packet tier
    if (!active || !canAccess(viewerTier, packetTier)) {
      await logPacketAttempt({
        user_id: user.id,
        universe_id,
        viewer_tier: viewerTier,
        required_tier: packetTier,
        is_locked: true,
        packet_tier: packetTier,
      });
      throw new Error("No access to this packet");
    }

    // 3) Load studio pages
    const { data: pages, error: pagesErr } = await supabaseAdmin
      .from("studio_pages")
      .select("*")
      .eq("universe_id", universe_id)
      .eq("status", "published");

    if (pagesErr) throw pagesErr;

    const list = pages || [];

    // 4) Filter pages by tier (original behavior preserved, but made safe)
    const allowVault = !!include_vault && canAccess(viewerTier, "packaging");

    const allowedPages = list.filter((p) => {
      const md = safeJson(p?.metadata, {});
      const visibility = safeStr(md?.visibility || "public").toLowerCase();
      if (visibility === "vault" && !allowVault) return false;

      const pageTier = normalizeTier(md?.access_tier || "public");
      return canAccess(viewerTier, pageTier);
    });

    if (!allowedPages.length) throw new Error("No pages available");

    // 5) Build ZIP
    const zipBuffer = await buildPacketZip({
      pages: allowedPages,
      tier: packetTier,
      mode, // harmless if buildPacketZip ignores it
    });

    // 6) Upload (avoid collisions by mode)
    const path = `studios/${universe_id}/packets/${mode}/${packetTier}${allowVault ? ".vault" : ""}.zip`;

    const { error: uploadErr } = await supabaseAdmin.storage.from("studio").upload(path, zipBuffer, {
      contentType: "application/zip",
      upsert: true,
    });

    if (uploadErr) throw uploadErr;

    // 7) Signed URL
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("studio")
      .createSignedUrl(path, 60 * 10);

    if (signErr) throw signErr;

    // 8) Log success (FIXED: no invalid columns, includes required fields)
    await logPacketAttempt({
      user_id: user.id,
      universe_id,
      viewer_tier: viewerTier,
      required_tier: packetTier,
      is_locked: false,
      file_path: path,
      file_size_bytes: zipBuffer?.length ?? null,
      packet_tier: packetTier,
    });

    // ✅ MINIMAL PATCH: prevent any caching of signed URLs
    res.setHeader("Cache-Control", "no-store");
    return res.json({ url: signed.signedUrl });
  } catch (e) {
    console.error("download-packet error:", e);
    // 401 keeps your current behavior; if you want strict semantics: use 403 for locked
    return res.status(401).json({ error: e.message });
  }
}
