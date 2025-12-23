// components/admin/StudioPagesTab.js
import { useCallback, useEffect, useMemo, useState } from "react";
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
  "series_bible", // keep this one (overlaps legacy)
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

// ✅ Full select list used by editor dropdown
const PAGE_TYPES = Array.from(new Set([...LEGACY_PAGE_TYPES, ...REQUIRED_25_PAGE_TYPES]));

// ✅ default titles + recommended sort order for the 25
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

  // ✅ optional visibility (stored in metadata.visibility, no schema change)
  const [pVisibility, setPVisibility] = useState("public"); // public|vault
  const [pMetaStr, setPMetaStr] = useState(""); // raw JSON

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
  }, []);

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

  useEffect(() => {
    loadUniverses();
  }, [loadUniverses]);

  useEffect(() => {
    if (!selectedUniverseId) return;
    loadPages(selectedUniverseId);
    resetEditor();
  }, [selectedUniverseId, loadPages, resetEditor]);

  const selectPage = useCallback((pg) => {
    const md = pg.metadata && typeof pg.metadata === "object" ? pg.metadata : safeJsonParse(pg.metadata, {});
    setPId(pg.id);
    setPType(pg.page_type || "one_sheet");
    setPTitle(pg.title || "");
    setPStatus(pg.status || "draft");
    setPSort(pg.sort_order ?? 100);
    setPExcerpt(pg.excerpt || "");
    setPHeroImg(pg.hero_image_url || "");
    setPHeroVid(pg.hero_video_url || "");
    setPContent(pg.content_md || "");
    setPVisibility(String(md?.visibility || "public") === "vault" ? "vault" : "public");
    setPMetaStr(JSON.stringify(md || {}, null, 2));
  }, []);

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
        const visibility = t.includes("rights") || t.includes("term_sheet") || t.includes("producer_packet") ? "vault" : "public";
        return {
          universe_id: selectedUniverseId,
          page_type: t,
          title: preset.title,
          status: "draft",
          sort_order: preset.sort,
          excerpt: null,
          hero_image_url: null,
          hero_video_url: null,
          content_md: `# ${preset.title}\n\n(Write/paste here.)\n`,
          metadata: { visibility },
        };
      });

      // Insert in one batch
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

  // ✅ quality-of-life: auto-fill title/sort when choosing a page type for new pages
  useEffect(() => {
    if (pId) return; // don’t override existing page
    const preset = getPreset(pType);
    if (!pTitle) setPTitle(preset.title);
    if (!pSort || Number(pSort) === 100) setPSort(preset.sort);
    // default vault for deal docs
    if (!pMetaStr) {
      const isVaultType = pType.includes("rights") || pType.includes("term_sheet") || pType.includes("producer_packet");
      setPVisibility(isVaultType ? "vault" : "public");
      setPMetaStr(JSON.stringify({ visibility: isVaultType ? "vault" : "public" }, null, 2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pType]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Studio Pages</h2>
          <p className="text-sm opacity-70">
            Paste long-form pitch copy and attach it to a Universe. Published pages render on <code>/studios/[slug]</code>.
          </p>
        </div>
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

      {/* ✅ Package Completeness Meter */}
      <div className="rounded-2xl border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold">Hollywood Package (25)</div>
            <div className="text-sm opacity-70">
              Tracks whether your universe has the full studio package. This is only based on <code>page_type</code> presence.
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
            Missing:{" "}
            <span className="font-mono">
              {packageProgress.missing.join(", ")}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Universe picker */}
        <div className="rounded-2xl border border-gray-200 p-4">
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

              {selectedUniverse?.slug && (
                <a
                  className="mt-3 inline-flex w-full justify-center px-3 py-2 rounded-xl border border-gray-300 text-sm"
                  href={`/studios/${selectedUniverse.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View Studio Page →
                </a>
              )}
            </>
          )}
        </div>

        {/* Pages list */}
        <div className="rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="font-semibold">Pages</div>
            <button
              className="px-3 py-1.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50"
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
                return (
                  <button
                    key={pg.id}
                    onClick={() => selectPage(pg)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      pId === pg.id ? "border-black" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{pg.title}</div>
                      <div className="flex items-center gap-2">
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
                      </div>
                    </div>
                    <div className="text-xs opacity-70">{pg.page_type} • sort {pg.sort_order}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor */}
        <div className="rounded-2xl border border-gray-200 p-4 lg:col-span-1">
          <div className="font-semibold mb-3">{pId ? "Edit Studio Page" : "Create Studio Page"}</div>

          <div className="grid grid-cols-1 gap-3">
            <label className="text-sm">
              Title
              <input className="mt-1 w-full border rounded-xl p-2" value={pTitle} onChange={(e) => setPTitle(e.target.value)} />
            </label>

            <label className="text-sm">
              Type
              <select className="mt-1 w-full border rounded-xl p-2" value={pType} onChange={(e) => setPType(e.target.value)}>
                {PAGE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="text-[11px] opacity-60 mt-1">
                Tip: Use the 25 page types for Hollywood packaging. Legacy types still supported.
              </div>
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
              Excerpt (optional)
              <textarea className="mt-1 w-full border rounded-xl p-2 min-h-[70px]" value={pExcerpt} onChange={(e) => setPExcerpt(e.target.value)} />
            </label>

            <label className="text-sm">
              Hero Image URL (optional)
              <input className="mt-1 w-full border rounded-xl p-2" value={pHeroImg} onChange={(e) => setPHeroImg(e.target.value)} />
            </label>

            <label className="text-sm">
              Hero Video URL (optional)
              <input className="mt-1 w-full border rounded-xl p-2" value={pHeroVid} onChange={(e) => setPHeroVid(e.target.value)} />
            </label>

            <label className="text-sm">
              Metadata JSON (optional)
              <textarea
                className="mt-1 w-full border rounded-xl p-2 min-h-[80px] font-mono text-xs"
                value={pMetaStr}
                onChange={(e) => setPMetaStr(e.target.value)}
                placeholder={`{\n  "visibility": "public"\n}`}
              />
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
