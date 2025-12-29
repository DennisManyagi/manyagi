// pages/api/studio/download-page.js
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildPagePdf } from "@/lib/studio/build-pdf";

/**
 * POST /api/studio/download-page
 * body: { universe_id, page_type, mode? }  // mode: "full" | "preview"
 */

/* -----------------------------
   Shared helpers (tier + access)
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
  const vt = normalizeTier(viewerTier);
  const rt = normalizeTier(requiredTier);
  return (TIER_RANK[vt] ?? 0) >= (TIER_RANK[rt] ?? 0);
}

// match your studios/[slug].js behavior
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

function getPageVisibility(page) {
  const md = safeJson(page?.metadata, {});
  const v = String(md?.visibility || "public").toLowerCase();
  return v === "vault" ? "vault" : "public";
}

function getPageAccessTier(page) {
  const md = safeJson(page?.metadata, {});
  // explicit override
  if (md?.access_tier) return normalizeTier(md.access_tier);
  // vault implies packaging
  if (getPageVisibility(page) === "vault") return "packaging";
  // default map by page_type
  const t = safeStr(page?.page_type);
  return normalizeTier(PAGE_TYPE_DEFAULT_TIER[t] || "public");
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  if (Array.isArray(xf) && xf.length) return String(xf[0]).trim();
  return req.socket?.remoteAddress || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // small helper to log both allowed + denied attempts
  async function logDownloadAttempt({
    user_id,
    universe_id,
    page_id = null,
    viewer_tier = "public",
    required_tier = "public",
    is_locked = false,
    file_path = null,
    file_size_bytes = null,
    share_token = null,
    download_kind = "page_pdf",
  }) {
    const ip = getClientIp(req);
    const user_agent = safeStr(req.headers["user-agent"] || "") || null;

    // DO NOT throw if logging fails
    try {
      await supabaseAdmin.from("studio_download_logs").insert({
        universe_id,
        user_id: user_id || null,
        download_kind, // ✅ required by schema
        page_id,       // ✅ FK to studio_pages
        viewer_tier: normalizeTier(viewer_tier),     // ✅ required by schema
        required_tier: normalizeTier(required_tier), // ✅ required by schema
        is_locked: !!is_locked,                      // ✅ required by schema
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
    // 1) Auth (unchanged)
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) throw new Error("Missing auth token");

    const {
      data: { user },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(token);

    if (authErr || !user) throw new Error("Unauthorized");

    const { universe_id, page_type, mode = "full" } = req.body || {};
    if (!universe_id || !page_type) throw new Error("Missing parameters");

    // 2) Entitlement check (✅ bulletproof: always pick latest updated row)
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

    if (!active) {
      throw new Error("No active entitlement");
    }

    // 3) Load page (unchanged query)
    const { data: page } = await supabaseAdmin
      .from("studio_pages")
      .select("*")
      .eq("universe_id", universe_id)
      .eq("page_type", page_type)
      .eq("status", "published")
      .single();

    if (!page) throw new Error("Page not found");

    // ✅ 4) Enforce required tier for THIS page (prevents tier leakage)
    const requiredTier = getPageAccessTier(page);
    const allowed = canAccess(viewerTier, requiredTier);

    if (!allowed) {
      await logDownloadAttempt({
        user_id: user.id,
        universe_id,
        page_id: page.id,
        viewer_tier: viewerTier,
        required_tier: requiredTier,
        is_locked: true,
        download_kind: "page_pdf",
      });
      throw new Error(`Requires ${requiredTier} access`);
    }

    // 5) Generate PDF (same as before, with optional preview watermark)
    const watermark =
      mode === "preview"
        ? "PREVIEW — MANYAGI STUDIOS"
        : "CONFIDENTIAL — MANYAGI STUDIOS";

    const pdfBuffer = await buildPagePdf(page, { watermark });

    // 6) Upload to PRIVATE studio bucket (kept, but path includes mode to avoid collisions)
    const path = `studios/${universe_id}/pages/${mode}/${page.page_type}.pdf`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("studio")
      .upload(path, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    // 7) Signed URL (unchanged)
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("studio")
      .createSignedUrl(path, 60 * 10); // 10 minutes

    if (signErr) throw signErr;

    // ✅ 8) Correct download log (schema-aligned; no fake columns)
    await logDownloadAttempt({
      user_id: user.id,
      universe_id,
      page_id: page.id,
      viewer_tier: viewerTier,
      required_tier: requiredTier,
      is_locked: false,
      download_kind: "page_pdf",
      file_path: path,
      file_size_bytes: pdfBuffer?.length ?? null,
    });

    return res.json({ url: signed.signedUrl });
  } catch (e) {
    console.error("download-page error:", e);
    // 401 keeps your current behavior; if you want strict semantics: use 403 for locked
    return res.status(401).json({ error: e.message });
  }
}
