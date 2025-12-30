// pages/api/studio/download-packet.js
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPacketZip } from "@/lib/studio/build-packet";

// ✅ Prevent Next.js from limiting responses / buffering weirdness
export const config = {
  api: {
    bodyParser: { sizeLimit: "4mb" }, // request body size (small)
    responseLimit: false, // ✅ allow large JSON/headers; zip is uploaded to storage anyway
  },
};

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

// ✅ NEW: cap a tier by another tier (effective = min(viewer, packet))
function capTierBy(viewerTier, packetTier) {
  const v = normalizeTier(viewerTier);
  const p = normalizeTier(packetTier);
  return (TIER_RANK[v] ?? 0) <= (TIER_RANK[p] ?? 0) ? v : p;
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  if (Array.isArray(xf) && xf.length) return String(xf[0]).trim();
  return req.socket?.remoteAddress || null;
}

/* ------------------------------
   ✅ NEW: Page tier logic (matches studios/[slug].js)
--------------------------------*/
const PAGE_TYPE_DEFAULT_TIER = {
  logline: "public",
  pitch_1p: "public",
  synopsis_1page: "public",
  comparable_titles: "public",
  format_rating_audience: "public",
  one_sheet: "public",
  beat_sheet: "priority",
  season1_outline: "priority",
  episode_list: "priority",
  pilot_outline: "priority",
  signature_scene_clip: "priority",
  teaser_trailer: "priority",
  themes_main_hero_villain: "priority",
  trailer_cue_stingers: "priority",
  series_bible: "producer",
  world_rules_factions: "producer",
  timeline: "producer",
  glossary: "producer",
  cast_profiles_arcs: "producer",
  lookbook_pdf: "producer",
  poster_key_art: "producer",
  trailer_storyboard: "producer",
  franchise_roadmap: "producer",
  pilot_script_or_treatment: "producer",
  chain_of_title_rights_matrix: "packaging",
  option_term_sheet_producer_packet: "packaging",
  negotiation: "packaging",
};

function getPageVisibility(p) {
  const md = safeJson(p?.metadata, {});
  const v = String(md?.visibility || "public").toLowerCase();
  return v === "vault" ? "vault" : "public";
}

