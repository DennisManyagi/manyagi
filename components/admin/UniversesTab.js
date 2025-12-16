import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

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

export default function UniversesTab() {
  const [universes, setUniverses] = useState([]);
  const [selectedUniverse, setSelectedUniverse] = useState(null);
  const [assets, setAssets] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingUniverse, setSavingUniverse] = useState(false);

  // Universe form
  const [uTitle, setUTitle] = useState("");
  const [uSlug, setUSlug] = useState("");
  const [uTagline, setUTagline] = useState("");
  const [uLogline, setULogline] = useState("");
  const [uSynopsis, setUSynopsis] = useState("");
  const [uCover, setUCover] = useState("");
  const [uHeroVideo, setUHeroVideo] = useState("");
  const [uWorldMap, setUWorldMap] = useState("");
  const [uStatus, setUStatus] = useState("draft"); // draft | published

  // Product search
  const [division, setDivision] = useState("publishing");
  const [query, setQuery] = useState("");
  const [productResults, setProductResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const lastSearchKey = useRef("");

  // Universe asset CRUD (edits per asset row)
  const [assetEdits, setAssetEdits] = useState({}); // { [assetId]: { ...fields } }
  const [savingAssetIds, setSavingAssetIds] = useState({}); // { [assetId]: true }
  const [notice, setNotice] = useState(null); // { type: "error"|"ok", msg: string }

  // Quick-add custom universe item (manual link)
  const [qaDivision, setQaDivision] = useState("studios");
  const [qaType, setQaType] = useState("trailer");
  const [qaTitle, setQaTitle] = useState("");
  const [qaDesc, setQaDesc] = useState("");
  const [qaUrl, setQaUrl] = useState("");
  const [qaThumb, setQaThumb] = useState("");
  const [qaPublic, setQaPublic] = useState(true);
  const [qaPrice, setQaPrice] = useState(""); // dollars
  const [qaStatus, setQaStatus] = useState("published"); // draft|published
  const [qaMetaStr, setQaMetaStr] = useState("");

  const canEditUniverse = Boolean(selectedUniverse?.id);

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

  const loadUniverses = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    const { data, error } = await supabase
      .from("universes")
      .select("*")
      .order("updated_at", { ascending: false });

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

    // clear per-asset edits when loading a new universe
    setAssetEdits({});
    setSavingAssetIds({});
  }, []);

  useEffect(() => {
    loadUniverses();
  }, [loadUniverses]);

  useEffect(() => {
    if (!selectedUniverse?.id) return;
    loadUniverseAssets(selectedUniverse.id);
  }, [selectedUniverse?.id, loadUniverseAssets]);

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

  const saveUniverse = useCallback(
    async (nextStatus /* optional */) => {
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
          // keep your convention
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
    [
      uTitle,
      uSlug,
      uTagline,
      uLogline,
      uSynopsis,
      uCover,
      uHeroVideo,
      uWorldMap,
      uStatus,
      selectedUniverse?.id,
      loadUniverses,
    ]
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

      // delete assets first (safe, avoids FK issues)
      const { error: aErr } = await supabase.from("universe_assets").delete().eq("universe_id", selectedUniverse.id);
      if (aErr) throw aErr;

      const { error: uErr } = await supabase.from("universes").delete().eq("id", selectedUniverse.id);
      if (uErr) throw uErr;

      setSelectedUniverse(null);
      resetUniverseForm();
      setAssets([]);
      setProductResults([]);
      setAssetEdits({});
      setNotice({ type: "ok", msg: "Universe deleted." });
      await loadUniverses();
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", msg: e?.message || "Failed to delete universe" });
    } finally {
      setSavingUniverse(false);
    }
  }, [selectedUniverse?.id, resetUniverseForm, loadUniverses]);

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

      if (qtxt) {
        q = q.or(`name.ilike.%${qtxt}%,slug.ilike.%${qtxt}%`);
      }

      const { data, error } = await q;
      if (lastSearchKey.current !== searchKey) return; // ignore stale responses
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

  // Auto-search latest when division changes OR universe selected, but only when query empty
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

      const assetType =
        product.division === "publishing"
          ? "book"
          : product.division === "designs"
          ? "merch"
          : "product";

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
        metadata: safeJsonParse(qaMetaStr, {}),
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
  }, [
    selectedUniverse?.id,
    qaDivision,
    qaType,
    qaTitle,
    qaDesc,
    qaUrl,
    qaThumb,
    qaPublic,
    qaPrice,
    qaStatus,
    qaMetaStr,
    assets,
    resetQuickAdd,
    loadUniverseAssets,
  ]);

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

  const setAssetField = useCallback((assetId, patch) => {
    setAssetEdits((prev) => ({
      ...prev,
      [assetId]: { ...(prev[assetId] || {}), ...patch },
    }));
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

        // premium pricing: only applies if is_public === false
        if (row.price_cents !== undefined) payload.price_cents = clampInt(row.price_cents, 0);

        // metadata JSON editor
        if (row.metadataStr !== undefined) {
          payload.metadata = safeJsonParse(row.metadataStr, asset.metadata || {});
        }

        const { error } = await supabase.from("universe_assets").update(payload).eq("id", asset.id);
        if (error) throw error;

        // clear edits for this asset
        setAssetEdits((prev) => ({ ...prev, [asset.id]: {} }));
        setNotice({ type: "ok", msg: "Universe item saved." });

        if (selectedUniverse?.id) {
          await loadUniverseAssets(selectedUniverse.id);
        }
      } catch (e) {
        console.error(e);
        setNotice({ type: "error", msg: e?.message || "Failed to save item" });
      } finally {
        setSavingAssetIds((prev) => ({ ...prev, [asset.id]: false }));
      }
    },
    [assetEdits, selectedUniverse?.id, loadUniverseAssets]
  );

  const moveAsset = useCallback(
    async (assetId, direction /* -1 up, +1 down */) => {
      const idx = assets.findIndex((a) => a.id === assetId);
      if (idx === -1) return;

      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= assets.length) return;

      const a1 = assets[idx];
      const a2 = assets[targetIdx];

      // swap sort_order
      const so1 = clampInt(a1.sort_order, 0);
      const so2 = clampInt(a2.sort_order, 0);

      try {
        setNotice(null);
        setSavingAssetIds((prev) => ({ ...prev, [a1.id]: true, [a2.id]: true }));

        const { error: e1 } = await supabase.from("universe_assets").update({ sort_order: so2 }).eq("id", a1.id);
        if (e1) throw e1;
        const { error: e2 } = await supabase.from("universe_assets").update({ sort_order: so1 }).eq("id", a2.id);
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

  const producerPacketAssets = useMemo(
    () => assets.filter((a) => String(a.division || "").toLowerCase() === "studios" && a.is_public === false),
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

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Universes (Studios)</h2>
          <p className="text-sm opacity-70">
            Create a universe, publish it, then curate items (trailers, soundtracks, decks, products) into the Studio page.
          </p>
        </div>

        <button
          className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50"
          onClick={() => {
            setSelectedUniverse(null);
            resetUniverseForm();
            setAssets([]);
            setProductResults([]);
            setAssetEdits({});
            resetQuickAdd();
            setNotice(null);
          }}
        >
          + New Universe
        </button>
      </div>

      {notice?.msg && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            notice.type === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
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
              <input
                className="mt-1 w-full border rounded-xl p-2"
                value={uSlug}
                onChange={(e) => setUSlug(slugify(e.target.value))}
                placeholder="legacy-of-the-hidden-clans"
              />
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

            <label className="text-sm">
              Cover Image URL
              <input className="mt-1 w-full border rounded-xl p-2" value={uCover} onChange={(e) => setUCover(e.target.value)} />
            </label>

            <label className="text-sm">
              Hero Video URL
              <input className="mt-1 w-full border rounded-xl p-2" value={uHeroVideo} onChange={(e) => setUHeroVideo(e.target.value)} />
            </label>

            <label className="text-sm">
              World Map URL
              <input className="mt-1 w-full border rounded-xl p-2" value={uWorldMap} onChange={(e) => setUWorldMap(e.target.value)} />
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

            {producerPacketAssets.length > 0 && (
              <div className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-sm">
                Producer Pack items: {producerPacketAssets.length} (premium/gated)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick add custom item (manual link + premium control) */}
      <div className="rounded-2xl border border-gray-200 p-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Add Universe Item (Manual Link)</div>
            <div className="text-sm opacity-70">
              Use this for trailers, soundtracks, pitch decks, option decks, PDFs, external links, etc.
            </div>
          </div>
          {!selectedUniverse?.id && (
            <div className="text-sm rounded-xl border border-amber-200 bg-amber-50 p-3">
              Select or create a universe first.
            </div>
          )}
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
            <input className="mt-1 w-full border rounded-xl p-2" value={qaTitle} onChange={(e) => setQaTitle(e.target.value)} placeholder="Official Trailer (Teaser)" />
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
            <input className="mt-1 w-full border rounded-xl p-2" value={qaThumb} onChange={(e) => setQaThumb(e.target.value)} placeholder="https://.../cover.webp" />
          </label>

          <label className="text-sm">
            Price (USD, premium only)
            <input
              className="mt-1 w-full border rounded-xl p-2"
              value={qaPrice}
              onChange={(e) => setQaPrice(e.target.value)}
              placeholder="49.00"
              disabled={qaPublic}
            />
          </label>

          <label className="text-sm md:col-span-3">
            Description
            <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[80px]" value={qaDesc} onChange={(e) => setQaDesc(e.target.value)} />
          </label>

          <label className="text-sm md:col-span-3">
            Metadata JSON (optional)
            <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[70px]" value={qaMetaStr} onChange={(e) => setQaMetaStr(e.target.value)} placeholder='{"media_type":"trailer","platform":"YouTube"}' />
          </label>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            className="px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
            disabled={!selectedUniverse?.id}
            onClick={addCustomAsset}
          >
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

                <div className="text-xs mt-2 flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full border">{p.division}</span>
                  {typeof p.price === "number" && <span className="opacity-70">${p.price}</span>}
                </div>

                {p.image_url && <img src={p.image_url} alt="" className="mt-3 h-28 w-full object-cover rounded-xl" />}

                <button
                  className="mt-3 w-full px-3 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                  onClick={() => addProductToUniverse(p)}
                  disabled={!selectedUniverse?.id || exists}
                  title={exists ? "Already added" : "Add to universe"}
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
            <div className="text-sm opacity-70">
              Tip: Use Up/Down to reorder. Toggle Public/Premium + set Price for gated items.
            </div>
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

                return (
                  <div key={a.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden border bg-gray-100 flex items-center justify-center text-[10px] opacity-70 shrink-0">
                        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : "no thumb"}
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
                        <button
                          className="px-3 py-1 rounded-xl border text-sm disabled:opacity-50"
                          disabled={idx === 0 || isSaving}
                          onClick={() => moveAsset(a.id, -1)}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          className="px-3 py-1 rounded-xl border text-sm disabled:opacity-50"
                          disabled={idx === assets.length - 1 || isSaving}
                          onClick={() => moveAsset(a.id, +1)}
                          title="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="text-sm">
                        Title
                        <input
                          className="mt-1 w-full border rounded-xl p-2"
                          value={title}
                          onChange={(e) => setAssetField(a.id, { title: e.target.value })}
                        />
                      </label>

                      <label className="text-sm">
                        Sort Order
                        <input
                          className="mt-1 w-full border rounded-xl p-2"
                          value={String(sortOrderVal ?? "")}
                          onChange={(e) => setAssetField(a.id, { sort_order: e.target.value })}
                        />
                      </label>

                      <label className="text-sm">
                        Division
                        <input
                          className="mt-1 w-full border rounded-xl p-2"
                          value={divisionVal}
                          onChange={(e) => setAssetField(a.id, { division: e.target.value })}
                          placeholder="studios / media / publishing..."
                        />
                      </label>

                      <label className="text-sm">
                        Asset Type
                        <input
                          className="mt-1 w-full border rounded-xl p-2"
                          value={typeVal}
                          onChange={(e) => setAssetField(a.id, { asset_type: e.target.value })}
                          placeholder="trailer / pitch_deck / soundtrack..."
                        />
                      </label>

                      <label className="text-sm md:col-span-2">
                        Description
                        <textarea
                          className="mt-1 w-full border rounded-xl p-2 min-h-[70px]"
                          value={desc}
                          onChange={(e) => setAssetField(a.id, { description: e.target.value })}
                        />
                      </label>

                      <label className="text-sm md:col-span-2">
                        External URL
                        <input
                          className="mt-1 w-full border rounded-xl p-2"
                          value={exUrl}
                          onChange={(e) => setAssetField(a.id, { external_url: e.target.value })}
                          placeholder="https://..."
                        />
                      </label>

                      <label className="text-sm md:col-span-2">
                        Thumbnail URL
                        <input
                          className="mt-1 w-full border rounded-xl p-2"
                          value={thumb}
                          onChange={(e) => setAssetField(a.id, { thumbnail_url: e.target.value })}
                          placeholder="https://.../image.webp"
                        />
                      </label>

                      <label className="text-sm">
                        Status
                        <select
                          className="mt-1 w-full border rounded-xl p-2"
                          value={status}
                          onChange={(e) => setAssetField(a.id, { status: e.target.value })}
                        >
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
                            setAssetField(a.id, {
                              is_public: nextPublic,
                              price_cents: nextPublic ? 0 : priceCents || 4900,
                            });
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
                        <div className="text-[11px] opacity-60 mt-1">
                          Display: ${toMoney(priceCents)}
                        </div>
                      </label>

                      <label className="text-sm md:col-span-2">
                        Metadata JSON
                        <textarea
                          className="mt-1 w-full border rounded-xl p-2 min-h-[70px]"
                          value={getAssetMetaStr(a)}
                          onChange={(e) => setAssetField(a.id, { metadataStr: e.target.value })}
                        />
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

                      <button
                        className="ml-auto px-4 py-2 rounded-xl bg-black text-white disabled:opacity-50"
                        disabled={isSaving}
                        onClick={() => saveAsset(a)}
                      >
                        {isSaving ? "Saving…" : "Save Item"}
                      </button>

                      <button
                        className="px-4 py-2 rounded-xl border border-red-300 bg-red-50 text-red-900"
                        onClick={() => removeAsset(a.id)}
                        disabled={isSaving}
                      >
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
