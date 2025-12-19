// components/admin/UniversesTab.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/** =========================
 * Utils
 * ========================= */
function slugify(str = "") {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function toMoney(cents = 0) {
  const n = Number(cents || 0);
  return (n / 100).toFixed(2);
}

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

function extFromFile(file) {
  const name = String(file?.name || "");
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "bin";
}

function isLikelyMp4Url(url = "") {
  return String(url || "").toLowerCase().includes(".mp4");
}

function isImageLike(url = "") {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(String(url || ""));
}

/** =========================
 * ✅ Storage helpers (CLIENT-SAFE)
 * - Do NOT rely on listBuckets() in browser to work
 * - Force known bucket and route by type to correct folders
 * ========================= */
const DEFAULT_BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || "assets";

function normalizeExt(file) {
  const ext = extFromFile(file);
  return ext === "jpeg" ? "jpg" : ext;
}

function isMp4File(file) {
  const t = String(file?.type || "").toLowerCase();
  const n = String(file?.name || "").toLowerCase();
  return t === "video/mp4" || n.endsWith(".mp4");
}

function isImageFile(file) {
  const t = String(file?.type || "").toLowerCase();
  const n = String(file?.name || "").toLowerCase();
  return t.startsWith("image/") || /\.(png|jpg|jpeg|webp|gif)$/i.test(n);
}

function assertAllowed(file, allowed) {
  if (!file) throw new Error("No file selected.");
  if (allowed.includes("image") && isImageFile(file)) return;
  if (allowed.includes("mp4") && isMp4File(file)) return;
  const allowedText = allowed.join(", ");
  throw new Error(`Invalid file type. Allowed: ${allowedText}`);
}

function makeSafeFileName(file) {
  const ext = normalizeExt(file);
  const base = String(file?.name || "file")
    .toLowerCase()
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
  const rand = Math.random().toString(16).slice(2);
  return `${Date.now()}-${base || "file"}-${rand}.${ext}`;
}

async function uploadToStorage({
  bucket = DEFAULT_BUCKET,
  file,
  folder,
  upsert = true,
  allowed = ["image"], // ["image"], ["mp4"], ["image","mp4"]
}) {
  if (!bucket) throw new Error("No storage bucket selected.");
  assertAllowed(file, allowed);

  const safeName = makeSafeFileName(file);
  const path = `${folder}/${safeName}`;

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
    upsert,
    contentType: file.type || "application/octet-stream",
    cacheControl: "3600",
  });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const publicUrl = data?.publicUrl;

  if (!publicUrl) throw new Error("Failed to get public URL.");

  return { publicUrl, path, bucket };
}

