// components/admin/StudioPagesTab.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

function clampInt(v, fallback = 0) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

const PAGE_TYPES = [
  "one_sheet",
  "series_bible",
  "press_kit",
  "negotiation",
  "roadmap",
  "prompts",
  "deck_copy",
];

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
      // default select first universe if none selected
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
    };

    try {
      if (pId) {
        const { error } = await supabase.from("studio_pages").update(payload).eq("id", pId);
        if (error) throw error;
        setNotice({ type: "ok", msg: "Studio page saved." });
      } else {
        const { data, error } = await supabase
          .from("studio_pages")
          .insert([payload])
          .select("*")
          .single();
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

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Studio Pages</h2>
          <p className="text-sm opacity-70">
            Paste long-form pitch copy (one-sheet, bible, negotiation scripts) and attach it to a Universe. Published pages render on <code>/studios/[slug]</code>.
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
              {pages.map((pg) => (
                <button
                  key={pg.id}
                  onClick={() => selectPage(pg)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    pId === pg.id ? "border-black" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{pg.title}</div>
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
                  <div className="text-xs opacity-70">{pg.page_type} • sort {pg.sort_order}</div>
                </button>
              ))}
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
              Content (Markdown or plain text — paste)
              <textarea
                className="mt-1 w-full border rounded-xl p-3 min-h-[240px] font-mono text-xs"
                value={pContent}
                onChange={(e) => setPContent(e.target.value)}
                placeholder={`# One-Sheet\n\n## Logline\n...\n\n## Synopsis\n...\n`}
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