function getPageAccessTier(p) {
  const md = safeJson(p?.metadata, {});
  // if explicit access_tier exists, honor it
  if (md?.access_tier) return normalizeTier(md.access_tier);

  // vault pages default to packaging (same as UI)
  if (getPageVisibility(p) === "vault") return "packaging";

  // otherwise default by page_type
  const t = safeStr(p?.page_type);
  return normalizeTier(PAGE_TYPE_DEFAULT_TIER[t] || "public");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // ✅ Hard timeout to avoid “infinite hang”
  const HARD_TIMEOUT_MS = 55_000;
  let timeoutFired = false;

  const hardTimeout = setTimeout(() => {
    timeoutFired = true;
    try {
      console.error("download-packet hard timeout fired");
      if (!res.headersSent) res.status(504).json({ error: "Packet build timed out" });
    } catch {}
  }, HARD_TIMEOUT_MS);

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
    const share_token = `packet:${normalizeTier(packet_tier)}`;

    try {
      await supabaseAdmin.from("studio_download_logs").insert({
        universe_id,
        user_id: user_id || null,
        download_kind,
        page_id: null,
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
      console.warn("studio_download_logs insert failed:", e?.message || e);
    }
  }

  try {
    // 1) Auth
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const { data: auth, error: authErr } = await supabaseAdmin.auth.getUser(token);
    const user = auth?.user;
    if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });

    const { universe_id, tier = "producer", mode = "full", include_vault = false } = req.body || {};
    if (!universe_id) return res.status(400).json({ error: "Missing universe_id" });

    const packetTier = normalizeTier(tier);

    // 2) Entitlement
    const { data: ent } = await supabaseAdmin
      .from("studio_entitlements")
      .select("tier,status,expires_at,updated_at")
      .eq("user_id", user.id)
      .eq("universe_id", universe_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const now = new Date();
    const active = ent && ent.status === "active" && (!ent.expires_at || new Date(ent.expires_at) > now);
    const viewerTier = active ? normalizeTier(ent.tier) : "public";

    if (!active || !canAccess(viewerTier, packetTier)) {
      await logPacketAttempt({
        user_id: user.id,
        universe_id,
        viewer_tier: viewerTier,
        required_tier: packetTier,
        is_locked: true,
        packet_tier: packetTier,
      });
      return res.status(403).json({ error: "No access to this packet" });
    }

    // ✅ NEW: Effective tier for THIS packet (prevents higher-tier users from getting extra pages in lower-tier packet)
    const effectiveTier = capTierBy(viewerTier, packetTier);

    // 3) Load pages
    const { data: pages, error: pagesErr } = await supabaseAdmin
      .from("studio_pages")
      .select("*")
      .eq("universe_id", universe_id)
      .eq("status", "published");

    if (pagesErr) throw pagesErr;

    const list = pages || [];

    // 4) Filter by tier + vault rules (matches UI logic)
    const allowVault = !!include_vault && canAccess(effectiveTier, "packaging");

    const allowedPages = list
      .filter((p) => {
        // vault visibility gate
        const vis = getPageVisibility(p);
        if (vis === "vault" && !allowVault) return false;

        // tier gate (IMPORTANT: uses UI default logic)
        const requiredTier = getPageAccessTier(p);
        return canAccess(effectiveTier, requiredTier);
      })
      // stable order (prefer DB sort_order if present)
      .sort((a, b) => {
        const ao = Number(a?.sort_order ?? 9999);
        const bo = Number(b?.sort_order ?? 9999);
        if (ao !== bo) return ao - bo;

        const ad = new Date(a?.updated_at || 0).getTime();
        const bd = new Date(b?.updated_at || 0).getTime();
        if (bd !== ad) return bd - ad;

        return safeStr(a?.title).localeCompare(safeStr(b?.title));
      });

    if (!allowedPages.length) return res.status(404).json({ error: "No pages available" });

    console.log("packet: building zip", {
      universe_id,
      allowedPages: allowedPages.length,
      packetTier,
      viewerTier,
      effectiveTier,
      mode,
      allowVault,
    });

    // 5) Build ZIP
    const zipBuffer = await buildPacketZip({
      pages: allowedPages,
      tier: packetTier,
      mode,
    });

    if (!zipBuffer || zipBuffer.length < 50) {
      throw new Error("ZIP build failed (empty buffer)");
    }

    console.log("packet: zip built", { bytes: zipBuffer.length });

    // 6) Upload
    const path = `studios/${universe_id}/packets/${mode}/${packetTier}${allowVault ? ".vault" : ""}.zip`;

    const { error: uploadErr } = await supabaseAdmin.storage.from("studio").upload(path, zipBuffer, {
      contentType: "application/zip",
      upsert: true,
    });

    if (uploadErr) throw uploadErr;

    // 7) Signed URL
    const { data: signed, error: signErr } = await supabaseAdmin.storage.from("studio").createSignedUrl(path, 60 * 10);

    if (signErr) throw signErr;

    // 8) Log success
    await logPacketAttempt({
      user_id: user.id,
      universe_id,
      viewer_tier: viewerTier,
      required_tier: packetTier,
      is_locked: false,
      file_path: path,
      file_size_bytes: zipBuffer.length,
      packet_tier: packetTier,
      download_kind: "packet_zip",
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ url: signed.signedUrl });
  } catch (e) {
    console.error("download-packet error:", e);

    // If our timeout already fired, don’t double-respond
    if (timeoutFired || res.headersSent) return;

    // Better status mapping
    const msg = safeStr(e?.message || "Server error");
    const code =
      msg.includes("Unauthorized") || msg.includes("Missing auth") ? 401 :
      msg.includes("No access") ? 403 :
      msg.includes("Missing") ? 400 :
      500;

    return res.status(code).json({ error: msg });
  } finally {
    clearTimeout(hardTimeout);
  }
}