export default function UniversesTab() {
  /** =========================
   * State
   * ========================= */
  const [universes, setUniverses] = useState([]);
  const [selectedUniverse, setSelectedUniverse] = useState(null);
  const [assets, setAssets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingUniverse, setSavingUniverse] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [notice, setNotice] = useState(null); // {type,msg}

  // ✅ Storage bucket handling
  const [buckets, setBuckets] = useState([]);
  const [storageBucket, setStorageBucket] = useState(""); // chosen bucket
  const [bucketReady, setBucketReady] = useState(false);

  // Universe form
  const [uTitle, setUTitle] = useState("");
  const [uSlug, setUSlug] = useState("");
  const [uTagline, setUTagline] = useState("");
  const [uLogline, setULogline] = useState("");
  const [uSynopsis, setUSynopsis] = useState("");
  const [uCover, setUCover] = useState("");
  const [uHeroVideo, setUHeroVideo] = useState("");
  const [uWorldMap, setUWorldMap] = useState("");
  const [uStatus, setUStatus] = useState("draft"); // draft|published

  // Product search
  const [division, setDivision] = useState("publishing");
  const [query, setQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const lastSearchKey = useRef("");

  // Universe asset CRUD
  const [assetEdits, setAssetEdits] = useState({});
  const [savingAssetIds, setSavingAssetIds] = useState({});

  // Quick-add
  const [qaDivision, setQaDivision] = useState("studios");
  const [qaType, setQaType] = useState("trailer");
  const [qaTitle, setQaTitle] = useState("");
  const [qaDesc, setQaDesc] = useState("");
  const [qaUrl, setQaUrl] = useState("");
  const [qaThumb, setQaThumb] = useState("");
  const [qaPublic, setQaPublic] = useState(true);
  const [qaPrice, setQaPrice] = useState("");
  const [qaStatus, setQaStatus] = useState("published");
  const [qaMetaStr, setQaMetaStr] = useState("");

  // Studio Pages (keep intact)
  const [studioPages, setStudioPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [savingPageId, setSavingPageId] = useState(null);

  const [pId, setPId] = useState(null);
  const [pType, setPType] = useState("one_sheet");
  const [pTitle, setPTitle] = useState("");
  const [pStatus, setPStatus] = useState("draft");
  const [pSort, setPSort] = useState(100);
  const [pExcerpt, setPExcerpt] = useState("");
  const [pHeroImg, setPHeroImg] = useState("");
  const [pHeroVid, setPHeroVid] = useState("");
  const [pContent, setPContent] = useState("");

  const PAGE_TYPES = useMemo(
    () => ["one_sheet", "series_bible", "press_kit", "negotiation", "roadmap", "prompts", "deck_copy"],
    []
  );

  const canEditUniverse = Boolean(selectedUniverse?.id);

  /** =========================
   * ✅ INIT: client-safe bucket selection
   * - Force DEFAULT_BUCKET immediately so uploads never depend on listBuckets()
   * ========================= */
  useEffect(() => {
    // ✅ client-safe: just pick the bucket we know exists
    const preferred = DEFAULT_BUCKET;
    setStorageBucket(preferred);
    setBucketReady(true);

    // Optional: try to load buckets for dropdown but don't block uploads if it fails
    (async () => {
      try {
        const { data } = await supabase.storage.listBuckets();
        setBuckets(data || []);
      } catch {
        setBuckets([]);
      }
    })();
  }, []);

  /** =========================
   * Reset helpers
   * ========================= */
  const resetUniverseForm = useCallback(() => {
    setUTitle("");
    setUSlug("");
    setUTagline("");
    setULogline("");
    setUSynopsis("");
    setUCover("");
    setUHeroVideo("");
    setUWorldMap("");
    setUStatus("draft");
  }, []);

  const resetQuickAdd = useCallback(() => {
    setQaDivision("studios");
    setQaType("trailer");
    setQaTitle("");
    setQaDesc("");
    setQaUrl("");
    setQaThumb("");
    setQaPublic(true);
    setQaPrice("");
    setQaStatus("published");
    setQaMetaStr("");
  }, []);

  const resetPageEditor = useCallback(() => {
    setPId(null);
    setPType("one_sheet");
    setPTitle("");
    setPStatus("draft");
    setPSort(100);
    setPExcerpt("");
    setPHeroImg("");
    setPHeroVid("");
    setPContent("");
  }, []);

  /** =========================
   * Loaders
   * ========================= */
  const loadUniverses = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    const { data, error } = await supabase.from("universes").select("*").order("updated_at", { ascending: false });
    if (error) {
      console.error(error);
      setUniverses([]);
      setNotice({ type: "error", msg: error.message || "Failed to load universes" });
    } else {
      setUniverses(data || []);
    }
    setLoading(false);
  }, []);

  const loadUniverseAssets = useCallback(async (universeId) => {
    if (!universeId) return;

    const { data, error } = await supabase
      .from("universe_assets")
      .select("*")
      .eq("universe_id", universeId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setAssets([]);
      setNotice({ type: "error", msg: error.message || "Failed to load universe items" });
    } else {
      setAssets(data || []);
    }

    setAssetEdits({});
    setSavingAssetIds({});
  }, []);

  const loadStudioPages = useCallback(async (universeId) => {
    if (!universeId) return;
    setLoadingPages(true);

    const { data, error } = await supabase
      .from("studio_pages")
      .select("*")
      .eq("universe_id", universeId)
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(error);
      setStudioPages([]);
      setNotice({ type: "error", msg: error.message || "Failed to load studio pages" });
    } else {
      setStudioPages(data || []);
    }
    setLoadingPages(false);
  }, []);

  useEffect(() => {
    loadUniverses();
  }, [loadUniverses]);

  useEffect(() => {
    if (!selectedUniverse?.id) return;
    loadUniverseAssets(selectedUniverse.id);
    loadStudioPages(selectedUniverse.id);
    resetPageEditor();
  }, [selectedUniverse?.id, loadUniverseAssets, loadStudioPages, resetPageEditor]);

  /** =========================
   * Select universe
   * ========================= */
  const selectUniverse = useCallback((u) => {
    setSelectedUniverse(u);
    setUTitle(u.title || "");
    setUSlug(u.slug || "");
    setUTagline(u.tagline || "");
    setULogline(u.logline || "");
    setUSynopsis(u.synopsis || "");
    setUCover(u.cover_image_url || "");
    setUHeroVideo(u.hero_video_url || "");
    setUWorldMap(u.world_map_url || "");
    setUStatus(u.status || "draft");
    setNotice(null);
  }, []);

  /** =========================
   * Save universe
   * ========================= */
  const saveUniverse = useCallback(
    async (nextStatus) => {
      setSavingUniverse(true);
      setNotice(null);

      try {
        const payload = {
          title: uTitle.trim(),
          slug: (uSlug || slugify(uTitle)).trim(),
          tagline: uTagline,
          logline: uLogline,
          synopsis: uSynopsis,
          cover_image_url: uCover,
          hero_video_url: uHeroVideo,
          world_map_url: uWorldMap,
          status: (nextStatus || uStatus || "draft").trim(),
          division: "publishing",
          updated_at: new Date().toISOString(),
        };

        if (!payload.title) throw new Error("Title is required.");
        if (!payload.slug) throw new Error("Slug is required.");

        if (selectedUniverse?.id) {
          const { error } = await supabase.from("universes").update(payload).eq("id", selectedUniverse.id);
          if (error) throw error;
          setNotice({ type: "ok", msg: payload.status === "published" ? "Universe published." : "Universe saved." });
        } else {
          const { data, error } = await supabase.from("universes").insert([payload]).select("*").single();
          if (error) throw error;
          setSelectedUniverse(data);
          setNotice({ type: "ok", msg: payload.status === "published" ? "Universe created + published." : "Universe created." });
        }

        await loadUniverses();
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Failed to save universe" });
      } finally {
        setSavingUniverse(false);
      }
    },
    [uTitle, uSlug, uTagline, uLogline, uSynopsis, uCover, uHeroVideo, uWorldMap, uStatus, selectedUniverse?.id, loadUniverses]
  );

  const publishUniverse = useCallback(async () => {
    setUStatus("published");
    await saveUniverse("published");
  }, [saveUniverse]);

  const unpublishUniverse = useCallback(async () => {
    setUStatus("draft");
    await saveUniverse("draft");
  }, [saveUniverse]);

  const deleteUniverse = useCallback(async () => {
    if (!selectedUniverse?.id) return;
    if (!confirm("Delete this universe AND all its universe items? This cannot be undone.")) return;

    try {
      setSavingUniverse(true);
      setNotice(null);

      const { error: aErr } = await supabase.from("universe_assets").delete().eq("universe_id", selectedUniverse.id);
      if (aErr) throw aErr;

      const { error: pErr } = await supabase.from("studio_pages").delete().eq("universe_id", selectedUniverse.id);
      if (pErr) throw pErr;

      const { error: uErr } = await supabase.from("universes").delete().eq("id", selectedUniverse.id);
      if (uErr) throw uErr;

      setSelectedUniverse(null);
      resetUniverseForm();
      setAssets([]);
      setStudioPages([]);
      resetPageEditor();
      setProductResults([]);
      setAssetEdits({});
      resetQuickAdd();
      setNotice({ type: "ok", msg: "Universe deleted." });
      await loadUniverses();
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to delete universe" });
    } finally {
      setSavingUniverse(false);
    }
  }, [selectedUniverse?.id, resetUniverseForm, resetPageEditor, loadUniverses, resetQuickAdd]);

  /** =========================
   * ✅ Persist field immediately (cover/map/hero uploads)
   * ========================= */
  const persistUniverseField = useCallback(
    async (field, value) => {
      if (!selectedUniverse?.id) return;
      const { error } = await supabase
        .from("universes")
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq("id", selectedUniverse.id);
      if (error) throw error;
    },
    [selectedUniverse?.id]
  );

  /** =========================
   * ✅ Universe Cover Upload (image → images/universes/{slug}/cover)
   * ========================= */
  const uploadCoverFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!storageBucket) {
        setNotice({ type: "error", msg: "No storage bucket selected." });
        return;
      }
      try {
        setUploading(true);
        setNotice(null);

        const slug = (uSlug || selectedUniverse?.slug || slugify(uTitle)).trim() || "universe";

        const { publicUrl, path } = await uploadToStorage({
          bucket: storageBucket,
          file,
          folder: `images/universes/${slug}/cover`,
          allowed: ["image"],
        });

        setUCover(publicUrl);
        if (selectedUniverse?.id) await persistUniverseField("cover_image_url", publicUrl);

        // (Optional) If your universes table has a metadata jsonb column, you can store the storage path:
        // await supabase
        //   .from("universes")
        //   .update({ metadata: { ...(selectedUniverse?.metadata || {}), storage: { ...(selectedUniverse?.metadata?.storage || {}), cover: { bucket: storageBucket, path } } } })
        //   .eq("id", selectedUniverse.id);

        setNotice({ type: "ok", msg: "Cover uploaded and saved." });
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Cover upload failed" });
      } finally {
        setUploading(false);
      }
    },
    [storageBucket, uSlug, uTitle, selectedUniverse?.id, selectedUniverse?.slug, persistUniverseField]
  );

  /** =========================
   * ✅ Hero Video Upload (mp4 → videos/universes/{slug}/hero)
   * ========================= */
  const uploadHeroVideoFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!storageBucket) {
        setNotice({ type: "error", msg: "No storage bucket selected." });
        return;
      }

      try {
        setUploading(true);
        setNotice(null);

        const slug = (uSlug || selectedUniverse?.slug || slugify(uTitle)).trim() || "universe";

        const { publicUrl } = await uploadToStorage({
          bucket: storageBucket,
          file,
          folder: `videos/universes/${slug}/hero`,
          allowed: ["mp4"],
        });

        setUHeroVideo(publicUrl);
        if (selectedUniverse?.id) await persistUniverseField("hero_video_url", publicUrl);

        setNotice({ type: "ok", msg: "Hero video uploaded and saved." });
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Hero video upload failed" });
      } finally {
        setUploading(false);
      }
    },
    [storageBucket, uSlug, uTitle, selectedUniverse?.id, selectedUniverse?.slug, persistUniverseField]
  );

  /** =========================
   * ✅ Featured World Map Upload (image → images/universes/{slug}/world-map/featured)
   * ========================= */
  const uploadFeaturedWorldMapFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!storageBucket) {
        setNotice({ type: "error", msg: "No storage bucket selected." });
        return;
      }
      try {
        setUploading(true);
        setNotice(null);

        const slug = (uSlug || selectedUniverse?.slug || slugify(uTitle)).trim() || "universe";

        const { publicUrl } = await uploadToStorage({
          bucket: storageBucket,
          file,
          folder: `images/universes/${slug}/world-map/featured`,
          allowed: ["image"],
        });

        setUWorldMap(publicUrl);
        if (selectedUniverse?.id) await persistUniverseField("world_map_url", publicUrl);

        setNotice({ type: "ok", msg: "Featured world map uploaded and saved." });
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "World map upload failed" });
      } finally {
        setUploading(false);
      }
    },
    [storageBucket, uSlug, uTitle, selectedUniverse?.id, selectedUniverse?.slug, persistUniverseField]
  );

  /** =========================
   * Studio pages (kept intact)
   * ========================= */
  const selectPage = useCallback((pg) => {
    setPId(pg.id);
    setPType(pg.page_type || "one_sheet");
    setPTitle(pg.title || "");
    setPStatus(pg.status || "draft");
    setPSort(pg.sort_order ?? 100);
    setPExcerpt(pg.excerpt || "");
    setPHeroImg(pg.hero_image_url || "");
    setPHeroVid(pg.hero_video_url || "");
    setPContent(pg.content_md || "");
  }, []);

  const savePage = useCallback(async () => {
    if (!selectedUniverse?.id) {
      setNotice({ type: "error", msg: "Select or create a universe first." });
      return;
    }
    if (!pTitle.trim()) {
      setNotice({ type: "error", msg: "Page title is required." });
      return;
    }

    setSavingPageId(pId || "new");
    setNotice(null);

    const payload = {
      universe_id: selectedUniverse.id,
      page_type: pType,
      title: pTitle.trim(),
      status: pStatus,
      sort_order: clampInt(pSort, 100),
      excerpt: pExcerpt || null,
      hero_image_url: pHeroImg || null,
      hero_video_url: pHeroVid || null,
      content_md: pContent || "",
      updated_at: new Date().toISOString(),
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

      await loadStudioPages(selectedUniverse.id);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to save studio page" });
    } finally {
      setSavingPageId(null);
    }
  }, [selectedUniverse?.id, pId, pType, pTitle, pStatus, pSort, pExcerpt, pHeroImg, pHeroVid, pContent, loadStudioPages]);

  const deletePage = useCallback(async () => {
    if (!selectedUniverse?.id || !pId) return;
    if (!confirm("Delete this studio page?")) return;

    setSavingPageId(pId);
    setNotice(null);

    try {
      const { error } = await supabase.from("studio_pages").delete().eq("id", pId);
      if (error) throw error;
      setNotice({ type: "ok", msg: "Studio page deleted." });
      resetPageEditor();
      await loadStudioPages(selectedUniverse.id);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to delete studio page" });
    } finally {
      setSavingPageId(null);
    }
  }, [selectedUniverse?.id, pId, loadStudioPages, resetPageEditor]);

  /** =========================
   * Products attach (kept intact)
   * ========================= */
  const searchProducts = useCallback(async () => {
    setSearching(true);
    setNotice(null);
    try {
      const qtxt = query.trim();
      const searchKey = `${division}::${qtxt}`;
      lastSearchKey.current = searchKey;

      let q = supabase
        .from("products")
        .select("id,name,slug,division,price,image_url,tags,description,thumbnail_url,updated_at")
        .eq("division", division)
        .order("updated_at", { ascending: false })
        .limit(10);

      if (qtxt) q = q.or(`name.ilike.%${qtxt}%,slug.ilike.%${qtxt}%`);

      const { data, error } = await q;
      if (lastSearchKey.current !== searchKey) return;
      if (error) throw error;

      setProductResults(data || []);
    } catch (e) {
      console.error(e);
      setProductResults([]);
      setNotice({ type: "error", msg: e?.message || "Search failed" });
    } finally {
      setSearching(false);
    }
  }, [division, query]);

  useEffect(() => {
    if (!selectedUniverse?.id) return;
    if (query.trim() !== "") return;
    searchProducts();
  }, [division, selectedUniverse?.id, query, searchProducts]);

  const addProductToUniverse = useCallback(
    async (product) => {
      if (!selectedUniverse?.id) {
        setNotice({ type: "error", msg: "Select or create a universe first." });
        return;
      }
      const already = assets.some((a) => a.source_type === "product" && a.source_product_id === product.id);
      if (already) {
        setNotice({ type: "error", msg: "That product is already in this universe." });
        return;
      }

      const internalUrl =
        product.division === "publishing"
          ? `/publishing/${product.slug}`
          : product.division === "designs"
          ? `/designs/${product.slug}`
          : product.division === "capital"
          ? `/capital`
          : product.division === "realty"
          ? `/realty`
          : `/`;

      const assetType = product.division === "publishing" ? "book" : product.division === "designs" ? "merch" : "product";

      try {
        const maxSort = assets.length ? Math.max(...assets.map((x) => clampInt(x.sort_order, 0))) : 0;

        const insertRow = {
          universe_id: selectedUniverse.id,
          division: product.division,
          asset_type: assetType,
          title: product.name,
          description: product.description || "Linked from Products.",
          external_url: internalUrl,
          thumbnail_url: product.thumbnail_url || product.image_url || null,
          is_public: true,
          status: "published",
          sort_order: maxSort + 10,
          source_type: "product",
          source_product_id: product.id,
          metadata: {
            source: "products",
            product_id: product.id,
            product_slug: product.slug,
            product_division: product.division,
          },
        };

        const { error } = await supabase.from("universe_assets").insert([insertRow]);
        if (error) throw error;

        setNotice({ type: "ok", msg: "Added to universe." });
        await loadUniverseAssets(selectedUniverse.id);
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Failed to add product" });
      }
    },
    [selectedUniverse?.id, assets, loadUniverseAssets]
  );

  /** =========================
   * Asset edit helpers
   * ========================= */
  const setAssetField = useCallback((assetId, patch) => {
    setAssetEdits((prev) => ({ ...prev, [assetId]: { ...(prev[assetId] || {}), ...patch } }));
  }, []);

  const getAssetVal = useCallback(
    (asset, key, fallback = "") => {
      const row = assetEdits[asset.id] || {};
      if (row[key] !== undefined) return row[key];
      return asset[key] ?? fallback;
    },
    [assetEdits]
  );

  const getAssetMetaStr = useCallback(
    (asset) => {
      const row = assetEdits[asset.id] || {};
      if (row.metadataStr !== undefined) return row.metadataStr;
      return JSON.stringify(asset.metadata || {}, null, 0);
    },
    [assetEdits]
  );

  const saveAsset = useCallback(
    async (asset) => {
      const row = assetEdits[asset.id] || {};
      if (!Object.keys(row).length) {
        setNotice({ type: "ok", msg: "No changes to save." });
        return;
      }

      try {
        setSavingAssetIds((prev) => ({ ...prev, [asset.id]: true }));
        setNotice(null);

        const payload = {};
        if (row.title !== undefined) payload.title = row.title;
        if (row.description !== undefined) payload.description = row.description;
        if (row.division !== undefined) payload.division = row.division;
        if (row.asset_type !== undefined) payload.asset_type = row.asset_type;
        if (row.external_url !== undefined) payload.external_url = row.external_url;
        if (row.thumbnail_url !== undefined) payload.thumbnail_url = row.thumbnail_url;
        if (row.status !== undefined) payload.status = row.status;
        if (row.sort_order !== undefined) payload.sort_order = clampInt(row.sort_order, asset.sort_order || 0);
        if (row.is_public !== undefined) payload.is_public = Boolean(row.is_public);
        if (row.price_cents !== undefined) payload.price_cents = clampInt(row.price_cents, 0);
        if (row.metadataStr !== undefined) payload.metadata = safeJsonParse(row.metadataStr, asset.metadata || {});
        payload.updated_at = new Date().toISOString();

        const { error } = await supabase.from("universe_assets").update(payload).eq("id", asset.id);
        if (error) throw error;

        setAssetEdits((prev) => ({ ...prev, [asset.id]: {} }));
        setNotice({ type: "ok", msg: "Universe item saved." });

        if (selectedUniverse?.id) await loadUniverseAssets(selectedUniverse.id);
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Failed to save item" });
      } finally {
        setSavingAssetIds((prev) => ({ ...prev, [asset.id]: false }));
      }
    },
    [assetEdits, selectedUniverse?.id, loadUniverseAssets]
  );

  const removeAsset = useCallback(
    async (assetId) => {
      if (!selectedUniverse?.id) return;
      if (!confirm("Remove this item from the universe?")) return;

      const { error } = await supabase.from("universe_assets").delete().eq("id", assetId);
      if (error) {
        console.error(error);
        setNotice({ type: "error", msg: error.message || "Failed to remove item" });
        return;
      }
      setNotice({ type: "ok", msg: "Removed." });
      await loadUniverseAssets(selectedUniverse.id);
    },
    [selectedUniverse?.id, loadUniverseAssets]
  );

  const moveAsset = useCallback(
    async (assetId, direction) => {
      const idx = assets.findIndex((a) => a.id === assetId);
      if (idx === -1) return;

      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= assets.length) return;

      const a1 = assets[idx];
      const a2 = assets[targetIdx];
      const so1 = clampInt(a1.sort_order, 0);
      const so2 = clampInt(a2.sort_order, 0);

      try {
        setNotice(null);
        setSavingAssetIds((prev) => ({ ...prev, [a1.id]: true, [a2.id]: true }));

        const { error: e1 } = await supabase
          .from("universe_assets")
          .update({ sort_order: so2, updated_at: new Date().toISOString() })
          .eq("id", a1.id);
        if (e1) throw e1;

        const { error: e2 } = await supabase
          .from("universe_assets")
          .update({ sort_order: so1, updated_at: new Date().toISOString() })
          .eq("id", a2.id);
        if (e2) throw e2;

        setNotice({ type: "ok", msg: "Reordered." });
        if (selectedUniverse?.id) await loadUniverseAssets(selectedUniverse.id);
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Failed to reorder" });
      } finally {
        setSavingAssetIds((prev) => ({ ...prev, [a1.id]: false, [a2.id]: false }));
      }
    },
    [assets, selectedUniverse?.id, loadUniverseAssets]
  );

  /** =========================
   * ✅ Upload thumb for existing asset and persist immediately
   * - image → images/...
   * - mp4   → videos/...
   * ========================= */
  const uploadAssetThumbFile = useCallback(
    async (asset, file) => {
      if (!selectedUniverse?.id) {
        setNotice({ type: "error", msg: "Select a universe first." });
        return;
      }
      if (!asset?.id || !file) return;
      if (!storageBucket) {
        setNotice({ type: "error", msg: "No storage bucket selected." });
        return;
      }

      try {
        setUploading(true);
        setNotice(null);

        const slug = (uSlug || selectedUniverse?.slug || slugify(uTitle)).trim() || "universe";
        const isMp4 = isMp4File(file);
        const folder = isMp4
          ? `videos/universes/${slug}/universe-items/${asset.id}/thumbnail`
          : `images/universes/${slug}/universe-items/${asset.id}/thumbnail`;

        const { publicUrl, path } = await uploadToStorage({
          bucket: storageBucket,
          file,
          folder,
          allowed: ["image", "mp4"],
        });

        const metaStr = getAssetMetaStr(asset);
        const metaObj = safeJsonParse(metaStr, asset.metadata || {});
        metaObj.storage = metaObj.storage || {};
        metaObj.storage.thumbnail = { bucket: storageBucket, path };
        if (isMp4) metaObj.thumb_kind = "video";
        else if (metaObj.thumb_kind) delete metaObj.thumb_kind;

        const { error } = await supabase
          .from("universe_assets")
          .update({ thumbnail_url: publicUrl, metadata: metaObj, updated_at: new Date().toISOString() })
          .eq("id", asset.id);

        if (error) throw error;

        setNotice({ type: "ok", msg: "Thumbnail uploaded and saved." });
        await loadUniverseAssets(selectedUniverse.id);
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Item thumbnail upload failed" });
      } finally {
        setUploading(false);
      }
    },
    [storageBucket, selectedUniverse?.id, selectedUniverse?.slug, uSlug, uTitle, getAssetMetaStr, loadUniverseAssets]
  );

  /** =========================
   * Quick Add thumb upload (image OR mp4)
   * - image → images/...
   * - mp4   → videos/...
   * ========================= */
  const uploadQuickAddThumbFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!storageBucket) {
        setNotice({ type: "error", msg: "No storage bucket selected." });
        return;
      }
      try {
        setUploading(true);
        setNotice(null);

        const slug = (uSlug || selectedUniverse?.slug || slugify(uTitle)).trim() || "universe";
        const isMp4 = isMp4File(file);

        const folder = isMp4
          ? `videos/universes/${slug}/universe-items/thumbnails`
          : `images/universes/${slug}/universe-items/thumbnails`;

        const { publicUrl, path } = await uploadToStorage({
          bucket: storageBucket,
          file,
          folder,
          allowed: ["image", "mp4"],
        });

        setQaThumb(publicUrl);

        const nextMeta = safeJsonParse(qaMetaStr, {});
        nextMeta.storage = nextMeta.storage || {};
        nextMeta.storage.thumbnail = { bucket: storageBucket, path };
        if (isMp4) nextMeta.thumb_kind = "video";
        else if (nextMeta.thumb_kind) delete nextMeta.thumb_kind;

        setQaMetaStr(JSON.stringify(nextMeta));
        setNotice({ type: "ok", msg: "Thumbnail uploaded. Now click Add Item." });
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Thumbnail upload failed" });
      } finally {
        setUploading(false);
      }
    },
    [storageBucket, uSlug, selectedUniverse?.slug, uTitle, qaMetaStr]
  );

  /** =========================
   * ✅ World Map Gallery (uploads create universe_assets rows)
   * - Batch images only
   * - images/universes/{slug}/world-map/gallery
   * ========================= */
  const uploadWorldMapGallery = useCallback(
    async (files) => {
      if (!selectedUniverse?.id) {
        setNotice({ type: "error", msg: "Select or create a universe first." });
        return;
      }
      if (!storageBucket) {
        setNotice({ type: "error", msg: "No storage bucket selected." });
        return;
      }
      const list = Array.from(files || []);
      if (!list.length) return;

      try {
        setUploading(true);
        setNotice(null);

        const maxSort = assets.length ? Math.max(...assets.map((x) => clampInt(x.sort_order, 0))) : 0;
        const slug = (uSlug || selectedUniverse.slug || slugify(uTitle)).trim() || "universe";

        const rows = [];
        let nextSort = maxSort + 10;

        for (let i = 0; i < list.length; i++) {
          const file = list[i];
          if (!isImageFile(file)) continue;

          const { publicUrl, path } = await uploadToStorage({
            bucket: storageBucket,
            file,
            folder: `images/universes/${slug}/world-map/gallery`,
            allowed: ["image"],
          });

          const baseTitle = String(file.name || "").replace(/\.[^/.]+$/, "");
          rows.push({
            universe_id: selectedUniverse.id,
            division: "studios",
            asset_type: "world_map",
            title: baseTitle || `World Map ${i + 1}`,
            description: "World map gallery image.",
            external_url: publicUrl,
            thumbnail_url: publicUrl,
            is_public: true,
            status: "published",
            sort_order: nextSort,
            source_type: "manual",
            metadata: { kind: "world_map", role: "gallery", storage: { bucket: storageBucket, path } },
            updated_at: new Date().toISOString(),
          });

          nextSort += 10;
        }

        if (!rows.length) {
          setNotice({ type: "error", msg: "No valid image files selected." });
          return;
        }

        const { error } = await supabase.from("universe_assets").insert(rows);
        if (error) throw error;

        setNotice({ type: "ok", msg: `Uploaded ${rows.length} world map images and saved to universe_assets.` });
        await loadUniverseAssets(selectedUniverse.id);
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Gallery upload failed" });
      } finally {
        setUploading(false);
      }
    },
    [storageBucket, selectedUniverse?.id, selectedUniverse?.slug, assets, uSlug, uTitle, loadUniverseAssets]
  );

  /** =========================
   * ✅ World Map Regions CRUD (world_map_regions)
   * ========================= */
  const [selectedWorldMapAssetId, setSelectedWorldMapAssetId] = useState(null);
  const [regions, setRegions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [savingRegionId, setSavingRegionId] = useState(null);

  const loadRegions = useCallback(
    async (universeId, worldMapAssetId) => {
      if (!universeId) return;
      setLoadingRegions(true);
      setNotice(null);

      let q = supabase
        .from("world_map_regions")
        .select("*")
        .eq("universe_id", universeId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      // if map selected, filter to it
      if (worldMapAssetId) q = q.eq("world_map_asset_id", worldMapAssetId);

      const { data, error } = await q;
      if (error) {
        console.error(error);
        setRegions([]);
        setNotice({ type: "error", msg: error.message || "Failed to load regions" });
      } else {
        setRegions(data || []);
      }
      setLoadingRegions(false);
    },
    []
  );

  useEffect(() => {
    if (!selectedUniverse?.id) return;
    // default: load all regions for universe
    loadRegions(selectedUniverse.id, selectedWorldMapAssetId);
  }, [selectedUniverse?.id, selectedWorldMapAssetId, loadRegions]);

  const [rTitle, setRTitle] = useState("");
  const [rDesc, setRDesc] = useState("");
  const [rSort, setRSort] = useState(0);
  const [rMeta, setRMeta] = useState("");

  const resetRegionForm = useCallback(() => {
    setRTitle("");
    setRDesc("");
    setRSort(0);
    setRMeta("");
  }, []);

  const addRegion = useCallback(async () => {
    if (!selectedUniverse?.id) return;
    if (!rTitle.trim()) {
      setNotice({ type: "error", msg: "Region title is required." });
      return;
    }
    try {
      setSavingRegionId("new");
      setNotice(null);

      const payload = {
        universe_id: selectedUniverse.id,
        world_map_asset_id: selectedWorldMapAssetId || null,
        title: rTitle.trim(),
        description: rDesc || null,
        sort_order: clampInt(rSort, 0),
        metadata: safeJsonParse(rMeta, {}),
      };

      const { error } = await supabase.from("world_map_regions").insert([payload]);
      if (error) throw error;

      setNotice({ type: "ok", msg: "Region added." });
      resetRegionForm();
      await loadRegions(selectedUniverse.id, selectedWorldMapAssetId);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to add region" });
    } finally {
      setSavingRegionId(null);
    }
  }, [selectedUniverse?.id, selectedWorldMapAssetId, rTitle, rDesc, rSort, rMeta, loadRegions, resetRegionForm]);

  const updateRegion = useCallback(
    async (regionId, patch) => {
      try {
        setSavingRegionId(regionId);
        const { error } = await supabase.from("world_map_regions").update(patch).eq("id", regionId);
        if (error) throw error;
        await loadRegions(selectedUniverse.id, selectedWorldMapAssetId);
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Failed to update region" });
      } finally {
        setSavingRegionId(null);
      }
    },
    [selectedUniverse?.id, selectedWorldMapAssetId, loadRegions]
  );

  const deleteRegion = useCallback(
    async (regionId) => {
      if (!confirm("Delete this region?")) return;
      try {
        setSavingRegionId(regionId);
        const { error } = await supabase.from("world_map_regions").delete().eq("id", regionId);
        if (error) throw error;
        setNotice({ type: "ok", msg: "Region deleted." });
        await loadRegions(selectedUniverse.id, selectedWorldMapAssetId);
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Failed to delete region" });
      } finally {
        setSavingRegionId(null);
      }
    },
    [selectedUniverse?.id, selectedWorldMapAssetId, loadRegions]
  );

  /** =========================
   * Quick add custom asset (kept)
   * ========================= */
  const addCustomAsset = useCallback(async () => {
    if (!selectedUniverse?.id) {
      setNotice({ type: "error", msg: "Select or create a universe first." });
      return;
    }
    if (!qaTitle.trim()) {
      setNotice({ type: "error", msg: "Title is required for the universe item." });
      return;
    }

    try {
      setNotice(null);

      const maxSort = assets.length ? Math.max(...assets.map((x) => clampInt(x.sort_order, 0))) : 0;
      const dollars = Number(String(qaPrice || "").trim());
      const priceCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;

      const metaObj = safeJsonParse(qaMetaStr, {});
      const thumbIsVideo = isLikelyMp4Url(qaThumb) || String(metaObj?.thumb_kind || "").toLowerCase() === "video";

      const insertRow = {
        universe_id: selectedUniverse.id,
        division: qaDivision,
        asset_type: qaType,
        title: qaTitle.trim(),
        description: qaDesc || "",
        external_url: qaUrl || "",
        thumbnail_url: qaThumb || null,
        is_public: Boolean(qaPublic),
        status: qaStatus || "published",
        sort_order: maxSort + 10,
        price_cents: qaPublic ? 0 : priceCents,
        source_type: "manual",
        metadata: {
          ...metaObj,
          ...(thumbIsVideo ? { thumb_kind: "video" } : {}),
        },
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("universe_assets").insert([insertRow]);
      if (error) throw error;

      setNotice({ type: "ok", msg: "Universe item added." });
      resetQuickAdd();
      await loadUniverseAssets(selectedUniverse.id);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to add universe item" });
    }
  }, [selectedUniverse?.id, qaDivision, qaType, qaTitle, qaDesc, qaUrl, qaThumb, qaPublic, qaPrice, qaStatus, qaMetaStr, assets, resetQuickAdd, loadUniverseAssets]);

  const primeQuickAddForCharacter = useCallback(() => {
    setQaDivision("studios");
    setQaType("character");
    setQaStatus("published");
    setQaPublic(true);
    const current = safeJsonParse(qaMetaStr, {});
    if (!Object.keys(current || {}).length) setQaMetaStr(JSON.stringify({ kind: "character", role: "cast" }));
    if (!qaTitle) setQaTitle("Character — Name");
    if (!qaDesc) setQaDesc("Bio / role / motivation / arc.");
  }, [qaMetaStr, qaTitle, qaDesc]);

  /** =========================
   * ✅ Local (no-RPC) backfill tool: thumbnails from external_url
   * ========================= */
  const backfillThumbnailsLocal = useCallback(async () => {
    if (!selectedUniverse?.id) return;
    try {
      setNotice(null);
      const { data, error } = await supabase
        .from("universe_assets")
        .select("id,external_url,thumbnail_url")
        .eq("universe_id", selectedUniverse.id);

      if (error) throw error;

      const toFix = (data || []).filter(
        (r) =>
          (!r.thumbnail_url || !String(r.thumbnail_url).trim()) &&
          r.external_url &&
          /\.(png|jpg|jpeg|webp|gif|mp4)$/i.test(String(r.external_url))
      );

      if (!toFix.length) {
        setNotice({ type: "ok", msg: "No thumbnails to backfill." });
        return;
      }

      for (const row of toFix) {
        await supabase
          .from("universe_assets")
          .update({ thumbnail_url: row.external_url, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      }

      setNotice({ type: "ok", msg: `Backfilled ${toFix.length} thumbnails from external_url.` });
      await loadUniverseAssets(selectedUniverse.id);
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Backfill failed" });
    }
  }, [selectedUniverse?.id, loadUniverseAssets]);

  /** =========================
   * Derived views
   * ========================= */
  const missingCharacterThumbCount = useMemo(
    () => assets.filter((a) => a.asset_type === "character" && (!a.thumbnail_url || !String(a.thumbnail_url).trim())).length,
    [assets]
  );

  const missingWorldMapTitleCount = useMemo(
    () => assets.filter((a) => a.asset_type === "world_map" && (!a.title || !String(a.title).trim())).length,
    [assets]
  );

  const universeStatusBadge = useMemo(() => {
    const s = String(selectedUniverse?.status || uStatus || "draft");
    const isPub = s === "published";
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs ${
          isPub ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"
        }`}
      >
        {isPub ? "published" : "draft"}
      </span>
    );
  }, [selectedUniverse?.status, uStatus]);

  const worldMapAssets = useMemo(
    () => assets.filter((a) => String(a.asset_type || "").toLowerCase() === "world_map"),
    [assets]
  );

  /** =========================
   * Render
   * ========================= */
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Universes (Studios)</h2>
          <p className="text-sm opacity-70">
            Create a universe, publish it, then curate items (world maps, characters, trailers, audio, decks) into the Studio page.
          </p>

          <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px] opacity-70">
            <span>Storage bucket:</span>
            <code className="px-2 py-0.5 rounded border">{storageBucket || "NONE"}</code>

            {bucketReady && buckets.length > 0 && (
              <select
                className="border rounded-xl p-1 text-[12px]"
                value={storageBucket}
                onChange={(e) => {
                  setStorageBucket(e.target.value);
                  setNotice({ type: "ok", msg: `Storage bucket set to '${e.target.value}'.` });
                }}
              >
                {buckets.map((b) => (
                  <option key={b.id || b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}

            {bucketReady && !storageBucket && (
              <span className="text-red-700">Create a bucket in Supabase → Storage (ex: assets) to enable uploads.</span>
            )}
          </div>
        </div>

        <button
          className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50"
          onClick={() => {
            setSelectedUniverse(null);
            resetUniverseForm();
            setAssets([]);
            setStudioPages([]);
            resetPageEditor();
            setProductResults([]);
            setAssetEdits({});
            resetQuickAdd();
            setNotice(null);
            setSelectedWorldMapAssetId(null);
            setRegions([]);
            resetRegionForm();
          }}
        >
          + New Universe
        </button>
      </div>

      {notice?.msg && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {notice.msg}
        </div>
      )}

      {/* Universe list + editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-gray-200 p-4">
          <div className="font-semibold mb-3">Universes</div>
          {loading ? (
            <div className="opacity-70">Loading…</div>
          ) : universes.length === 0 ? (
            <div className="opacity-70">No universes yet.</div>
          ) : (
            <div className="space-y-2">
              {universes.map((u) => {
                const isPub = String(u.status || "draft") === "published";
                return (
                  <button
                    key={u.id}
                    onClick={() => selectUniverse(u)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      selectedUniverse?.id === u.id ? "border-black" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{u.title}</div>
                      <span
                        className={`px-2 py-0.5 rounded-full border text-xs ${
                          isPub ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"
                        }`}
                      >
                        {isPub ? "published" : "draft"}
                      </span>
                    </div>
                    <div className="text-xs opacity-70">{u.slug}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="font-semibold">{canEditUniverse ? "Edit Universe" : "Create Universe"}</div>
            <div className="flex items-center gap-2">
              {canEditUniverse && universeStatusBadge}
              {selectedUniverse?.slug && (
                <a
                  className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm"
                  href={`/studios/${selectedUniverse.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Studio Page →
                </a>
              )}
            </div>
          </div>

          {/* Warnings */}
          {canEditUniverse && (missingCharacterThumbCount > 0 || missingWorldMapTitleCount > 0) && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-semibold">Fix Needed</div>
              <ul className="list-disc ml-5 mt-1">
                {missingCharacterThumbCount > 0 && <li>{missingCharacterThumbCount} character(s) missing thumbnails.</li>}
                {missingWorldMapTitleCount > 0 && <li>{missingWorldMapTitleCount} world map(s) missing titles.</li>}
              </ul>
              <div className="mt-2 flex gap-2 flex-wrap">
                <button className="px-3 py-1.5 rounded-xl border border-gray-300" onClick={backfillThumbnailsLocal}>
                  Backfill thumbnails from external_url
                </button>
              </div>
            </div>
          )}

          {!storageBucket && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-semibold">Uploads disabled</div>
              <div className="mt-1">
                Supabase Storage bucket not found. Create one in Supabase → Storage (recommended name: <code>assets</code>), then pick it
                in the dropdown above.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm">
              Title
              <input
                className="mt-1 w-full border rounded-xl p-2"
                value={uTitle}
                onChange={(e) => {
                  const v = e.target.value;
                  setUTitle(v);
                  if (!canEditUniverse) setUSlug(slugify(v));
                }}
                placeholder="Legacy of the Hidden Clans"
              />
            </label>

            <label className="text-sm">
              Slug
              <input className="mt-1 w-full border rounded-xl p-2" value={uSlug} onChange={(e) => setUSlug(slugify(e.target.value))} />
            </label>

            <label className="text-sm md:col-span-2">
              Tagline
              <input className="mt-1 w-full border rounded-xl p-2" value={uTagline} onChange={(e) => setUTagline(e.target.value)} />
            </label>

            <label className="text-sm md:col-span-2">
              Logline
              <input className="mt-1 w-full border rounded-xl p-2" value={uLogline} onChange={(e) => setULogline(e.target.value)} />
            </label>

            <label className="text-sm md:col-span-2">
              Synopsis
              <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[110px]" value={uSynopsis} onChange={(e) => setUSynopsis(e.target.value)} />
            </label>

            {/* Cover */}
            <label className="text-sm">
              Cover Image URL
              <input className="mt-1 w-full border rounded-xl p-2" value={uCover} onChange={(e) => setUCover(e.target.value)} />
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <input type="file" accept="image/*" disabled={uploading || !storageBucket} onChange={(e) => uploadCoverFile(e.target.files?.[0])} />
                {uCover ? <img src={uCover} alt="" className="h-16 w-16 rounded-xl object-cover border" /> : null}
              </div>
            </label>

            {/* Hero Video */}
            <label className="text-sm">
              Hero Video URL
              <input className="mt-1 w-full border rounded-xl p-2" value={uHeroVideo} onChange={(e) => setUHeroVideo(e.target.value)} />
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <input
                  type="file"
                  accept="video/mp4"
                  disabled={uploading || !storageBucket}
                  onChange={(e) => uploadHeroVideoFile(e.target.files?.[0])}
                />
                {uHeroVideo && isLikelyMp4Url(uHeroVideo) ? (
                  <video src={uHeroVideo} className="h-16 w-24 rounded-xl object-cover border" muted playsInline loop autoPlay />
                ) : null}
              </div>
              <div className="text-[11px] opacity-60 mt-1">Uploads mp4 into Storage and saves to universes.hero_video_url.</div>
            </label>

            {/* Featured World Map */}
            <label className="text-sm">
              World Map URL (featured)
              <input className="mt-1 w-full border rounded-xl p-2" value={uWorldMap} onChange={(e) => setUWorldMap(e.target.value)} />
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <input type="file" accept="image/*" disabled={uploading || !storageBucket} onChange={(e) => uploadFeaturedWorldMapFile(e.target.files?.[0])} />
                {uWorldMap ? <img src={uWorldMap} alt="" className="h-16 w-24 rounded-xl object-cover border" /> : null}
              </div>
              <div className="text-[11px] opacity-60 mt-1">
                This saves to <code>universes.world_map_url</code> and updates immediately once the universe exists.
              </div>
            </label>

            <label className="text-sm">
              Status
              <select className="mt-1 w-full border rounded-xl p-2" value={uStatus} onChange={(e) => setUStatus(e.target.value)}>
                <option value="draft">draft</option>
                <option value="published">published</option>
              </select>
              <div className="text-[11px] opacity-60 mt-1">
                Published universes show up on <code>/studios</code>.
              </div>
            </label>
          </div>

          <div className="mt-4 flex gap-3 flex-wrap">
            <button
              onClick={() => saveUniverse()}
              disabled={savingUniverse || !uTitle.trim()}
              className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
            >
              {savingUniverse ? "Saving…" : "Save"}
            </button>

            <button
              onClick={publishUniverse}
              disabled={savingUniverse || !uTitle.trim()}
              className="px-4 py-2 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 disabled:opacity-50"
              title="Sets status=published and saves"
            >
              Publish
            </button>

            <button
              onClick={unpublishUniverse}
              disabled={savingUniverse || !canEditUniverse}
              className="px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 disabled:opacity-50"
              title="Sets status=draft and saves"
            >
              Unpublish
            </button>

            <button
              onClick={deleteUniverse}
              disabled={savingUniverse || !canEditUniverse}
              className="px-4 py-2 rounded-xl border border-red-300 bg-red-50 text-red-900 disabled:opacity-50 ml-auto"
            >
              Delete Universe
            </button>
          </div>
        </div>
      </div>

      {/* ✅ WORLD MAP CONTROL CENTER */}
      {selectedUniverse?.id && (
        <div className="rounded-2xl border border-gray-200 p-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">World Map Control Center</div>
              <div className="text-sm opacity-70">
                Upload multiple world maps (gallery), set one as featured, and manage Region labels.
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploading || !storageBucket}
                onChange={(e) => uploadWorldMapGallery(e.target.files)}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gallery */}
            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="font-semibold">World Map Gallery ({worldMapAssets.length})</div>
              <div className="text-[12px] opacity-70 mt-1">
                Stored in <code>universe_assets</code> as <code>asset_type=world_map</code>.
              </div>

              {worldMapAssets.length === 0 ? (
                <div className="mt-3 text-sm opacity-70">No gallery maps yet. Upload above.</div>
              ) : (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {worldMapAssets.map((m) => {
                    const url = m.thumbnail_url || m.external_url || "";
                    const isFeatured = uWorldMap && url && uWorldMap === url;
                    return (
                      <div key={m.id} className={`rounded-2xl border p-3 ${selectedWorldMapAssetId === m.id ? "border-black" : "border-gray-200"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            className="text-left font-semibold truncate"
                            onClick={() => setSelectedWorldMapAssetId((prev) => (prev === m.id ? null : m.id))}
                            title="Select this map to manage regions"
                          >
                            {m.title || "World Map"}
                          </button>
                          {isFeatured ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800">
                              featured
                            </span>
                          ) : null}
                        </div>

                        {url ? (
                          <img src={url} alt="" className="mt-2 h-32 w-full object-cover rounded-xl border" />
                        ) : (
                          <div className="mt-2 h-32 w-full rounded-xl border bg-gray-50 flex items-center justify-center text-xs opacity-60">
                            no image url
                          </div>
                        )}

                        <div className="mt-2 flex gap-2 flex-wrap">
                          <button
                            className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm"
                            onClick={async () => {
                              try {
                                setNotice(null);
                                const next = m.external_url || m.thumbnail_url || "";
                                if (!next) throw new Error("This map has no URL to feature.");
                                setUWorldMap(next);
                                await persistUniverseField("world_map_url", next);
                                setNotice({ type: "ok", msg: "Featured world map updated." });
                              } catch (e) {
                                setNotice({ type: "error", msg: e?.message || "Failed to set featured map" });
                              }
                            }}
                          >
                            Set as Featured
                          </button>

                          <button
                            className="px-3 py-1.5 rounded-xl border border-red-300 bg-red-50 text-red-900 text-sm"
                            onClick={() => removeAsset(m.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Regions */}
            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">World Map Regions</div>
                  <div className="text-[12px] opacity-70 mt-1">
                    {selectedWorldMapAssetId ? (
                      <>
                        Filtering to selected map: <code>{selectedWorldMapAssetId.slice(0, 8)}…</code>
                      </>
                    ) : (
                      <>Showing all regions for the universe (select a map to filter).</>
                    )}
                  </div>
                </div>

                <button className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm" onClick={resetRegionForm}>
                  Clear Form
                </button>
              </div>

              {/* Add region */}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm md:col-span-2">
                  Region title
                  <input className="mt-1 w-full border rounded-xl p-2" value={rTitle} onChange={(e) => setRTitle(e.target.value)} placeholder="The Ember Coast" />
                </label>

                <label className="text-sm md:col-span-2">
                  Description
                  <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[60px]" value={rDesc} onChange={(e) => setRDesc(e.target.value)} placeholder="Climate, factions, lore..." />
                </label>

                <label className="text-sm">
                  Sort order
                  <input className="mt-1 w-full border rounded-xl p-2" value={String(rSort)} onChange={(e) => setRSort(e.target.value)} />
                </label>

                <label className="text-sm">
                  Metadata JSON (optional)
                  <input className="mt-1 w-full border rounded-xl p-2" value={rMeta} onChange={(e) => setRMeta(e.target.value)} placeholder='{"x":0.2,"y":0.7}' />
                </label>
              </div>

              <div className="mt-3 flex gap-2">
                <button className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50" onClick={addRegion} disabled={savingRegionId}>
                  {savingRegionId === "new" ? "Adding…" : "Add Region"}
                </button>
              </div>

              {/* List regions */}
              <div className="mt-4">
                {loadingRegions ? (
                  <div className="text-sm opacity-70">Loading regions…</div>
                ) : regions.length === 0 ? (
                  <div className="text-sm opacity-70">No regions yet.</div>
                ) : (
                  <div className="space-y-2">
                    {regions.map((r) => {
                      const isSaving = savingRegionId === r.id;
                      return (
                        <div key={r.id} className="rounded-2xl border border-gray-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold truncate">{r.title}</div>
                            <div className="flex gap-2">
                              <button
                                className="px-3 py-1 rounded-xl border text-sm disabled:opacity-50"
                                disabled={isSaving}
                                onClick={() =>
                                  updateRegion(r.id, {
                                    sort_order: clampInt(r.sort_order, 0) - 10,
                                  })
                                }
                              >
                                ↑
                              </button>
                              <button
                                className="px-3 py-1 rounded-xl border text-sm disabled:opacity-50"
                                disabled={isSaving}
                                onClick={() =>
                                  updateRegion(r.id, {
                                    sort_order: clampInt(r.sort_order, 0) + 10,
                                  })
                                }
                              >
                                ↓
                              </button>
                            </div>
                          </div>

                          {r.description ? <div className="text-sm opacity-80 mt-1">{r.description}</div> : null}
                          <div className="text-[11px] opacity-60 mt-1">sort: {r.sort_order}</div>

                          <div className="mt-2 flex gap-2 flex-wrap">
                            <button
                              className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm disabled:opacity-50"
                              disabled={isSaving}
                              onClick={() => {
                                setRTitle(r.title || "");
                                setRDesc(r.description || "");
                                setRSort(r.sort_order ?? 0);
                                setRMeta(JSON.stringify(r.metadata || {}));
                                setNotice({ type: "ok", msg: "Loaded region into form (edit fields, then use Update below)." });
                              }}
                            >
                              Load into form
                            </button>

                            <button
                              className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm disabled:opacity-50"
                              disabled={isSaving}
                              onClick={() =>
                                updateRegion(r.id, {
                                  title: rTitle.trim() || r.title,
                                  description: rDesc || null,
                                  sort_order: clampInt(rSort, r.sort_order || 0),
                                  metadata: safeJsonParse(rMeta, r.metadata || {}),
                                })
                              }
                            >
                              {isSaving ? "Updating…" : "Update from form"}
                            </button>

                            <button
                              className="px-3 py-1.5 rounded-xl border border-red-300 bg-red-50 text-red-900 text-sm disabled:opacity-50"
                              disabled={isSaving}
                              onClick={() => deleteRegion(r.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Studio Pages (unchanged structure) */}
      {selectedUniverse?.id && (
        <div className="rounded-2xl border border-gray-200 p-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="font-semibold">Studio Pages (Paste Content)</div>
              <div className="text-sm opacity-70">
                Published pages render on <code>/studios/[slug]</code>.
              </div>
            </div>

            <button className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50" onClick={resetPageEditor}>
              + New Page
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-gray-200 p-3">
              <div className="font-semibold mb-2">Pages</div>
              {loadingPages ? (
                <div className="opacity-70">Loading…</div>
              ) : studioPages.length === 0 ? (
                <div className="opacity-70 text-sm">No studio pages yet.</div>
              ) : (
                <div className="space-y-2">
                  {studioPages.map((pg) => (
                    <button
                      key={pg.id}
                      onClick={() => selectPage(pg)}
                      className={`w-full text-left p-3 rounded-xl border transition ${pId === pg.id ? "border-black" : "border-gray-200 hover:border-gray-300"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{pg.title}</div>
                        <span
                          className={`px-2 py-0.5 rounded-full border text-xs ${
                            pg.status === "published" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"
                          }`}
                        >
                          {pg.status}
                        </span>
                      </div>
                      <div className="text-xs opacity-70">{pg.page_type} • sort {pg.sort_order}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-2 rounded-2xl border border-gray-200 p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="text-sm md:col-span-2">
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
                </label>

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

                <label className="text-sm md:col-span-3">
                  Excerpt (optional)
                  <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[60px]" value={pExcerpt} onChange={(e) => setPExcerpt(e.target.value)} />
                </label>

                <label className="text-sm md:col-span-3">
                  Hero Image URL (optional)
                  <input className="mt-1 w-full border rounded-xl p-2" value={pHeroImg} onChange={(e) => setPHeroImg(e.target.value)} />
                </label>

                <label className="text-sm md:col-span-3">
                  Hero Video URL (optional)
                  <input className="mt-1 w-full border rounded-xl p-2" value={pHeroVid} onChange={(e) => setPHeroVid(e.target.value)} />
                </label>

                <label className="text-sm md:col-span-3">
                  Content (Markdown or plain text — paste)
                  <textarea className="mt-1 w-full border rounded-xl p-3 min-h-[260px] font-mono text-xs" value={pContent} onChange={(e) => setPContent(e.target.value)} />
                </label>
              </div>

              <div className="mt-4 flex gap-3">
                <button className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50" onClick={savePage} disabled={!pTitle.trim() || savingPageId}>
                  {savingPageId ? "Saving…" : "Save Page"}
                </button>

                {pId ? (
                  <button className="px-4 py-2 rounded-xl border border-red-300 bg-red-50 text-red-900 disabled:opacity-50" onClick={deletePage} disabled={savingPageId}>
                    Delete Page
                  </button>
                ) : null}
              </div>

              <div className="mt-3 text-[11px] opacity-60">Tip: set Status=published to show on the public Studio page.</div>
            </div>
          </div>
        </div>
      )}

      {/* Quick add custom item (manual link) */}
      <div className="rounded-2xl border border-gray-200 p-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Add Universe Item (Manual Link)</div>
            <div className="text-sm opacity-70">Perfect for Characters + Trailers + Decks. Thumbnail uploads now save reliably.</div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50" onClick={primeQuickAddForCharacter} disabled={!selectedUniverse?.id}>
              + Character Mode
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm">
            Division
            <select className="mt-1 w-full border rounded-xl p-2" value={qaDivision} onChange={(e) => setQaDivision(e.target.value)}>
              <option value="studios">studios</option>
              <option value="media">media</option>
              <option value="publishing">publishing</option>
              <option value="designs">designs</option>
              <option value="capital">capital</option>
              <option value="tech">tech</option>
              <option value="realty">realty</option>
            </select>
          </label>

          <label className="text-sm">
            Asset Type
            <select className="mt-1 w-full border rounded-xl p-2" value={qaType} onChange={(e) => setQaType(e.target.value)}>
              <option value="trailer">trailer</option>
              <option value="soundtrack">soundtrack</option>
              <option value="pitch_deck">pitch_deck</option>
              <option value="option_deck">option_deck</option>
              <option value="script">script</option>
              <option value="pdf">pdf</option>
              <option value="image">image</option>
              <option value="link">link</option>
              <option value="nft">nft</option>
              <option value="world_map">world_map</option>
              <option value="character">character</option>
              <option value="episode_art">episode_art</option>
              <option value="mp4">mp4</option>
            </select>
          </label>

          <label className="text-sm">
            Status
            <select className="mt-1 w-full border rounded-xl p-2" value={qaStatus} onChange={(e) => setQaStatus(e.target.value)}>
              <option value="published">published</option>
              <option value="draft">draft</option>
            </select>
          </label>

          <label className="text-sm md:col-span-2">
            Title
            <input className="mt-1 w-full border rounded-xl p-2" value={qaTitle} onChange={(e) => setQaTitle(e.target.value)} placeholder="Kael — Last Heir" />
          </label>

          <label className="text-sm">
            Public?
            <select className="mt-1 w-full border rounded-xl p-2" value={qaPublic ? "yes" : "no"} onChange={(e) => setQaPublic(e.target.value === "yes")}>
              <option value="yes">yes (free)</option>
              <option value="no">no (premium)</option>
            </select>
          </label>

          <label className="text-sm md:col-span-2">
            External URL (YouTube/Spotify/PDF/etc)
            <input className="mt-1 w-full border rounded-xl p-2" value={qaUrl} onChange={(e) => setQaUrl(e.target.value)} placeholder="https://..." />
          </label>

          <label className="text-sm">
            Thumbnail URL
            <input className="mt-1 w-full border rounded-xl p-2" value={qaThumb} onChange={(e) => setQaThumb(e.target.value)} placeholder="https://... OR upload below" />
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <input type="file" accept="image/*,video/mp4" disabled={uploading || !selectedUniverse?.id || !storageBucket} onChange={(e) => uploadQuickAddThumbFile(e.target.files?.[0])} />
              {qaThumb ? (
                isLikelyMp4Url(qaThumb) ? (
                  <video src={qaThumb} className="h-16 w-24 rounded-xl object-cover border" muted playsInline loop autoPlay />
                ) : (
                  <img src={qaThumb} alt="" className="h-16 w-16 rounded-xl object-cover border" />
                )
              ) : null}
            </div>
          </label>

          <label className="text-sm">
            Price (USD, premium only)
            <input className="mt-1 w-full border rounded-xl p-2" value={qaPrice} onChange={(e) => setQaPrice(e.target.value)} placeholder="49.00" disabled={qaPublic} />
          </label>

          <label className="text-sm md:col-span-3">
            Description
            <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[80px]" value={qaDesc} onChange={(e) => setQaDesc(e.target.value)} />
          </label>

          <label className="text-sm md:col-span-3">
            Metadata JSON (optional)
            <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[70px]" value={qaMetaStr} onChange={(e) => setQaMetaStr(e.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex gap-3">
          <button className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50" disabled={!selectedUniverse?.id} onClick={addCustomAsset}>
            Add Item
          </button>
          <button className="px-4 py-2 rounded-xl border border-gray-300" onClick={resetQuickAdd}>
            Reset
          </button>
        </div>
      </div>

      {/* Curate products into universe */}
      <div className="rounded-2xl border border-gray-200 p-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Attach Products (from products table)</div>
            <div className="text-sm opacity-70">Search products and add them as universe items.</div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <select className="border rounded-xl p-2" value={division} onChange={(e) => setDivision(e.target.value)}>
              <option value="publishing">publishing</option>
              <option value="designs">designs</option>
              <option value="capital">capital</option>
              <option value="realty">realty</option>
            </select>

            <input className="border rounded-xl p-2" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or slug…" />

            <button className="px-4 py-2 rounded-xl border border-gray-300" onClick={searchProducts} disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {!selectedUniverse?.id && (
          <div className="mt-4 text-sm rounded-xl border border-amber-200 bg-amber-50 p-3">
            Create or select a universe first. Then you can attach products to it.
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {productResults.map((p) => {
            const exists = assets.some((a) => a.source_type === "product" && a.source_product_id === p.id);
            return (
              <div key={p.id} className="rounded-2xl border border-gray-200 p-3">
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs opacity-70">{p.slug}</div>
                {p.image_url && <img src={p.image_url} alt="" className="mt-3 h-28 w-full object-cover rounded-xl" />}
                <button
                  className="mt-3 w-full px-3 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                  onClick={() => addProductToUniverse(p)}
                  disabled={!selectedUniverse?.id || exists}
                >
                  {exists ? "Already Added" : "Add to Universe"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current universe items (FULL CRUD) */}
      {selectedUniverse?.id && (
        <div className="rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="font-semibold">Universe Items ({assets.length})</div>
            <div className="text-sm opacity-70">Upload thumbnails per item. Upload now persists immediately.</div>
          </div>

          {assets.length === 0 ? (
            <div className="opacity-70 text-sm">Nothing attached yet.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {assets.map((a, idx) => {
                const isSaving = Boolean(savingAssetIds[a.id]);
                const isPublic = Boolean(getAssetVal(a, "is_public", a.is_public));
                const priceCents = clampInt(getAssetVal(a, "price_cents", a.price_cents || 0), a.price_cents || 0);
                const status = String(getAssetVal(a, "status", a.status || "published") || "published");

                const thumb = getAssetVal(a, "thumbnail_url", a.thumbnail_url || "");
                const title = getAssetVal(a, "title", a.title || "");
                const desc = getAssetVal(a, "description", a.description || "");
                const exUrl = getAssetVal(a, "external_url", a.external_url || "");
                const divisionVal = getAssetVal(a, "division", a.division || "");
                const typeVal = getAssetVal(a, "asset_type", a.asset_type || "");
                const sortOrderVal = getAssetVal(a, "sort_order", a.sort_order ?? idx * 10);

                const metaStr = getAssetMetaStr(a);
                const metaObj = safeJsonParse(metaStr, a.metadata || {});
                const thumbIsVideo = isLikelyMp4Url(thumb) || String(metaObj?.thumb_kind || "").toLowerCase() === "video";

                return (
                  <div key={a.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden border bg-gray-100 flex items-center justify-center text-[10px] opacity-70 shrink-0">
                        {thumb ? (
                          thumbIsVideo ? (
                            <video src={thumb} className="w-full h-full object-cover" muted playsInline loop autoPlay />
                          ) : (
                            <img src={thumb} alt="" className="w-full h-full object-cover" />
                          )
                        ) : (
                          "no thumb"
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] opacity-70 uppercase tracking-[0.22em]">
                          {String(a.division || "").toUpperCase()} • {String(a.asset_type || "").toUpperCase()}
                        </div>
                        <div className="font-semibold truncate">{a.title}</div>
                        {!isPublic && (
                          <div className="mt-1 text-xs rounded-full inline-flex px-2 py-0.5 border border-amber-200 bg-amber-50">
                            Premium • ${toMoney(priceCents)}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button className="px-3 py-1 rounded-xl border text-sm disabled:opacity-50" disabled={idx === 0 || isSaving} onClick={() => moveAsset(a.id, -1)}>
                          ↑
                        </button>
                        <button className="px-3 py-1 rounded-xl border text-sm disabled:opacity-50" disabled={idx === assets.length - 1 || isSaving} onClick={() => moveAsset(a.id, +1)}>
                          ↓
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="text-sm">
                        Title
                        <input className="mt-1 w-full border rounded-xl p-2" value={title} onChange={(e) => setAssetField(a.id, { title: e.target.value })} />
                      </label>

                      <label className="text-sm">
                        Sort Order
                        <input className="mt-1 w-full border rounded-xl p-2" value={String(sortOrderVal ?? "")} onChange={(e) => setAssetField(a.id, { sort_order: e.target.value })} />
                      </label>

                      <label className="text-sm">
                        Division
                        <input className="mt-1 w-full border rounded-xl p-2" value={divisionVal} onChange={(e) => setAssetField(a.id, { division: e.target.value })} />
                      </label>

                      <label className="text-sm">
                        Asset Type
                        <input className="mt-1 w-full border rounded-xl p-2" value={typeVal} onChange={(e) => setAssetField(a.id, { asset_type: e.target.value })} />
                      </label>

                      <label className="text-sm md:col-span-2">
                        Description
                        <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[70px]" value={desc} onChange={(e) => setAssetField(a.id, { description: e.target.value })} />
                      </label>

                      <label className="text-sm md:col-span-2">
                        External URL
                        <input className="mt-1 w-full border rounded-xl p-2" value={exUrl} onChange={(e) => setAssetField(a.id, { external_url: e.target.value })} />
                      </label>

                      <label className="text-sm md:col-span-2">
                        Thumbnail URL
                        <input className="mt-1 w-full border rounded-xl p-2" value={thumb} onChange={(e) => setAssetField(a.id, { thumbnail_url: e.target.value })} />
                        <div className="mt-2 flex items-center gap-3 flex-wrap">
                          <input
                            type="file"
                            accept="image/*,video/mp4"
                            disabled={uploading || isSaving || !storageBucket}
                            onChange={(e) => uploadAssetThumbFile(a, e.target.files?.[0])}
                          />
                          {thumb ? (
                            thumbIsVideo ? (
                              <video src={thumb} className="h-16 w-24 rounded-xl object-cover border" muted playsInline loop autoPlay />
                            ) : (
                              <img src={thumb} alt="" className="h-16 w-16 rounded-xl object-cover border" />
                            )
                          ) : null}
                        </div>
                      </label>

                      <label className="text-sm">
                        Status
                        <select className="mt-1 w-full border rounded-xl p-2" value={status} onChange={(e) => setAssetField(a.id, { status: e.target.value })}>
                          <option value="published">published</option>
                          <option value="draft">draft</option>
                        </select>
                      </label>

                      <label className="text-sm">
                        Public / Premium
                        <select
                          className="mt-1 w-full border rounded-xl p-2"
                          value={isPublic ? "public" : "premium"}
                          onChange={(e) => {
                            const nextPublic = e.target.value === "public";
                            setAssetField(a.id, { is_public: nextPublic, price_cents: nextPublic ? 0 : priceCents || 4900 });
                          }}
                        >
                          <option value="public">public (free)</option>
                          <option value="premium">premium (gated)</option>
                        </select>
                      </label>

                      <label className="text-sm md:col-span-2">
                        Price (cents, premium only)
                        <input
                          className="mt-1 w-full border rounded-xl p-2"
                          value={String(priceCents ?? 0)}
                          onChange={(e) => setAssetField(a.id, { price_cents: e.target.value })}
                          disabled={isPublic}
                        />
                        <div className="text-[11px] opacity-60 mt-1">Display: ${toMoney(priceCents)}</div>
                      </label>

                      <label className="text-sm md:col-span-2">
                        Metadata JSON
                        <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[70px]" value={metaStr} onChange={(e) => setAssetField(a.id, { metadataStr: e.target.value })} />
                      </label>
                    </div>

                    <div className="mt-4 flex gap-3 items-center">
                      {exUrl ? (
                        <a className="text-sm underline" href={exUrl} target="_blank" rel="noreferrer">
                          Open →
                        </a>
                      ) : (
                        <span className="text-sm opacity-60">No link</span>
                      )}

                      <button className="ml-auto px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50" disabled={isSaving} onClick={() => saveAsset(a)}>
                        {isSaving ? "Saving…" : "Save Item"}
                      </button>

                      <button className="px-4 py-2 rounded-xl border border-red-300 bg-red-50 text-red-900" onClick={() => removeAsset(a.id)} disabled={isSaving}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
