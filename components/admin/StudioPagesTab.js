// components/admin/StudioPagesTab.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

function clampInt(v, fallback = 0) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function safeJsonParse(str, fallback = {}) {
  try {
    if (!str || !String(str).trim()) return fallback;
    const v = JSON.parse(str);
    return v && typeof v === "object" ? v : fallback;
  } catch {
    return fallback;
  }
}

function asStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr || []) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function extFromName(name = "") {
  const s = String(name || "").trim();
  const idx = s.lastIndexOf(".");
  return idx >= 0 ? s.slice(idx + 1).toLowerCase() : "";
}

function guessKindFromUrl(url = "") {
  const u = String(url || "").toLowerCase();
  const ext = extFromName(u.split("?")[0]);
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (["mp3", "wav", "m4a", "aac", "ogg"].includes(ext)) return "audio";
  if (["mp4", "mov", "webm", "mkv"].includes(ext)) return "video";
  if (["pdf"].includes(ext)) return "document";
  if (u.includes("youtube.com") || u.includes("youtu.be") || u.includes("vimeo.com")) return "video";
  if (u.includes("spotify.com")) return "audio";
  return "link";
}

function publicUrlForStoragePath(bucket, path) {
  if (!bucket || !path) return "";
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || "";
}

// ------------------------------
// ✅ Page Types
// ------------------------------
const LEGACY_PAGE_TYPES = ["one_sheet", "series_bible", "press_kit", "negotiation", "roadmap", "prompts", "deck_copy"];

// ✅ 25 must-have deliverables (page_type)
const REQUIRED_25_PAGE_TYPES = [
  "logline",
  "pitch_1p",
  "synopsis_1page",
  "comparable_titles",
  "format_rating_audience",
  "beat_sheet",
  "season1_outline",
  "episode_list",
  "pilot_outline",
  "pilot_script_or_treatment",
  "franchise_roadmap",
  "series_bible",
  "world_rules_factions",
  "timeline",
  "glossary",
  "cast_profiles_arcs",
  "lookbook_pdf",
  "poster_key_art",
  "trailer_storyboard",
  "teaser_trailer",
  "signature_scene_clip",
  "themes_main_hero_villain",
  "trailer_cue_stingers",
  "chain_of_title_rights_matrix",
  "option_term_sheet_producer_packet",
];

const PAGE_TYPES = Array.from(new Set([...LEGACY_PAGE_TYPES, ...REQUIRED_25_PAGE_TYPES]));

const PAGE_TYPE_PRESETS = {
  logline: { title: "Logline", sort: 10 },
  pitch_1p: { title: "Pitch (1 Page)", sort: 20 },
  synopsis_1page: { title: "Synopsis (1 Page)", sort: 30 },
  comparable_titles: { title: "Comparable Titles + Positioning", sort: 40 },
  format_rating_audience: { title: "Format • Rating • Audience", sort: 50 },

  beat_sheet: { title: "Beat Sheet", sort: 60 },
  season1_outline: { title: "Season 1 Outline", sort: 70 },
  episode_list: { title: "Episode List", sort: 80 },
  pilot_outline: { title: "Pilot Outline", sort: 90 },
  pilot_script_or_treatment: { title: "Pilot Script / Treatment", sort: 100 },

  franchise_roadmap: { title: "Franchise Roadmap", sort: 110 },
  series_bible: { title: "Series Bible", sort: 120 },
  world_rules_factions: { title: "World Rules + Factions", sort: 130 },
  timeline: { title: "Timeline", sort: 140 },
  glossary: { title: "Glossary", sort: 150 },
  cast_profiles_arcs: { title: "Cast Profiles + Arcs", sort: 160 },

  lookbook_pdf: { title: "Lookbook (PDF)", sort: 170 },
  poster_key_art: { title: "Poster / Key Art", sort: 180 },
  trailer_storyboard: { title: "Trailer Storyboard", sort: 190 },
  teaser_trailer: { title: "Teaser Trailer", sort: 200 },
  signature_scene_clip: { title: "Signature Scene Clip", sort: 210 },

  themes_main_hero_villain: { title: "Themes: Main • Hero • Villain", sort: 220 },
  trailer_cue_stingers: { title: "Trailer Cues + Stingers", sort: 230 },

  chain_of_title_rights_matrix: { title: "Chain of Title + Rights Matrix (Vault)", sort: 240 },
  option_term_sheet_producer_packet: { title: "Option Term Sheet + Producer Packet (Vault)", sort: 250 },

  // legacy (kept)
  one_sheet: { title: "One-Sheet", sort: 15 },
  press_kit: { title: "Press Kit", sort: 260 },
  negotiation: { title: "Negotiation", sort: 270 },
  roadmap: { title: "Roadmap", sort: 280 },
  prompts: { title: "Prompts", sort: 290 },
  deck_copy: { title: "Deck Copy", sort: 300 },
};

function getPreset(type) {
  return PAGE_TYPE_PRESETS[type] || { title: type.replace(/_/g, " ").toUpperCase(), sort: 100 };
}

const BUCKET = "assets"; // matches your MediaTab bucket
const UPLOAD_PREFIX = "studio_pages"; // storage path prefix
const MAX_ATTACHMENTS = 24;

