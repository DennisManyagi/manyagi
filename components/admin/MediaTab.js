import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import MediaShowcaseForm from "@/components/admin/MediaShowcaseForm";
import SectionCard from "@/components/admin/SectionCard";
import { safeJSON } from "@/lib/adminUtils";

const MEDIA_TYPES = ["playlist", "trailer", "podcast", "reel", "audiobook", "interview", "event", "musicvideo"];
const PLATFORMS = ["YouTube", "Spotify", "SoundCloud", "Vimeo", "TikTok", "Instagram", "Apple Podcasts", "Other"];

export default function MediaTab({ posts: allPosts, refreshAll }) {
  const mediaPosts = useMemo(() => {
    return (allPosts || [])
      .filter((p) => p.division === "media")
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [allPosts]);

  const [edits, setEdits] = useState({});
  const [mediaAssets, setMediaAssets] = useState([]);
  const [notice, setNotice] = useState(null);

  function val(post, key, fallback = "") {
    return edits[post.id]?.[key] ?? post[key] ?? fallback;
  }

  function metaVal(post) {
    const row = edits[post.id] || {};
    if (row.metadataStr !== undefined) return row.metadataStr;
    return JSON.stringify(post.metadata || {}, null, 0);
  }

  function extractMetaFields(m = {}) {
    return {
      media_type: m.media_type || "",
      media_url: m.media_url || "",
      platform: m.platform || "",
      duration: m.duration || "",
      book: m.book || "",
    };
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("division", "media")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) console.error(error);
      setMediaAssets(data || []);
    })();
  }, []);

  async function save(post) {
    try {
      setNotice(null);
      const row = edits[post.id] || {};
      if (!Object.keys(row).length) return;

      const baseMeta = post.metadata || {};
      let mergedMeta = baseMeta;

      if (row.metadataStr !== undefined) {
        mergedMeta = safeJSON(row.metadataStr, baseMeta);
      }

      const quick = row.metaQuick || {};
      if (Object.keys(quick).length) mergedMeta = { ...mergedMeta, ...quick };

      const payload = {
        ...(row.title !== undefined ? { title: row.title } : {}),
        ...(row.slug !== undefined ? { slug: row.slug } : {}),
        ...(row.excerpt !== undefined ? { excerpt: row.excerpt } : {}),
        ...(row.content !== undefined ? { content: row.content } : {}),
        ...(row.thumbnail_url !== undefined ? { thumbnail_url: row.thumbnail_url } : {}),
        ...(row.featured_image !== undefined ? { featured_image: row.featured_image } : {}),
        ...(row.metadataStr !== undefined || Object.keys(quick).length ? { metadata: mergedMeta } : {}),
      };

      const { error } = await supabase.from("posts").update(payload).eq("id", post.id);
      if (error) throw error;

      setEdits((prev) => ({ ...prev, [post.id]: {} }));
      refreshAll?.();
      setNotice({ type: "ok", msg: "Saved." });
    } catch (e) {
      setNotice({ type: "error", msg: `Save failed: ${e.message}` });
    }
  }

  async function remove(postId) {
    if (!confirm("Delete this post?")) return;
    try {
      setNotice(null);
      const { error } = await supabase.from("posts").delete().eq("id", postId);
      if (error) throw error;
      refreshAll?.();
      setNotice({ type: "ok", msg: "Deleted." });
    } catch (e) {
      setNotice({ type: "error", msg: `Delete failed: ${e.message}` });
    }
  }

  return (
    <SectionCard title="Media Division">
      <MediaShowcaseForm onCreated={refreshAll} />

      {notice?.msg && (
        <div
          className={`mt-4 rounded-xl border p-3 text-sm ${
            notice.type === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {notice.msg}
        </div>
      )}

      {/* RECENT UPLOADS */}
      <div className="mt-8">
        <h3 className="font-semibold mb-2">Recent Media Uploads</h3>
        <p className="text-xs opacity-70 mb-3">
          Latest assets uploaded under <code>division=&quot;media&quot;</code>. Click <b>Copy URL</b> to paste into thumbnail or metadata.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-2">Preview</th>
                <th>Filename</th>
                <th>Purpose</th>
                <th>Tags</th>
                <th>URL</th>
                <th>Copy</th>
              </tr>
            </thead>
            <tbody>
              {mediaAssets.length ? (
                mediaAssets.map((a) => (
                  <tr key={a.id} className="border-b dark:border-gray-800 align-top">
                    <td className="py-2">
                      {a.file_type === "image" ? (
                        <img src={a.file_url} className="w-14 h-14 object-cover rounded" alt="" />
                      ) : (
                        <div className="w-14 h-14 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs">
                          {a.file_type || "file"}
                        </div>
                      )}
                    </td>
                    <td className="py-2">{a.filename || "—"}</td>
                    <td className="py-2">{a.purpose || "—"}</td>
                    <td className="py-2">{Array.isArray(a.tags) && a.tags.length ? a.tags.join(", ") : "—"}</td>
                    <td className="py-2 max-w-[360px] truncate">{a.file_url}</td>
                    <td className="py-2">
                      <button
                        className="text-blue-600 underline"
                        onClick={() => navigator.clipboard?.writeText?.(a.file_url)}
                      >
                        Copy URL
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-6 opacity-70" colSpan={6}>
                    No recent media uploads found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT LIST */}
      <div className="mt-10">
        <h3 className="font-semibold mb-3">Showcase Items (Media)</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-2">Thumb</th>
                <th>Title / Slug</th>
                <th>Excerpt</th>
                <th>Content</th>
                <th>Quick Metadata</th>
                <th>Metadata JSON</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {mediaPosts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 opacity-70 text-center">
                    No showcase items yet.
                  </td>
                </tr>
              ) : (
                mediaPosts.map((p) => {
                  const row = edits[p.id] || {};
                  const thumbPreview =
                    row.thumbnail_url ?? row.featured_image ?? p.thumbnail_url ?? p.featured_image ?? "";

                  const quickDefaults = extractMetaFields(p.metadata || {});
                  const quick = { ...quickDefaults, ...(row.metaQuick || {}) };

                  return (
                    <tr key={p.id} className="border-b dark:border-gray-800 align-top">
                      <td className="py-2 min-w-[170px]">
                        <div className="w-16 h-16 rounded overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-500 mb-2">
                          {thumbPreview ? (
                            <img src={thumbPreview} className="w-full h-full object-cover" alt="" />
                          ) : (
                            "no img"
                          )}
                        </div>

                        <label className="block text-[10px] opacity-60">thumbnail_url</label>
                        <input
                          className="w-full dark:bg-gray-800 text-[11px] mb-2"
                          value={row.thumbnail_url ?? p.thumbnail_url ?? ""}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [p.id]: { ...row, thumbnail_url: e.target.value },
                            }))
                          }
                        />

                        <label className="block text-[10px] opacity-60">featured_image (legacy)</label>
                        <input
                          className="w-full dark:bg-gray-800 text-[11px]"
                          value={row.featured_image ?? p.featured_image ?? ""}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [p.id]: { ...row, featured_image: e.target.value },
                            }))
                          }
                        />
                      </td>

                      <td className="py-2 min-w-[220px]">
                        <label className="block text-[10px] opacity-60">Title</label>
                        <input
                          className="w-full dark:bg-gray-800 font-semibold"
                          value={val(p, "title")}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [p.id]: { ...row, title: e.target.value } }))
                          }
                        />

                        <label className="block text-[10px] opacity-60 mt-2">Slug</label>
                        <input
                          className="w-full dark:bg-gray-800 text-xs"
                          value={val(p, "slug")}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [p.id]: { ...row, slug: e.target.value } }))
                          }
                        />
                        <div className="text-[10px] opacity-60">/media/{val(p, "slug", p.slug)}</div>
                      </td>

                      <td className="py-2 min-w-[240px]">
                        <label className="block text-[10px] opacity-60">Excerpt</label>
                        <textarea
                          className="w-full h-24 dark:bg-gray-800 text-[12px]"
                          value={val(p, "excerpt")}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [p.id]: { ...row, excerpt: e.target.value } }))
                          }
                        />
                      </td>

                      <td className="py-2 min-w-[260px]">
                        <label className="block text-[10px] opacity-60">Content</label>
                        <textarea
                          className="w-full h-24 dark:bg-gray-800 text-[11px]"
                          value={val(p, "content")}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [p.id]: { ...row, content: e.target.value } }))
                          }
                        />
                      </td>

                      <td className="py-2 min-w-[340px]">
                        <label className="block text-[10px] opacity-60">Quick Metadata</label>

                        <div className="grid grid-cols-1 gap-2">
                          <select
                            className="w-full dark:bg-gray-800 text-[11px]"
                            value={quick.media_type}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [p.id]: { ...row, metaQuick: { ...quick, media_type: e.target.value } },
                              }))
                            }
                          >
                            <option value="">Media Type</option>
                            {MEDIA_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>

                          <input
                            className="w-full dark:bg-gray-800 text-[11px]"
                            placeholder="media_url (YouTube/Spotify/etc.)"
                            value={quick.media_url}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [p.id]: { ...row, metaQuick: { ...quick, media_url: e.target.value } },
                              }))
                            }
                          />

                          <select
                            className="w-full dark:bg-gray-800 text-[11px]"
                            value={quick.platform}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [p.id]: { ...row, metaQuick: { ...quick, platform: e.target.value } },
                              }))
                            }
                          >
                            <option value="">Platform</option>
                            {PLATFORMS.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>

                          <input
                            className="w-full dark:bg-gray-800 text-[11px]"
                            placeholder="duration (e.g. 3:45)"
                            value={quick.duration}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [p.id]: { ...row, metaQuick: { ...quick, duration: e.target.value } },
                              }))
                            }
                          />

                          <input
                            className="w-full dark:bg-gray-800 text-[11px]"
                            placeholder="book / series"
                            value={quick.book}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [p.id]: { ...row, metaQuick: { ...quick, book: e.target.value } },
                              }))
                            }
                          />
                        </div>
                      </td>

                      <td className="py-2 min-w-[280px]">
                        <label className="block text-[10px] opacity-60">Metadata JSON</label>
                        <textarea
                          className="w-full h-24 dark:bg-gray-800 text-[10px]"
                          value={metaVal(p)}
                          onChange={(e) =>
                            setEdits((prev) => ({ ...prev, [p.id]: { ...row, metadataStr: e.target.value } }))
                          }
                        />
                      </td>

                      <td className="py-2 min-w-[120px] space-y-2">
                        <button className="px-3 py-1 bg-blue-600 text-white rounded w-full text-xs" onClick={() => save(p)}>
                          Save
                        </button>
                        <button className="px-3 py-1 bg-red-600 text-white rounded w-full text-xs" onClick={() => remove(p.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] opacity-60 mt-4 leading-relaxed">
          Tip: After you create/update a media item, you can view it live at <code>/media</code> and <code>/media/[slug]</code>.
        </p>
      </div>
    </SectionCard>
  );
}