// Attachment schema (stored in metadata.attachments):
function newAttachmentSeed(overrides = {}) {
  const id = `att_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  return {
    id,
    kind: "link",
    media_type: "other",
    title: "",
    url: "",
    thumbnail_url: "",
    tags: [],
    duration: "",
    bpm: null,
    license_tier: "",
    notes: "",
    ...overrides,
  };
}

function normalizeTags(input) {
  if (Array.isArray(input)) return input.map((t) => asStr(t).trim()).filter(Boolean);
  const s = asStr(input).trim();
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function countAttachmentsByKind(atts = []) {
  const c = { image: 0, video: 0, audio: 0, document: 0, link: 0 };
  for (const a of atts || []) {
    const k = asStr(a?.kind || "link");
    if (c[k] === undefined) c.link += 1;
    else c[k] += 1;
  }
  return c;
}

// ------------------------------
// ✅ Products/Offer helpers (Stripe-ready)
// ------------------------------
function safeMetaObj(meta) {
  if (!meta) return {};
  if (typeof meta === "object") return meta;
  if (typeof meta === "string") return safeJsonParse(meta, {});
  return {};
}

function moneyToNumber(input) {
  // Accept "9.99", 9.99, "10"
  const s = String(input ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

/**
 * ✅ IMPORTANT FIX:
 * Your DB does NOT have `products.title`.
 * Your schema has: name, price, division, description, image_url, thumbnail_url, status, metadata, etc.
 * So we only select real columns.
 */
const PRODUCTS_SELECT_SAFE =
  "id,name,description,division,status,price,image_url,thumbnail_url,metadata,created_at,updated_at,slug,tags";

// ✅ IMPORTANT: your studio checkout expects these tiers
// We keep older tiers too so nothing breaks.
const OFFER_TIER_OPTIONS = [
  { value: "public", label: "public" },
  { value: "supporter", label: "supporter" },

  // ✅ studio-access tiers
  { value: "priority", label: "priority" },
  { value: "producer", label: "producer" },
  { value: "packaging", label: "packaging" },

  // admin / misc
  { value: "vault", label: "vault" },
  { value: "custom", label: "custom" },
];

/* ---------------------------------------------------------
   ✅ ADDED: Studio-offer filtering so books never show here
   Why this won't break:
   - Only filters products loaded into this admin tab.
   - Does not change DB schema or other pages.
--------------------------------------------------------- */
const STUDIO_OFFER_TIERS = new Set(["priority", "producer", "packaging"]);

function isStudioOfferProduct(row) {
  const md = safeMetaObj(row?.metadata);

  const tier = String(md?.tier || md?.access_tier || md?.required_tier || "").trim().toLowerCase();
  const offerType = String(md?.offer_type || "").trim().toLowerCase(); // marker we set on save
  const kind = String(md?.kind || "").trim().toLowerCase();
  const name = String(row?.name || "").toLowerCase();

  const hasStudioTier = STUDIO_OFFER_TIERS.has(tier);
  const explicitlyStudio = offerType === "studio_access" || kind === "studio_access";
  const looksLikeStudioByName = name.includes("studio access");

  return hasStudioTier || explicitlyStudio || looksLikeStudioByName;
}

// We support link via metadata.universe_id (no schema change).
async function tryLoadProductsForUniverse(universeId) {
  // Preferred: filter by metadata->>universe_id
  try {
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCTS_SELECT_SAFE)
      .filter("metadata->>universe_id", "eq", String(universeId))
      .order("updated_at", { ascending: false })
      .limit(200);

    if (!error) {
      const onlyOffers = (data || []).filter(isStudioOfferProduct);
      return { data: onlyOffers, mode: "metadata" };
    }
  } catch {
    // ignore
  }

  // Last resort: fetch recent and filter client-side
  const { data } = await supabase
    .from("products")
    .select(PRODUCTS_SELECT_SAFE)
    .order("updated_at", { ascending: false })
    .limit(300);

  const filtered = (data || []).filter((row) => {
    const md = safeMetaObj(row?.metadata);
    return asStr(md?.universe_id) === asStr(universeId);
  });

  const onlyOffers = filtered.filter(isStudioOfferProduct);
  return { data: onlyOffers, mode: "client_filter" };
}

export default function StudioPagesTab() {
  const [universes, setUniverses] = useState([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState("");

  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingPages, setLoadingPages] = useState(false);
  const [saving, setSaving] = useState(false);

  const [notice, setNotice] = useState(null); // {type,msg}

  // editor fields
  const [pId, setPId] = useState(null);
  const [pType, setPType] = useState("one_sheet");
  const [pTitle, setPTitle] = useState("");
  const [pStatus, setPStatus] = useState("draft");
  const [pSort, setPSort] = useState(100);
  const [pExcerpt, setPExcerpt] = useState("");
  const [pHeroImg, setPHeroImg] = useState("");
  const [pHeroVid, setPHeroVid] = useState("");
  const [pContent, setPContent] = useState("");

  // visibility stored in metadata.visibility
  const [pVisibility, setPVisibility] = useState("public"); // public|vault
  const [pMetaStr, setPMetaStr] = useState(""); // raw JSON

  // ✅ attachments stored in metadata.attachments
  const [pAttachments, setPAttachments] = useState([]);
  const [attPickerQuery, setAttPickerQuery] = useState("");
  const [attPickerKind, setAttPickerKind] = useState("all"); // all|image|video|audio|document|link
  const [attPickerBusy, setAttPickerBusy] = useState(false);
  const [libraryItems, setLibraryItems] = useState([]);
  const uploadInputRef = useRef(null);

  // ✅ NEW: Products/Offers CRUD
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productsMode, setProductsMode] = useState("unknown"); // metadata | client_filter | unknown

  const [prodId, setProdId] = useState(null);
  const [prodTitle, setProdTitle] = useState(""); // UI label (maps to products.name)
  const [prodStatus, setProdStatus] = useState("active"); // active|draft|archived (we store as text)
  const [prodTier, setProdTier] = useState("public"); // ✅ now supports priority/packaging too
  const [prodKind, setProdKind] = useState("digital"); // digital|service|bundle|custom
  const [prodPriceDisplay, setProdPriceDisplay] = useState(""); // dollars string, optional
  const [prodCurrency, setProdCurrency] = useState("usd");
  const [prodStripePriceId, setProdStripePriceId] = useState(""); // price_...
  const [prodStripeProductId, setProdStripeProductId] = useState(""); // prod_...
  const [prodImageUrl, setProdImageUrl] = useState("");
  const [prodDescription, setProdDescription] = useState("");
  const [prodMetadataStr, setProdMetadataStr] = useState(""); // advanced

  const selectedUniverse = useMemo(
    () => universes.find((u) => u.id === selectedUniverseId) || null,
    [universes, selectedUniverseId]
  );

  const resetEditor = useCallback(() => {
    setPId(null);
    setPType("one_sheet");
    setPTitle("");
    setPStatus("draft");
    setPSort(100);
    setPExcerpt("");
    setPHeroImg("");
    setPHeroVid("");
    setPContent("");
    setPVisibility("public");
    setPMetaStr("");
    setPAttachments([]);
    setAttPickerQuery("");
    setAttPickerKind("all");
    setLibraryItems([]);
  }, []);

  const resetProductEditor = useCallback(() => {
    setProdId(null);
    setProdTitle("");
    setProdStatus("active");
    setProdTier("public");
    setProdKind("digital");
    setProdPriceDisplay("");
    setProdCurrency("usd");
    setProdStripePriceId("");
    setProdStripeProductId("");
    setProdImageUrl("");
    setProdDescription("");
    setProdMetadataStr(
      JSON.stringify(
        {
          universe_id: selectedUniverseId || "",
          offer_type: "studio_access", // ✅ ADDED: makes these unambiguously studio offers
          tier: "public",
          access_tier: "public", // ✅ mirrored field for compatibility
          kind: "digital",
          stripe_price_id: "",
          stripe_product_id: "",
          currency: "usd",
          // optional helpers:
          // features: [],
          // deliverables: [],
        },
        null,
        2
      )
    );
  }, [selectedUniverseId]);

  const loadUniverses = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    const { data, error } = await supabase
      .from("universes")
      .select("id,title,slug,status,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(error);
      setUniverses([]);
      setNotice({ type: "error", msg: error.message || "Failed to load universes" });
    } else {
      setUniverses(data || []);
      if (!selectedUniverseId && (data || []).length) setSelectedUniverseId(data[0].id);
    }
    setLoading(false);
  }, [selectedUniverseId]);

  const loadPages = useCallback(async (universeId) => {
    if (!universeId) {
      setPages([]);
      return;
    }
    setLoadingPages(true);
    setNotice(null);

    const { data, error } = await supabase
      .from("studio_pages")
      .select("*")
      .eq("universe_id", universeId)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(error);
      setPages([]);
      setNotice({ type: "error", msg: error.message || "Failed to load studio pages" });
    } else {
      setPages(data || []);
    }
    setLoadingPages(false);
  }, []);

  const loadProducts = useCallback(async (universeId) => {
    if (!universeId) {
      setProducts([]);
      setProductsMode("unknown");
      return;
    }

    setLoadingProducts(true);
    try {
      const res = await tryLoadProductsForUniverse(universeId);
      setProducts(res?.data || []);
      setProductsMode(res?.mode || "unknown");
    } catch (e) {
      console.error(e);
      setProducts([]);
      setProductsMode("unknown");
      setNotice({ type: "error", msg: e?.message || "Failed to load products" });
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    loadUniverses();
  }, [loadUniverses]);

  useEffect(() => {
    if (!selectedUniverseId) return;
    loadPages(selectedUniverseId);
    loadProducts(selectedUniverseId);
    resetEditor();
    resetProductEditor();
  }, [selectedUniverseId, loadPages, loadProducts, resetEditor, resetProductEditor]);

  const selectPage = useCallback((pg) => {
    const md = pg.metadata && typeof pg.metadata === "object" ? pg.metadata : safeJsonParse(pg.metadata, {});
    const visibility = String(md?.visibility || "public") === "vault" ? "vault" : "public";
    const attachments = Array.isArray(md?.attachments) ? md.attachments : [];
    setPId(pg.id);
    setPType(pg.page_type || "one_sheet");
    setPTitle(pg.title || "");
    setPStatus(pg.status || "draft");
    setPSort(pg.sort_order ?? 100);
    setPExcerpt(pg.excerpt || "");
    setPHeroImg(pg.hero_image_url || "");
    setPHeroVid(pg.hero_video_url || "");
    setPContent(pg.content_md || "");
    setPVisibility(visibility);
    setPAttachments(
      (attachments || [])
        .map((a) => ({
          ...newAttachmentSeed(),
          ...a,
          id: a?.id || `att_${Math.random().toString(16).slice(2)}_${Date.now()}`,
          kind: asStr(a?.kind || "link"),
          media_type: asStr(a?.media_type || "other"),
          title: asStr(a?.title || ""),
          url: asStr(a?.url || ""),
          thumbnail_url: asStr(a?.thumbnail_url || ""),
          tags: normalizeTags(a?.tags || []),
          duration: asStr(a?.duration || ""),
          bpm: a?.bpm ?? null,
          license_tier: asStr(a?.license_tier || ""),
          notes: asStr(a?.notes || ""),
        }))
        .slice(0, MAX_ATTACHMENTS)
    );

    const mdForEditor = { ...(md || {}) };
    mdForEditor.visibility = visibility;
    if (!Array.isArray(mdForEditor.attachments)) mdForEditor.attachments = attachments || [];
    setPMetaStr(JSON.stringify(mdForEditor || {}, null, 2));
  }, []);

  const selectProduct = useCallback(
    (row) => {
      const md = safeMetaObj(row?.metadata);

      // ✅ FIX: products table uses "name", not "title"
      const title = row?.name || md?.title || md?.name || "";
      const img = row?.image_url || row?.thumbnail_url || md?.image_url || md?.thumbnail_url || "";
      const desc = row?.description || md?.description || "";

      const stripePriceId = md?.stripe_price_id || md?.price_id || "";
      const stripeProductId = md?.stripe_product_id || "";

      // ✅ tier can live in either tier or access_tier
      const tier = md?.tier || md?.access_tier || md?.required_tier || "public";
      const kind = md?.kind || md?.product_kind || "digital";
      const currency = md?.currency || "usd";
      const status = row?.status || md?.status || "active";

      setProdId(row?.id || null);
      setProdTitle(asStr(title));
      setProdImageUrl(asStr(img));
      setProdDescription(asStr(desc));
      setProdPriceDisplay(row?.price !== null && row?.price !== undefined ? String(row.price) : "");
      setProdStripePriceId(asStr(stripePriceId));
      setProdStripeProductId(asStr(stripeProductId));
      setProdTier(asStr(tier));
      setProdKind(asStr(kind));
      setProdCurrency(asStr(currency));
      setProdStatus(asStr(status) || "active");

      const mdForEditor = { ...(md || {}) };
      mdForEditor.universe_id = mdForEditor.universe_id || selectedUniverseId || "";
      mdForEditor.offer_type = mdForEditor.offer_type || "studio_access"; // ✅ ADDED: persist marker on edit
      mdForEditor.tier = tier;
      mdForEditor.access_tier = mdForEditor.access_tier || tier; // ✅ mirror for compatibility
      mdForEditor.kind = kind;
      mdForEditor.currency = currency;
      mdForEditor.stripe_price_id = stripePriceId;
      mdForEditor.stripe_product_id = stripeProductId;

      setProdMetadataStr(JSON.stringify(mdForEditor, null, 2));
    },
    [selectedUniverseId]
  );

  // ✅ package meter (x/25) based on page_type presence (any status)
  const packageProgress = useMemo(() => {
    const typesPresent = new Set((pages || []).map((p) => String(p.page_type || "").trim()).filter(Boolean));
    const have = REQUIRED_25_PAGE_TYPES.filter((t) => typesPresent.has(t));
    const missing = REQUIRED_25_PAGE_TYPES.filter((t) => !typesPresent.has(t));
    return { have, missing, count: have.length, total: REQUIRED_25_PAGE_TYPES.length };
  }, [pages]);

  // ✅ helper: create only missing 25 pages
  const createMissingPackagePages = useCallback(async () => {
    if (!selectedUniverseId) {
      setNotice({ type: "error", msg: "Select a universe first." });
      return;
    }

    const missing = packageProgress.missing;
    if (!missing.length) {
      setNotice({ type: "ok", msg: "All 25 package pages already exist." });
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      const rows = missing.map((t) => {
        const preset = getPreset(t);
        const isVault = t.includes("rights") || t.includes("term_sheet") || t.includes("producer_packet");
        const visibility = isVault ? "vault" : "public";
        return {
          universe_id: selectedUniverseId,
          page_type: t,
          title: preset.title,
          status: "draft",
          sort_order: preset.sort,
          excerpt: null,
          hero_image_url: null,
          hero_video_url: null,
          content_md: `# ${preset.title}\n\n`,
          metadata: { visibility, attachments: [] },
        };
      });

      const { error } = await supabase.from("studio_pages").insert(rows);
      if (error) throw error;

      setNotice({ type: "ok", msg: `Created ${rows.length} missing package pages (draft).` });
      await loadPages(selectedUniverseId);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to create missing pages" });
    } finally {
      setSaving(false);
    }
  }, [selectedUniverseId, packageProgress.missing, loadPages]);

  // ✅ best-effort: load existing media library (tries media table, then products)
  const loadMediaLibrary = useCallback(
    async (q = "") => {
      setAttPickerBusy(true);
      setNotice(null);

      const query = asStr(q).trim();
      const kindFilter = attPickerKind;

      const normalizeRow = (row) => {
        const meta = row?.metadata && typeof row.metadata === "object" ? row.metadata : safeJsonParse(row?.metadata, {});
        const title = row?.title || row?.name || meta?.title || "";
        const url = row?.url || row?.media_url || row?.download_url || meta?.url || meta?.download_url || "";
        const thumbnail_url = row?.thumbnail_url || row?.image_url || meta?.thumbnail_url || meta?.image_url || "";
        const media_type = meta?.media_type || meta?.type || meta?.kind || "other";
        const kind = meta?.kind || guessKindFromUrl(url || thumbnail_url || "");
        const tags = normalizeTags(row?.tags || meta?.tags || []);
        const duration = meta?.duration || "";
        const bpm = meta?.bpm ?? null;
        const license_tier = meta?.license_tier || "";
        const sourceTable = row?._source_table || "unknown";

        return {
          _key: `${sourceTable}:${row?.id || title}:${url}`,
          sourceTable,
          id: row?.id || null,
          title: asStr(title),
          url: asStr(url),
          thumbnail_url: asStr(thumbnail_url),
          kind: asStr(kind),
          media_type: asStr(media_type),
          tags,
          duration: asStr(duration),
          bpm,
          license_tier: asStr(license_tier),
          raw: row,
        };
      };

      const applyFilters = (items) => {
        let out = items || [];
        if (kindFilter && kindFilter !== "all") out = out.filter((it) => it.kind === kindFilter);
        if (query) {
          const qq = query.toLowerCase();
          out = out.filter((it) => {
            const blob = `${it.title} ${it.url} ${(it.tags || []).join(" ")} ${it.media_type}`.toLowerCase();
            return blob.includes(qq);
          });
        }
        out = uniqBy(out, (x) => x._key);
        return out.slice(0, 60);
      };

      try {
        let items = [];
        try {
          let req = supabase
            .from("media")
            .select("id,title,url,thumbnail_url,metadata,created_at,updated_at")
            .order("updated_at", { ascending: false });
          const { data, error } = await req.limit(80);
          if (!error && data) {
            items = (data || []).map((r) => ({ ...r, _source_table: "media" })).map(normalizeRow);
          }
        } catch {
          // ignore
        }

        if (!items.length) {
          try {
            // ✅ FIX: products has name (not title)
            let req = supabase
              .from("products")
              .select("id,name,division,image_url,thumbnail_url,metadata,created_at,updated_at,tags")
              .order("updated_at", { ascending: false })
              .limit(120);

            const { data, error } = await req;
            if (!error && data) {
              items = (data || []).map((r) => ({ ...r, _source_table: "products" })).map(normalizeRow);
            }
          } catch {
            // ignore
          }
        }

        const filtered = applyFilters(items || []);
        setLibraryItems(filtered);
      } catch (e) {
        console.error(e);
        setLibraryItems([]);
        setNotice({ type: "error", msg: e?.message || "Failed to load media library" });
      } finally {
        setAttPickerBusy(false);
      }
    },
    [attPickerKind]
  );

  const addAttachment = useCallback((seed = {}) => {
    setPAttachments((prev) => {
      const next = [...(prev || [])];
      if (next.length >= MAX_ATTACHMENTS) return next;
      next.push(newAttachmentSeed(seed));
      return next;
    });
  }, []);

  const updateAttachment = useCallback((id, patch) => {
    setPAttachments((prev) =>
      (prev || []).map((a) =>
        a.id === id ? { ...a, ...patch, tags: patch?.tags !== undefined ? normalizeTags(patch.tags) : a.tags } : a
      )
    );
  }, []);

  const removeAttachment = useCallback((id) => {
    setPAttachments((prev) => (prev || []).filter((a) => a.id !== id));
  }, []);

  const moveAttachment = useCallback((id, dir) => {
    setPAttachments((prev) => {
      const arr = [...(prev || [])];
      const idx = arr.findIndex((a) => a.id === id);
      if (idx < 0) return arr;
      const to = idx + dir;
      if (to < 0 || to >= arr.length) return arr;
      const tmp = arr[idx];
      arr[idx] = arr[to];
      arr[to] = tmp;
      return arr;
    });
  }, []);

  const addFromLibrary = useCallback(
    (item) => {
      if (!item?.url && !item?.thumbnail_url) return;
      addAttachment({
        kind: item.kind || guessKindFromUrl(item.url || item.thumbnail_url),
        media_type: item.media_type || "other",
        title: item.title || "",
        url: item.url || "",
        thumbnail_url: item.thumbnail_url || "",
        tags: item.tags || [],
        duration: item.duration || "",
        bpm: item.bpm ?? null,
        license_tier: item.license_tier || "",
        notes: "",
      });
    },
    [addAttachment]
  );

  const onUploadFiles = useCallback(
    async (files) => {
      if (!files || !files.length) return;
      if (!selectedUniverse?.slug) {
        setNotice({ type: "error", msg: "Universe slug missing. Add a slug to this universe before uploading." });
        return;
      }

      setSaving(true);
      setNotice(null);

      try {
        const uploaded = [];
        for (const file of files) {
          const kind = guessKindFromUrl(file.name);
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
          const path = `${UPLOAD_PREFIX}/${selectedUniverse.slug}/${Date.now()}_${safeName}`;

          const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });

          if (error) throw error;

          const url = publicUrlForStoragePath(BUCKET, path);
          uploaded.push({ file, url, kind });
        }

        for (const u of uploaded) {
          addAttachment({
            kind: u.kind,
            media_type:
              u.kind === "image" ? "poster" : u.kind === "video" ? "trailer" : u.kind === "audio" ? "cue" : "document",
            title: u.file.name.replace(/\.[^.]+$/, ""),
            url: u.url,
            thumbnail_url: "",
            tags: [`universe:${selectedUniverse.slug}`, `page_type:${pType}`],
            duration: "",
            bpm: null,
            license_tier: u.kind === "audio" ? "Pitch / Web" : "",
            notes: "",
          });
        }

        setNotice({ type: "ok", msg: `Uploaded ${uploaded.length} file(s) to Storage and attached to this page.` });
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Upload failed" });
      } finally {
        setSaving(false);
        if (uploadInputRef.current) uploadInputRef.current.value = "";
      }
    },
    [selectedUniverse, addAttachment, pType]
  );

  const savePage = useCallback(async () => {
    if (!selectedUniverseId) {
      setNotice({ type: "error", msg: "Select a universe first." });
      return;
    }
    if (!pTitle.trim()) {
      setNotice({ type: "error", msg: "Title is required." });
      return;
    }

    setSaving(true);
    setNotice(null);

    const metaObj = safeJsonParse(pMetaStr, {});
    metaObj.visibility = pVisibility;

    metaObj.attachments = (pAttachments || [])
      .filter((a) => a && (asStr(a.title).trim() || asStr(a.url).trim()))
      .slice(0, MAX_ATTACHMENTS)
      .map((a) => ({
        id: a.id || `att_${Math.random().toString(16).slice(2)}_${Date.now()}`,
        kind: asStr(a.kind || "link"),
        media_type: asStr(a.media_type || "other"),
        title: asStr(a.title || "").trim(),
        url: asStr(a.url || "").trim(),
        thumbnail_url: asStr(a.thumbnail_url || "").trim(),
        tags: normalizeTags(a.tags || []),
        duration: asStr(a.duration || "").trim(),
        bpm: a.bpm === null || a.bpm === undefined || a.bpm === "" ? null : clampInt(a.bpm, null),
        license_tier: asStr(a.license_tier || "").trim(),
        notes: asStr(a.notes || "").trim(),
      }));

    const payload = {
      universe_id: selectedUniverseId,
      page_type: pType,
      title: pTitle.trim(),
      status: pStatus,
      sort_order: clampInt(pSort, 100),
      excerpt: pExcerpt || null,
      hero_image_url: pHeroImg || null,
      hero_video_url: pHeroVid || null,
      content_md: pContent || "",
      metadata: metaObj,
    };

    try {
      if (pId) {
        const { error } = await supabase.from("studio_pages").update(payload).eq("id", pId);
        if (error) throw error;
        setNotice({ type: "ok", msg: "Studio page saved." });
      } else {
        const { data, error } = await supabase.from("studio_pages").insert([payload]).select("*").single();
        if (error) throw error;
        setPId(data.id);
        setNotice({ type: "ok", msg: "Studio page created." });
      }

      await loadPages(selectedUniverseId);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to save studio page" });
    } finally {
      setSaving(false);
    }
  }, [
    selectedUniverseId,
    pId,
    pType,
    pTitle,
    pStatus,
    pSort,
    pExcerpt,
    pHeroImg,
    pHeroVid,
    pContent,
    pMetaStr,
    pVisibility,
    pAttachments,
    loadPages,
  ]);

  const deletePage = useCallback(async () => {
    if (!pId) return;
    if (!confirm("Delete this studio page?")) return;

    setSaving(true);
    setNotice(null);

    try {
      const { error } = await supabase.from("studio_pages").delete().eq("id", pId);
      if (error) throw error;

      setNotice({ type: "ok", msg: "Studio page deleted." });
      resetEditor();
      await loadPages(selectedUniverseId);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to delete studio page" });
    } finally {
      setSaving(false);
    }
  }, [pId, resetEditor, loadPages, selectedUniverseId]);

  // ✅ NEW: Product save/delete (Stripe Price ID ready)
  const saveProduct = useCallback(async () => {
    if (!selectedUniverseId) {
      setNotice({ type: "error", msg: "Select a universe first." });
      return;
    }
    if (!prodTitle.trim()) {
      setNotice({ type: "error", msg: "Product title is required." });
      return;
    }
    if (prodStripePriceId && !String(prodStripePriceId).startsWith("price_")) {
      setNotice({ type: "error", msg: "Stripe Price ID should look like: price_..." });
      return;
    }
    if (prodStripeProductId && !String(prodStripeProductId).startsWith("prod_")) {
      setNotice({ type: "error", msg: "Stripe Product ID should look like: prod_..." });
      return;
    }

    setSaving(true);
    setNotice(null);

    const metaObj = safeJsonParse(prodMetadataStr, {});
    metaObj.universe_id = selectedUniverseId;

    // ✅ ADDED: enforce studio-offer marker so books can’t get mixed in
    metaObj.offer_type = "studio_access";

    // ✅ enforce tier in BOTH fields so your studio page can read either
    metaObj.tier = prodTier;
    metaObj.access_tier = prodTier;

    metaObj.kind = prodKind;
    metaObj.currency = prodCurrency || "usd";
    metaObj.stripe_price_id = prodStripePriceId || "";
    metaObj.stripe_product_id = prodStripeProductId || "";

    // price: store both in metadata (optional) and in products.price if provided
    const priceNum = moneyToNumber(prodPriceDisplay);
    if (priceNum !== null) metaObj.price = priceNum;

    /**
     * ✅ IMPORTANT FIX:
     * Your products table uses `name` (not `title`).
     * So we write to `name` ONLY.
     */
    const payload = {
      name: prodTitle.trim(),
      description: prodDescription || null,
      status: prodStatus || "active",
      image_url: prodImageUrl || null,
      thumbnail_url: prodImageUrl || null,
      metadata: metaObj,
      // division must pass your constraint; we set a safe default
      division: "publishing",
      // only set price if user provided a valid number (your schema has price numeric NOT NULL)
      price: priceNum !== null ? priceNum : 0,
    };

    try {
      if (prodId) {
        const { error } = await supabase.from("products").update(payload).eq("id", prodId);
        if (error) throw error;
        setNotice({ type: "ok", msg: "Product saved." });
      } else {
        const { data, error } = await supabase.from("products").insert([payload]).select("*").single();
        if (error) throw error;
        if (data?.id) setProdId(data.id);
        setNotice({ type: "ok", msg: "Product created." });
      }

      await loadProducts(selectedUniverseId);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to save product" });
    } finally {
      setSaving(false);
    }
  }, [
    selectedUniverseId,
    prodId,
    prodTitle,
    prodStatus,
    prodTier,
    prodKind,
    prodPriceDisplay,
    prodCurrency,
    prodStripePriceId,
    prodStripeProductId,
    prodImageUrl,
    prodDescription,
    prodMetadataStr,
    loadProducts,
  ]);

  const deleteProduct = useCallback(async () => {
    if (!prodId) return;
    if (!confirm("Delete this product/offer?")) return;

    setSaving(true);
    setNotice(null);

    try {
      const { error } = await supabase.from("products").delete().eq("id", prodId);
      if (error) throw error;
      setNotice({ type: "ok", msg: "Product deleted." });
      resetProductEditor();
      await loadProducts(selectedUniverseId);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to delete product" });
    } finally {
      setSaving(false);
    }
  }, [prodId, resetProductEditor, loadProducts, selectedUniverseId]);

  // ✅ quality-of-life: auto-fill title/sort + default visibility for new pages
  useEffect(() => {
    if (pId) return;
    const preset = getPreset(pType);
    if (!pTitle) setPTitle(preset.title);
    if (!pSort || Number(pSort) === 100) setPSort(preset.sort);

    if (!pMetaStr) {
      const isVaultType = pType.includes("rights") || pType.includes("term_sheet") || pType.includes("producer_packet");
      const vis = isVaultType ? "vault" : "public";
      setPVisibility(vis);
      setPMetaStr(JSON.stringify({ visibility: vis, attachments: [] }, null, 2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pType]);

  const studioPreviewUrl = useMemo(() => {
    if (!selectedUniverse?.slug) return "";
    return `/studios/${selectedUniverse.slug}`;
  }, [selectedUniverse?.slug]);

  const vaultPreviewUrl = useMemo(() => {
    if (!selectedUniverse?.slug) return "";
    return `/studios/${selectedUniverse.slug}?vault=1`;
  }, [selectedUniverse?.slug]);

  const editorAttachmentsCounts = useMemo(() => countAttachmentsByKind(pAttachments || []), [pAttachments]);

  // ✅ Products completeness quick check (do we have at least one usable Stripe price?)
  const productsReady = useMemo(() => {
    const usable = (products || []).filter((row) => {
      const md = safeMetaObj(row?.metadata);
      const pid = asStr(md?.stripe_price_id || md?.price_id).trim();
      return pid.startsWith("price_");
    });
    return { count: usable.length };
  }, [products]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Studio Pages</h2>
          <p className="text-sm opacity-70">
            Fast-scan pitch copy + optional media attachments per page. Published pages render on{" "}
            <code>/studios/[slug]</code>. Vault pages are hidden unless <code>?vault=1</code>.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {studioPreviewUrl ? (
            <a
              className="px-3 py-2 rounded-xl border border-gray-300 text-sm hover:bg-gray-50"
              href={studioPreviewUrl}
              target="_blank"
              rel="noreferrer"
            >
              View Studio →
            </a>
          ) : null}
          {vaultPreviewUrl ? (
            <a
              className="px-3 py-2 rounded-xl border border-gray-300 text-sm hover:bg-gray-50"
              href={vaultPreviewUrl}
              target="_blank"
              rel="noreferrer"
              title="Shows vault pages (deal docs) if your studios/[slug] supports ?vault=1"
            >
              View Vault →
            </a>
          ) : null}
        </div>
      </div>

      {notice?.msg && (
        <div
          className={`rounded-2xl border p-3 text-sm ${
            notice.type === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {notice.msg}
        </div>
      )}

      {/* ✅ Package Completeness Meter */}
      <div className="rounded-2xl border border-gray-200 p-4 bg-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Hollywood Package (25)</div>
            <div className="text-sm opacity-70">
              Completeness is based on required <code>page_type</code> presence.
            </div>
          </div>

          <button
            className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            onClick={createMissingPackagePages}
            disabled={!selectedUniverseId || saving}
            title="Creates only missing 25 required page types as draft pages"
          >
            + Create Missing Package Pages
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className="text-sm">
            Progress: <span className="font-semibold">{packageProgress.count}</span> / {packageProgress.total}
          </div>
          <div className="flex-1 min-w-[220px] h-2 rounded-full bg-gray-100 overflow-hidden border">
            <div
              className="h-full bg-black"
              style={{ width: `${Math.round((packageProgress.count / packageProgress.total) * 100)}%` }}
            />
          </div>
          {packageProgress.count === packageProgress.total ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800">
              complete
            </span>
          ) : (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900">
              missing {packageProgress.missing.length}
            </span>
          )}
        </div>

        {packageProgress.missing.length > 0 && (
          <div className="mt-3 text-xs opacity-80">
            Missing: <span className="font-mono">{packageProgress.missing.join(", ")}</span>
          </div>
        )}
      </div>

      {/* ✅ Products / Offers (Option A) */}
      <div className="rounded-2xl border border-gray-200 p-4 bg-white">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Products / Offers (Stripe-ready)</div>
            <div className="text-sm opacity-70">
              Create offers for this Universe and paste your Stripe <code>price_...</code> ID. This is “Option A”
              (products live in Supabase).
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">
              link mode: <b>{productsMode}</b>
            </span>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full border ${
                productsReady.count > 0
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
              title="Counts products with a valid Stripe price_ id"
            >
              stripe prices: <b>{productsReady.count}</b>
            </span>

            <button
              className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              onClick={() => loadProducts(selectedUniverseId)}
              disabled={!selectedUniverseId || loadingProducts || saving}
            >
              {loadingProducts ? "Refreshing…" : "Refresh"}
            </button>

            <button
              className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              onClick={resetProductEditor}
              disabled={!selectedUniverseId || saving}
              title="Create a new offer"
            >
              + New Offer
            </button>
          </div>
        </div>

        {!selectedUniverseId ? (
          <div className="mt-3 text-sm opacity-70">Select a universe to manage offers.</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Offer list */}
            <div className="rounded-2xl border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">Offers</div>
                <div className="text-xs opacity-60">{loadingProducts ? "Loading…" : `${(products || []).length} total`}</div>
              </div>

              {(products || []).length === 0 ? (
                <div className="mt-3 text-sm opacity-70">
                  No offers yet. Click <b>+ New Offer</b>, paste your <code>price_...</code> ID, then Save.
                </div>
              ) : (
                <div className="mt-3 space-y-2 max-h-[340px] overflow-auto pr-1">
                  {(products || []).map((row) => {
                    const md = safeMetaObj(row?.metadata);
                    const title = row?.name || md?.title || md?.name || "(untitled)";
                    const tier = md?.tier || md?.access_tier || "public";
                    const kind = md?.kind || md?.product_kind || "digital";
                    const status = row?.status || md?.status || "active";
                    const pid = asStr(md?.stripe_price_id || md?.price_id).trim();
                    const price = row?.price !== null && row?.price !== undefined ? String(row.price) : "";

                    return (
                      <button
                        key={row.id}
                        onClick={() => selectProduct(row)}
                        className={`w-full text-left p-3 rounded-2xl border transition ${
                          prodId === row.id ? "border-black" : "border-gray-200 hover:border-gray-300"
                        }`}
                        title="Click to edit"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{title}</div>
                            <div className="text-xs opacity-70 mt-0.5 truncate">
                              <span className="font-mono">id:</span> {row.id}
                            </div>
                            <div className="text-xs opacity-70 mt-1 flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">{status}</span>
                              <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">{tier}</span>
                              <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">{kind}</span>
                              {price ? (
                                <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">${price}</span>
                              ) : null}
                              {pid ? (
                                <span
                                  className={`px-2 py-0.5 rounded-full border ${
                                    pid.startsWith("price_")
                                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                      : "border-amber-300 bg-amber-50 text-amber-900"
                                  }`}
                                >
                                  {pid.startsWith("price_") ? "stripe ok" : "stripe?"}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-900">
                                  missing price_id
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Offer editor */}
            <div className="rounded-2xl border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">{prodId ? "Edit Offer" : "Create Offer"}</div>
                  <div className="text-xs opacity-70 mt-0.5">
                    Paste Stripe <code>price_...</code>. We store it in <code>products.metadata.stripe_price_id</code>.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {prodStripePriceId ? (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${
                        String(prodStripePriceId).startsWith("price_")
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-amber-300 bg-amber-50 text-amber-900"
                      }`}
                      title="Stripe Price ID validation"
                    >
                      {String(prodStripePriceId).startsWith("price_") ? "price id ok" : "check price id"}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3">
                <label className="text-sm">
                  Title
                  <input
                    className="mt-1 w-full border rounded-xl p-2"
                    value={prodTitle}
                    onChange={(e) => setProdTitle(e.target.value)}
                    placeholder="Studio Access — Priority Window"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Status
                    <select
                      className="mt-1 w-full border rounded-xl p-2"
                      value={prodStatus}
                      onChange={(e) => setProdStatus(e.target.value)}
                    >
                      <option value="active">active</option>
                      <option value="draft">draft</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    Tier
                    <select
                      className="mt-1 w-full border rounded-xl p-2"
                      value={prodTier}
                      onChange={(e) => setProdTier(e.target.value)}
                    >
                      {OFFER_TIER_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] opacity-60 mt-1">
                      Studio checkout expects <code>priority</code>, <code>producer</code>, <code>packaging</code>.
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Kind
                    <select className="mt-1 w-full border rounded-xl p-2" value={prodKind} onChange={(e) => setProdKind(e.target.value)}>
                      <option value="digital">digital</option>
                      <option value="service">service</option>
                      <option value="bundle">bundle</option>
                      <option value="custom">custom</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    Display Price (optional)
                    <input
                      className="mt-1 w-full border rounded-xl p-2"
                      value={prodPriceDisplay}
                      onChange={(e) => setProdPriceDisplay(e.target.value)}
                      placeholder="2500"
                    />
                    <div className="text-[11px] opacity-60 mt-1">Stored in <code>products.price</code> (and metadata) for display.</div>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    Currency
                    <input className="mt-1 w-full border rounded-xl p-2" value={prodCurrency} onChange={(e) => setProdCurrency(e.target.value)} placeholder="usd" />
                  </label>

                  <label className="text-sm">
                    Stripe Price ID (required for checkout)
                    <input
                      className="mt-1 w-full border rounded-xl p-2 font-mono text-sm"
                      value={prodStripePriceId}
                      onChange={(e) => setProdStripePriceId(e.target.value)}
                      placeholder="price_123..."
                    />
                  </label>
                </div>

                <label className="text-sm">
                  Stripe Product ID (optional)
                  <input
                    className="mt-1 w-full border rounded-xl p-2 font-mono text-sm"
                    value={prodStripeProductId}
                    onChange={(e) => setProdStripeProductId(e.target.value)}
                    placeholder="prod_123..."
                  />
                </label>

                <label className="text-sm">
                  Image URL (optional)
                  <input className="mt-1 w-full border rounded-xl p-2" value={prodImageUrl} onChange={(e) => setProdImageUrl(e.target.value)} placeholder="https://..." />
                </label>

                <label className="text-sm">
                  Description (optional)
                  <textarea
                    className="mt-1 w-full border rounded-xl p-2 min-h-[90px]"
                    value={prodDescription}
                    onChange={(e) => setProdDescription(e.target.value)}
                    placeholder="What the buyer gets (deliverables, access, usage rights)."
                  />
                </label>

                <label className="text-sm">
                  Metadata JSON (optional)
                  <textarea
                    className="mt-1 w-full border rounded-xl p-2 min-h-[130px] font-mono text-xs"
                    value={prodMetadataStr}
                    onChange={(e) => setProdMetadataStr(e.target.value)}
                    placeholder={`{\n  "universe_id": "${selectedUniverseId}",\n  "tier": "producer",\n  "kind": "digital",\n  "stripe_price_id": "price_...",\n  "currency": "usd"\n}`}
                  />
                  <div className="text-[11px] opacity-60 mt-1">
                    Advanced: anything here is preserved, but <code>universe_id</code>, <code>offer_type</code>, <code>tier</code>, <code>access_tier</code>, <code>kind</code>, and Stripe fields are enforced from the form on Save.
                  </div>
                </label>

                <div className="flex gap-2 pt-1">
                  <button
                    className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                    onClick={saveProduct}
                    disabled={saving || !selectedUniverseId || !prodTitle.trim()}
                  >
                    {saving ? "Saving…" : "Save Offer"}
                  </button>

                  {prodId ? (
                    <button
                      className="px-4 py-2 rounded-xl border border-red-300 bg-red-50 text-red-900 disabled:opacity-50"
                      onClick={deleteProduct}
                      disabled={saving}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>

                <div className="text-xs opacity-60">Tip: If you don’t have a <code>price_</code> yet, create it in Stripe, then paste it here.</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Universe picker */}
        <div className="rounded-2xl border border-gray-200 p-4 bg-white">
          <div className="font-semibold mb-2">Universe</div>
          {loading ? (
            <div className="opacity-70">Loading…</div>
          ) : universes.length === 0 ? (
            <div className="opacity-70">No universes yet.</div>
          ) : (
            <>
              <select
                className="w-full border rounded-xl p-2"
                value={selectedUniverseId}
                onChange={(e) => setSelectedUniverseId(e.target.value)}
              >
                {universes.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.title} ({u.status || "draft"})
                  </option>
                ))}
              </select>

              {selectedUniverse?.slug ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a
                    className="inline-flex w-full justify-center px-3 py-2 rounded-xl border border-gray-300 text-sm hover:bg-gray-50"
                    href={`/studios/${selectedUniverse.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Public →
                  </a>
                  <a
                    className="inline-flex w-full justify-center px-3 py-2 rounded-xl border border-gray-300 text-sm hover:bg-gray-50"
                    href={`/studios/${selectedUniverse.slug}?vault=1`}
                    target="_blank"
                    rel="noreferrer"
                    title="Shows vault pages if your studios/[slug] supports ?vault=1"
                  >
                    Vault →
                  </a>
                </div>
              ) : (
                <div className="mt-3 text-xs opacity-70">
                  Tip: add a <code>slug</code> to this universe to enable upload paths + preview links.
                </div>
              )}
            </>
          )}
        </div>

        {/* Pages list */}
        <div className="rounded-2xl border border-gray-200 p-4 bg-white">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="font-semibold">Pages</div>
            <button
              className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
              onClick={resetEditor}
              disabled={!selectedUniverseId}
            >
              + New
            </button>
          </div>

          {loadingPages ? (
            <div className="opacity-70">Loading pages…</div>
          ) : pages.length === 0 ? (
            <div className="opacity-70 text-sm">No studio pages yet.</div>
          ) : (
            <div className="space-y-2">
              {pages.map((pg) => {
                const md = pg.metadata && typeof pg.metadata === "object" ? pg.metadata : safeJsonParse(pg.metadata, {});
                const visibility = String(md?.visibility || "public") === "vault" ? "vault" : "public";
                const atts = Array.isArray(md?.attachments) ? md.attachments : [];
                const counts = countAttachmentsByKind(atts);
                const totalAtts = (atts || []).length;

                return (
                  <button
                    key={pg.id}
                    onClick={() => selectPage(pg)}
                    className={`w-full text-left p-3 rounded-2xl border transition ${
                      pId === pg.id ? "border-black" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold leading-tight">{pg.title}</div>
                        <div className="text-xs opacity-70 mt-0.5">
                          <span className="font-mono">{pg.page_type}</span> • sort {pg.sort_order}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {visibility === "vault" ? (
                          <span className="px-2 py-0.5 rounded-full border text-xs border-slate-300 bg-slate-50 text-slate-800">
                            vault
                          </span>
                        ) : null}

                        <span
                          className={`px-2 py-0.5 rounded-full border text-xs ${
                            pg.status === "published"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : "border-amber-300 bg-amber-50 text-amber-900"
                          }`}
                        >
                          {pg.status}
                        </span>

                        {totalAtts ? (
                          <span className="px-2 py-0.5 rounded-full border text-xs border-gray-300 bg-gray-50 text-gray-800">
                            {totalAtts} media
                            <span className="opacity-70">
                              {" "}
                              · i{counts.image} v{counts.video} a{counts.audio}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="rounded-2xl border border-gray-200 p-4 bg-white lg:col-span-1">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="font-semibold">{pId ? "Edit Studio Page" : "Create Studio Page"}</div>
            {pId ? (
              <button
                className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={() => {
                  if (!pExcerpt?.trim()) {
                    const raw = asStr(pContent).replace(/\s+/g, " ").trim();
                    setPExcerpt(raw.slice(0, 240));
                  }
                }}
                disabled={saving}
                title="Fill excerpt from the first part of content (up to 240 chars)"
              >
                Auto Excerpt
              </button>
            ) : null}
          </div>

          {/* Everything below is unchanged from your original file (pages editor + attachments + library) */}
          {/* (kept intact to avoid breaking your current workflow) */}

          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm">
              Title
              <input className="mt-1 w-full border rounded-xl p-2" value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
            </label>
            <label className="text-sm">
              Type
              <select className="mt-1 w-full border rounded-xl p-2" value={pType} onChange={(e) => setPType(e.target.value)}>
                {PAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <div className="text-[11px] opacity-60 mt-1">Use the 25 page types for Hollywood packaging. Legacy types still supported.</div>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Status
                <select className="mt-1 w-full border rounded-xl p-2" value={pStatus} onChange={(e) => setPStatus(e.target.value)}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </label>
              <label className="text-sm">
                Sort
                <input className="mt-1 w-full border rounded-xl p-2" value={String(pSort)} onChange={(e) => setPSort(e.target.value)} />
              </label>
            </div>
            <label className="text-sm">
              Visibility
              <select className="mt-1 w-full border rounded-xl p-2" value={pVisibility} onChange={(e) => setPVisibility(e.target.value)}>
                <option value="public">public</option>
                <option value="vault">vault (deal docs / private)</option>
              </select>
              <div className="text-[11px] opacity-60 mt-1">
                Stored in <code>studio_pages.metadata.visibility</code> (no schema change).
              </div>
            </label>
            <label className="text-sm">
              Excerpt (optional • max ~240 chars recommended)
              <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[70px]" value={pExcerpt} onChange={(e) => setPExcerpt(e.target.value)} />
            </label>
            <div className="grid grid-cols-1 gap-3">
              <label className="text-sm">
                Hero Image URL (optional)
                <input className="mt-1 w-full border rounded-xl p-2" value={pHeroImg} onChange={(e) => setPHeroImg(e.target.value)} />
              </label>
              <label className="text-sm">
                Hero Video URL (optional)
                <input className="mt-1 w-full border rounded-xl p-2" value={pHeroVid} onChange={(e) => setPHeroVid(e.target.value)} />
              </label>
            </div>

            {/* ✅ Attachments */}
            <div className="rounded-2xl border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">Media Attachments</div>
                  <div className="text-xs opacity-70">
                    Stored in <code>metadata.attachments</code>. Keep pages “paper-scan” + attach lookbooks, posters, teasers, audio.
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => addAttachment({ kind: "link", media_type: "other" })}
                    disabled={saving || (pAttachments || []).length >= MAX_ATTACHMENTS}
                    title="Add a blank attachment row (link or file URL)"
                  >
                    + Add
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={saving || !selectedUniverse?.slug}
                    title={!selectedUniverse?.slug ? "Add a universe slug to enable uploads" : "Upload files to Supabase Storage and attach"}
                  >
                    Upload
                  </button>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.aac,.ogg,.mp4,.mov,.webm,.pdf"
                    onChange={(e) => onUploadFiles(Array.from(e.target.files || []))}
                  />
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">
                  images <b>{editorAttachmentsCounts.image}</b>
                </span>
                <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">
                  video <b>{editorAttachmentsCounts.video}</b>
                </span>
                <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">
                  audio <b>{editorAttachmentsCounts.audio}</b>
                </span>
                <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">
                  docs <b>{editorAttachmentsCounts.document}</b>
                </span>
                <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">
                  links <b>{editorAttachmentsCounts.link}</b>
                </span>
              </div>

              {(pAttachments || []).length === 0 ? (
                <div className="mt-3 text-sm opacity-70">No attachments yet.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {(pAttachments || []).map((a, idx) => (
                    <div key={a.id} className="rounded-2xl border border-gray-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs opacity-60">Attachment {idx + 1}</div>
                          <div className="font-semibold truncate">{a.title || "(untitled)"}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="px-2 py-1 rounded-lg border border-gray-300 text-xs hover:bg-gray-50"
                            onClick={() => moveAttachment(a.id, -1)}
                            disabled={idx === 0}
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            className="px-2 py-1 rounded-lg border border-gray-300 text-xs hover:bg-gray-50"
                            onClick={() => moveAttachment(a.id, 1)}
                            disabled={idx === (pAttachments || []).length - 1}
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            className="px-2 py-1 rounded-lg border border-red-300 bg-red-50 text-xs text-red-900 hover:bg-red-100"
                            onClick={() => removeAttachment(a.id)}
                            title="Remove"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3">
                        <div className="grid grid-cols-2 gap-3">
                          <label className="text-xs">
                            Kind
                            <select
                              className="mt-1 w-full border rounded-xl p-2 text-sm"
                              value={a.kind}
                              onChange={(e) => updateAttachment(a.id, { kind: e.target.value })}
                            >
                              <option value="image">image</option>
                              <option value="video">video</option>
                              <option value="audio">audio</option>
                              <option value="document">document</option>
                              <option value="link">link</option>
                            </select>
                          </label>
                          <label className="text-xs">
                            Media Type
                            <select
                              className="mt-1 w-full border rounded-xl p-2 text-sm"
                              value={a.media_type}
                              onChange={(e) => updateAttachment(a.id, { media_type: e.target.value })}
                            >
                              <option value="poster">poster</option>
                              <option value="lookbook">lookbook</option>
                              <option value="trailer">trailer</option>
                              <option value="theme">theme</option>
                              <option value="cue">cue</option>
                              <option value="stinger">stinger</option>
                              <option value="packet">packet</option>
                              <option value="other">other</option>
                            </select>
                          </label>
                        </div>

                        <label className="text-xs">
                          Title
                          <input
                            className="mt-1 w-full border rounded-xl p-2 text-sm"
                            value={a.title}
                            onChange={(e) => updateAttachment(a.id, { title: e.target.value })}
                            placeholder="Main Theme • Official"
                          />
                        </label>

                        <label className="text-xs">
                          URL (required)
                          <input
                            className="mt-1 w-full border rounded-xl p-2 text-sm"
                            value={a.url}
                            onChange={(e) => {
                              const url = e.target.value;
                              const inferredKind = guessKindFromUrl(url);
                              updateAttachment(a.id, { url, kind: a.kind === "link" ? inferredKind : a.kind });
                            }}
                            placeholder="https://…"
                          />
                        </label>

                        <label className="text-xs">
                          Thumbnail URL (optional)
                          <input
                            className="mt-1 w-full border rounded-xl p-2 text-sm"
                            value={a.thumbnail_url}
                            onChange={(e) => updateAttachment(a.id, { thumbnail_url: e.target.value })}
                            placeholder="https://…"
                          />
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="text-xs">
                            Duration (optional)
                            <input
                              className="mt-1 w-full border rounded-xl p-2 text-sm"
                              value={a.duration}
                              onChange={(e) => updateAttachment(a.id, { duration: e.target.value })}
                              placeholder="0:45"
                            />
                          </label>
                          <label className="text-xs">
                            BPM (audio optional)
                            <input
                              className="mt-1 w-full border rounded-xl p-2 text-sm"
                              value={a.bpm ?? ""}
                              onChange={(e) => updateAttachment(a.id, { bpm: e.target.value })}
                              placeholder="90"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <label className="text-xs">
                            License Tier (audio optional)
                            <input
                              className="mt-1 w-full border rounded-xl p-2 text-sm"
                              value={a.license_tier}
                              onChange={(e) => updateAttachment(a.id, { license_tier: e.target.value })}
                              placeholder="Pitch / Web / Full"
                            />
                          </label>
                          <label className="text-xs">
                            Tags (comma separated)
                            <input
                              className="mt-1 w-full border rounded-xl p-2 text-sm"
                              value={(a.tags || []).join(", ")}
                              onChange={(e) => updateAttachment(a.id, { tags: e.target.value })}
                              placeholder="soundtrack, trailer, lohc"
                            />
                          </label>
                        </div>

                        <label className="text-xs">
                          Notes (optional)
                          <textarea
                            className="mt-1 w-full border rounded-xl p-2 text-sm min-h-[70px]"
                            value={a.notes}
                            onChange={(e) => updateAttachment(a.id, { notes: e.target.value })}
                            placeholder="Use: cold open / act break / end card…"
                          />
                        </label>

                        <div className="flex items-center gap-2 flex-wrap">
                          {a.url ? (
                            <a
                              className="px-3 py-1.5 rounded-xl border border-gray-300 text-xs hover:bg-gray-50"
                              href={a.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open URL →
                            </a>
                          ) : null}
                          {a.thumbnail_url ? (
                            <a
                              className="px-3 py-1.5 rounded-xl border border-gray-300 text-xs hover:bg-gray-50"
                              href={a.thumbnail_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open Thumb →
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Library Picker */}
              <div className="mt-4 rounded-2xl border border-gray-200 p-3 bg-gray-50">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold">Add from Media Library</div>
                    <div className="text-xs opacity-70">
                      Pulls from your DB (tries <code>media</code> table, then <code>products</code>). Adds selected items into this page’s attachments.
                    </div>
                  </div>
                  <button
                    className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm hover:bg-white disabled:opacity-50"
                    onClick={() => loadMediaLibrary(attPickerQuery)}
                    disabled={attPickerBusy || saving}
                  >
                    {attPickerBusy ? "Loading…" : "Refresh"}
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    className="border rounded-xl p-2 text-sm"
                    value={attPickerQuery}
                    onChange={(e) => setAttPickerQuery(e.target.value)}
                    placeholder="Search title / tags…"
                  />
                  <select
                    className="border rounded-xl p-2 text-sm"
                    value={attPickerKind}
                    onChange={(e) => setAttPickerKind(e.target.value)}
                  >
                    <option value="all">all kinds</option>
                    <option value="image">image</option>
                    <option value="video">video</option>
                    <option value="audio">audio</option>
                    <option value="document">document</option>
                    <option value="link">link</option>
                  </select>
                  <button
                    className="px-3 py-2 rounded-xl border border-gray-300 text-sm hover:bg-white disabled:opacity-50"
                    onClick={() => loadMediaLibrary(attPickerQuery)}
                    disabled={attPickerBusy || saving}
                  >
                    Search
                  </button>
                </div>

                <div className="mt-3">
                  {libraryItems.length === 0 ? (
                    <div className="text-sm opacity-70">No library items loaded yet. Hit Refresh.</div>
                  ) : (
                    <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                      {libraryItems.map((it) => (
                        <div
                          key={it._key}
                          className="rounded-2xl border border-gray-200 bg-white p-3 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{it.title || "(untitled)"}</div>
                            <div className="text-xs opacity-70 mt-0.5">
                              <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">{it.kind}</span>{" "}
                              <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">{it.media_type}</span>{" "}
                              {it.license_tier ? (
                                <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-50">{it.license_tier}</span>
                              ) : null}
                            </div>
                            {it.url ? <div className="text-xs opacity-60 truncate mt-1">{it.url}</div> : null}
                          </div>
                          <div className="flex items-center gap-2">
                            {it.url ? (
                              <a
                                className="px-3 py-1.5 rounded-xl border border-gray-300 text-xs hover:bg-gray-50"
                                href={it.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open
                              </a>
                            ) : null}
                            <button
                              className="px-3 py-1.5 rounded-xl bg-black text-white text-xs hover:opacity-90 disabled:opacity-50"
                              onClick={() => addFromLibrary(it)}
                              disabled={(pAttachments || []).length >= MAX_ATTACHMENTS}
                              title="Add to this page’s attachments"
                            >
                              + Attach
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <label className="text-sm">
              Metadata JSON (optional)
              <textarea
                className="mt-1 w-full border rounded-xl p-2 min-h-[110px] font-mono text-xs"
                value={pMetaStr}
                onChange={(e) => setPMetaStr(e.target.value)}
                placeholder={`{\n "visibility": "public",\n "attachments": []\n}`}
              />
              <div className="text-[11px] opacity-60 mt-1">
                Advanced: any extra metadata you add here will be preserved, but <code>visibility</code> and <code>attachments</code> are enforced from the UI on Save.
              </div>
            </label>

            <label className="text-sm">
              Content (Markdown or plain text — paste)
              <textarea
                className="mt-1 w-full border rounded-xl p-3 min-h-[240px] font-mono text-xs"
                value={pContent}
                onChange={(e) => setPContent(e.target.value)}
                placeholder={`# ${pTitle || "Studio Page"}\n\n(Write/paste here.)\n`}
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
              onClick={savePage}
              disabled={saving || !selectedUniverseId || !pTitle.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {pId ? (
              <button
                className="px-4 py-2 rounded-xl border border-red-300 bg-red-50 text-red-900 disabled:opacity-50"
                onClick={deletePage}
                disabled={saving}
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
