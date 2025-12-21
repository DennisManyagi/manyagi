// components/admin/MediaTab.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import SectionCard from "@/components/admin/SectionCard";
import { safeJSON } from "@/lib/adminUtils";

/**
 * MANYAGI MEDIA TAB (Audio-first, works with /media posts)
 * ✅ Upload MP3/WAV to Supabase Storage bucket: "assets"
 * ✅ Optional thumbnail upload (image) tied to the track
 * ✅ Auto-creates:
 *    1) assets row (division=media, file_type=audio) for Recent Audio Uploads
 *    2) posts row (division=media, status=published) so it appears on /media
 *
 * FIXES INCLUDED:
 * - Stops "PGRST204 Could not find column ..." spam by not selecting missing columns to detect schema.
 * - Detects posts columns safely via select('*') and checking returned keys.
 * - Writes thumbnail ALWAYS to metadata.thumbnail_url, and only to post columns if they truly exist.
 * - Adds CRUD for Recent Audio Uploads (assets table): edit tags/thumb, delete duplicates, optional delete from Storage.
 */

const BUCKET = "assets";
const AUDIO_PREFIX = "media/audio";
const THUMB_PREFIX = "media/thumbs";

const AUDIO_EXTS = ["mp3", "wav"];
const IMG_EXTS = ["jpg", "jpeg", "png", "webp"];

const MEDIA_TYPES = [
  "soundtrack",
  "score",
  "opening_theme",
  "ending_theme",
  "character_theme",
  "battle_theme",
  "chapter_read",
  "scene",
  "podcast",
  "interview",
  "event",
  "playlist",
  "trailer",
  "musicvideo",
];

const PLATFORMS = ["Suno", "YouTube", "Spotify", "SoundCloud", "Apple Music", "Other"];

function slugify(str = "") {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function extOf(name = "") {
  const parts = String(name).split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function isAudioFile(fileOrUrl) {
  if (!fileOrUrl) return false;
  const s = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl.name;
  return AUDIO_EXTS.includes(extOf(s));
}

function isImageFile(fileOrUrl) {
  if (!fileOrUrl) return false;
  const s = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl.name;
  return IMG_EXTS.includes(extOf(s));
}

function MiniChip({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60">
      {children}
    </span>
  );
}

function CopyBtn({ text, label = "Copy" }) {
  return (
    <button
      className="text-blue-600 underline text-xs"
      onClick={() => navigator.clipboard?.writeText?.(text || "")}
      type="button"
    >
      {label}
    </button>
  );
}

function toTagsArray(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (!tags) return [];
  return String(tags)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function buildMeta({
  media_type,
  platform,
  audio_url,
  media_url,
  duration,
  mood,
  scene,
  book,
  universe,
  tags,
  download_url,
  license_url,
  thumbnail_url,
} = {}) {
  const tagsArr = toTagsArray(tags);
  const cleanedAudio = isAudioFile(audio_url || "") ? (audio_url || "").trim() : "";

  return {
    media_type: media_type || "soundtrack",
    platform: platform || "Suno",
    audio_url: cleanedAudio,
    media_url: (media_url || "").trim(),
    duration: duration || "",
    mood: mood || "",
    scene: scene || "",
    book: book || "",
    universe: universe || book || "",
    download_url: (download_url || "").trim(),
    license_url: (license_url || "").trim(),
    thumbnail_url: (thumbnail_url || "").trim(), // ALWAYS safe in metadata
    tags: tagsArr,
  };
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

async function getAudioDurationSeconds(url) {
  return new Promise((resolve) => {
    try {
      const a = new Audio();
      a.preload = "metadata";
      a.src = url;
      const done = (v) => {
        a.onloadedmetadata = null;
        a.onerror = null;
        resolve(v);
      };
      a.onloadedmetadata = () => {
        const d = Number(a.duration);
        if (!Number.isFinite(d) || d <= 0) return done(null);
        done(d);
      };
      a.onerror = () => done(null);
    } catch {
      resolve(null);
    }
  });
}

function extractThumbFromPost(post, rowOverride = {}) {
  const m = post?.metadata || {};
  const row = rowOverride || {};
  return (
    (row.thumbnail_url ?? "").trim() ||
    (row.featured_image ?? "").trim() ||
    (post.thumbnail_url ?? "").trim() ||
    (post.featured_image ?? "").trim() ||
    (m.thumbnail_url ?? "").trim() ||
    ""
  );
}

function extractStoragePathFromPublicUrl(url) {
  // Example:
  // https://xxxx.supabase.co/storage/v1/object/public/assets/media/audio/123_file.mp3
  // -> "media/audio/123_file.mp3"
  if (!url) return "";
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return "";
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  } catch {
    // fallback string parse
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = String(url).indexOf(marker);
    if (idx === -1) return "";
    return decodeURIComponent(String(url).slice(idx + marker.length).split("?")[0]);
  }
}

async function getPublicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || "";
}

export default function MediaTab({ posts: allPosts, refreshAll }) {
  const mediaPosts = useMemo(() => {
    return (allPosts || [])
      .filter((p) => p.division === "media")
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [allPosts]);

  const [mediaAssets, setMediaAssets] = useState([]);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  // browse
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");

  // upload panel
  const [audioFile, setAudioFile] = useState(null);
  const [thumbFile, setThumbFile] = useState(null);
  const [uploadPct, setUploadPct] = useState(0);

  const [newTitle, setNewTitle] = useState("");
  const [newIP, setNewIP] = useState("");
  const [newType, setNewType] = useState("soundtrack");
  const [newPlatform, setNewPlatform] = useState("Suno");
  const [newMood, setNewMood] = useState("");
  const [newScene, setNewScene] = useState("");
  const [newTags, setNewTags] = useState("suno, cinematic");

  // editor state per post
  const [edits, setEdits] = useState({});

  // assets CRUD state
  const [assetEdits, setAssetEdits] = useState({});
  const [deleteFromStorage, setDeleteFromStorage] = useState(true);

  const audioInputRef = useRef(null);
  const thumbInputRef = useRef(null);
  const dropRef = useRef(null);

  // posts columns support (safe detection)
  const [postsCols, setPostsCols] = useState({
    thumbnail_url: false,
    featured_image: false,
    published_at: false,
  });

  async function detectPostsColumns() {
    // SAFEST detection: ask for '*' and inspect keys.
    // If RLS blocks select, we avoid assuming columns exist (so we don't write them).
    try {
      const { data, error } = await supabase.from("posts").select("*").limit(1);
      if (error) {
        // If this errors, it's commonly RLS. Safer to not write optional columns.
        setPostsCols({ thumbnail_url: false, featured_image: false, published_at: false });
        return;
      }
      const row = (data && data[0]) || {};
      const keys = new Set(Object.keys(row || {}));
      setPostsCols({
        thumbnail_url: keys.has("thumbnail_url"),
        featured_image: keys.has("featured_image"),
        published_at: keys.has("published_at"),
      });
    } catch {
      setPostsCols({ thumbnail_url: false, featured_image: false, published_at: false });
    }
  }

  async function refreshAssets() {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("division", "media")
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) console.error(error);
    setMediaAssets(data || []);
  }

  useEffect(() => {
    detectPostsColumns();
    refreshAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRow(postId, patch) {
    setEdits((prev) => {
      const row = prev[postId] || {};
      return { ...prev, [postId]: { ...row, ...patch } };
    });
  }

  function getRow(post) {
    return edits[post.id] || {};
  }

  function getQuick(post) {
    const row = getRow(post);
    const base = post.metadata || {};
    const merged = { ...base, ...(row.metaQuick || {}) };
    const tags = merged.tags;
    return {
      media_type: merged.media_type || "",
      platform: merged.platform || "",
      duration: merged.duration || "",
      audio_url: merged.audio_url || "",
      media_url: merged.media_url || "",
      mood: merged.mood || "",
      scene: merged.scene || "",
      book: merged.book || "",
      universe: merged.universe || "",
      download_url: merged.download_url || "",
      license_url: merged.license_url || "",
      thumbnail_url: merged.thumbnail_url || "",
      tags: Array.isArray(tags) ? tags.join(", ") : tags || "",
    };
  }

  function setRowQuick(postId, patch) {
    setEdits((prev) => {
      const row = prev[postId] || {};
      const current = row.metaQuick || {};
      return { ...prev, [postId]: { ...row, metaQuick: { ...current, ...patch } } };
    });
  }

  // assets edits helpers
  function setAssetRow(assetId, patch) {
    setAssetEdits((prev) => {
      const row = prev[assetId] || {};
      return { ...prev, [assetId]: { ...row, ...patch } };
    });
  }
  function getAssetRow(assetId) {
    return assetEdits[assetId] || {};
  }

  const filteredPosts = useMemo(() => {
    let list = [...mediaPosts];

    if (typeFilter !== "ALL") {
      list = list.filter(
        (p) => String(p?.metadata?.media_type || "").toLowerCase() === typeFilter.toLowerCase()
      );
    }

    if (platformFilter !== "ALL") {
      list = list.filter(
        (p) => String(p?.metadata?.platform || "").toLowerCase() === platformFilter.toLowerCase()
      );
    }

    if (q.trim()) {
      const query = q.trim().toLowerCase();
      list = list.filter((p) => {
        const m = p.metadata || {};
        const hay = [
          p.title,
          p.slug,
          p.excerpt,
          p.content,
          m.media_type,
          m.platform,
          m.audio_url,
          m.media_url,
          m.book,
          m.universe,
          m.scene,
          m.mood,
          m.thumbnail_url,
          Array.isArray(m.tags) ? m.tags.join(", ") : m.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      });
    }

    // audio-clean view: must have mp3/wav audio_url OR external media_url
    list = list.filter((p) => {
      const m = p.metadata || {};
      const a = String(m.audio_url || "").trim();
      const u = String(m.media_url || "").trim();
      return (a && isAudioFile(a)) || !!u;
    });

    return list;
  }, [mediaPosts, q, typeFilter, platformFilter]);

  // drag/drop
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const onDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add("ring-2", "ring-amber-300");
    };
    const onDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove("ring-2", "ring-amber-300");
    };
    const onDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove("ring-2", "ring-amber-300");

      const files = Array.from(e.dataTransfer.files || []);
      const aud = files.find((f) => isAudioFile(f));
      const img = files.find((f) => isImageFile(f));

      if (!aud) {
        setNotice({ type: "error", msg: "Drop an MP3 or WAV file." });
        return;
      }
      setAudioFile(aud);
      if (img) setThumbFile(img);
      if (!newTitle) setNewTitle(aud.name.replace(/\.[^/.]+$/, ""));
    };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [newTitle]);

  async function uploadToStorage(file, prefix) {
    const cleanName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${prefix}/${Date.now()}_${Math.random().toString(16).slice(2)}_${cleanName}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });

    if (error) {
      console.error("Storage upload error:", error);
      throw new Error(`${error.message} (bucket="${BUCKET}", path="${path}")`);
    }

    const url = await getPublicUrl(BUCKET, path);
    if (!url) throw new Error("Upload succeeded but public URL was empty.");
    return { path, url };
  }

  async function createAssetRow({ audioUrl, thumbUrl, audioFilename, tagsArr }) {
    const payload = {
      division: "media",
      file_url: audioUrl,
      file_type: "audio",
      filename: audioFilename,
      purpose: "music",
      tags: tagsArr || [],
      metadata: thumbUrl ? { thumbnail_url: thumbUrl } : {},
    };

    const { error } = await supabase.from("assets").insert(payload);
    if (error) {
      console.error("assets insert error", error);
      // don't hard-fail; the file is already in Storage
    }
  }

  async function createMediaPost({ title, audioUrl, thumbUrl, durationStr }) {
    const slug = slugify(`${title}-${Date.now().toString().slice(-5)}`);

    const meta = buildMeta({
      media_type: newType,
      platform: newPlatform,
      audio_url: audioUrl,
      duration: durationStr || "",
      mood: newMood,
      scene: newScene,
      book: newIP,
      universe: newIP,
      tags: newTags,
      thumbnail_url: thumbUrl || "",
    });

    const payload = {
      division: "media",
      status: "published",
      title: title || "Untitled Track",
      slug,
      excerpt: `${meta.media_type || "soundtrack"} • ${meta.platform || "Suno"}${
        meta.duration ? ` • ${meta.duration}` : ""
      }`,
      content: meta.scene || meta.mood || "",
      metadata: meta,
      // Only include columns if they exist (detected safely)
      ...(postsCols.thumbnail_url ? { thumbnail_url: thumbUrl || null } : {}),
      ...(postsCols.featured_image ? { featured_image: thumbUrl || null } : {}),
      ...(postsCols.published_at ? { published_at: new Date().toISOString() } : {}),
    };

    const { error } = await supabase.from("posts").insert(payload);
    if (error) {
      console.error("posts insert error payload:", payload);
      console.error("posts insert error:", error);

      // Helpful message if it's likely RLS
      const msg = String(error.message || "");
      const code = String(error.code || "");
      if (msg.toLowerCase().includes("row level security") || code === "42501") {
        throw new Error(
          "Posts insert blocked by RLS. Add an insert policy for authenticated admin users on posts."
        );
      }

      throw new Error(error.message || "Failed to insert into posts");
    }
  }

  async function handleUploadCreate() {
    try {
      setNotice(null);

      if (!audioFile) return setNotice({ type: "error", msg: "Select an MP3 or WAV file first." });
      if (!isAudioFile(audioFile))
        return setNotice({ type: "error", msg: "Only MP3/WAV uploads are allowed." });
      if (thumbFile && !isImageFile(thumbFile))
        return setNotice({ type: "error", msg: "Thumbnail must be an image (jpg/png/webp)." });

      setBusy(true);
      setUploadPct(8);

      // 1) upload audio
      const { url: audioUrl } = await uploadToStorage(audioFile, AUDIO_PREFIX);
      setUploadPct(55);

      // 2) upload thumb (optional)
      let thumbUrl = "";
      if (thumbFile) {
        const up = await uploadToStorage(thumbFile, THUMB_PREFIX);
        thumbUrl = up.url;
      }
      setUploadPct(70);

      // 3) sniff duration
      let durationStr = "";
      const sec = await getAudioDurationSeconds(audioUrl);
      if (sec) durationStr = formatDuration(sec);
      setUploadPct(82);

      // 4) assets row
      const tagsArr = toTagsArray(newTags);
      await createAssetRow({ audioUrl, thumbUrl, audioFilename: audioFile.name, tagsArr });

      // 5) post row (this is what was failing for you)
      const title = (newTitle || audioFile.name.replace(/\.[^/.]+$/, "")).trim();
      await createMediaPost({ title, audioUrl, thumbUrl, durationStr });

      setUploadPct(100);

      // reset UI
      setAudioFile(null);
      setThumbFile(null);
      setNewTitle("");
      setNewMood("");
      setNewScene("");
      setNewIP("");

      setNotice({ type: "ok", msg: `Uploaded + created Media Post (bucket "${BUCKET}").` });

      await refreshAssets();
      refreshAll?.();
    } catch (e) {
      setNotice({ type: "error", msg: `Upload failed: ${e.message}` });
    } finally {
      setBusy(false);
      setTimeout(() => setUploadPct(0), 700);
    }
  }

  // POSTS CRUD
  async function save(post) {
    try {
      setNotice(null);
      const row = edits[post.id] || {};
      if (!Object.keys(row).length) return;

      let mergedMeta = post.metadata || {};
      if (row.metadataStr !== undefined) mergedMeta = safeJSON(row.metadataStr, mergedMeta);
      if (row.metaQuick) mergedMeta = { ...mergedMeta, ...buildMeta(row.metaQuick) };

      // enforce mp3/wav
      if (mergedMeta.audio_url && !isAudioFile(mergedMeta.audio_url)) mergedMeta.audio_url = "";

      // if user typed thumb URL, keep metadata.thumbnail_url in sync
      if (row.thumbnail_url !== undefined) mergedMeta.thumbnail_url = String(row.thumbnail_url || "").trim();
      if (row.featured_image !== undefined) mergedMeta.thumbnail_url = String(row.featured_image || "").trim();

      const payload = {
        ...(row.title !== undefined ? { title: row.title } : {}),
        ...(row.slug !== undefined ? { slug: row.slug } : {}),
        ...(row.excerpt !== undefined ? { excerpt: row.excerpt } : {}),
        ...(row.content !== undefined ? { content: row.content } : {}),
        metadata: mergedMeta,
        ...(postsCols.thumbnail_url && row.thumbnail_url !== undefined
          ? { thumbnail_url: row.thumbnail_url || null }
          : {}),
        ...(postsCols.featured_image && row.featured_image !== undefined
          ? { featured_image: row.featured_image || null }
          : {}),
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
    if (!confirm("Delete this media post?")) return;
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

  // ASSETS CRUD (Recent Audio Uploads)
  async function saveAsset(asset) {
    try {
      setNotice(null);
      const row = getAssetRow(asset.id);
      if (!Object.keys(row).length) return;

      const nextTags = row.tagsStr !== undefined ? toTagsArray(row.tagsStr) : asset.tags || [];
      const nextThumb =
        row.thumbStr !== undefined ? String(row.thumbStr || "").trim() : asset?.metadata?.thumbnail_url || "";

      const payload = {
        ...(row.filename !== undefined ? { filename: row.filename } : {}),
        ...(row.purpose !== undefined ? { purpose: row.purpose } : {}),
        ...(row.file_url !== undefined ? { file_url: row.file_url } : {}),
        ...(row.file_type !== undefined ? { file_type: row.file_type } : {}),
        tags: nextTags,
        metadata: { ...(asset.metadata || {}), ...(nextThumb ? { thumbnail_url: nextThumb } : { thumbnail_url: "" }) },
      };

      const { error } = await supabase.from("assets").update(payload).eq("id", asset.id);
      if (error) throw error;

      setAssetEdits((prev) => ({ ...prev, [asset.id]: {} }));
      await refreshAssets();
      setNotice({ type: "ok", msg: "Asset saved." });
    } catch (e) {
      setNotice({ type: "error", msg: `Asset save failed: ${e.message}` });
    }
  }

  async function deleteAsset(asset) {
    const ok = confirm(
      `Delete this asset row${deleteFromStorage ? " AND delete file from Storage" : ""}?`
    );
    if (!ok) return;

    try {
      setNotice(null);

      // optionally delete storage object first
      if (deleteFromStorage) {
        const path = extractStoragePathFromPublicUrl(asset.file_url || "");
        if (path) {
          const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
          if (rmErr) {
            // don't block DB delete; but warn
            console.error("storage remove error", rmErr);
          }
        }
      }

      const { error } = await supabase.from("assets").delete().eq("id", asset.id);
      if (error) throw error;

      await refreshAssets();
      setNotice({ type: "ok", msg: "Asset deleted." });
    } catch (e) {
      setNotice({ type: "error", msg: `Asset delete failed: ${e.message}` });
    }
  }

  const audioAssets = useMemo(() => {
    return (mediaAssets || []).filter((a) => a.file_type === "audio" && isAudioFile(a.file_url || ""));
  }, [mediaAssets]);

  const duplicatesSummary = useMemo(() => {
    const map = new Map();
    for (const a of audioAssets) {
      const key = (a.filename || a.file_url || "").toLowerCase().trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    const dups = Array.from(map.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);
    return dups.slice(0, 8);
  }, [audioAssets]);

  return (
    <SectionCard title="Media (Audio Studio)">
      {notice?.msg ? (
        <div
          className={`mt-4 rounded-xl border p-3 text-sm ${
            notice.type === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {notice.msg}
        </div>
      ) : null}

      {/* UPLOAD STUDIO */}
      <div className="mt-6 rounded-3xl border border-amber-100/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 p-5 md:p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Suno Workflow</div>
            <h3 className="text-xl md:text-2xl font-bold mt-1">Upload a Track (MP3/WAV)</h3>
            <p className="text-xs opacity-70 mt-1">
              Uploads go to bucket <b>{BUCKET}</b>. Thumbnails are optional and stored in{" "}
              <code>metadata.thumbnail_url</code> (and in post columns only if they exist).
            </p>
            <div className="text-[11px] opacity-60 mt-2">
              Posts columns detected:{" "}
              <span className="font-semibold">
                thumbnail_url={String(postsCols.thumbnail_url)} • featured_image={String(postsCols.featured_image)} •
                published_at={String(postsCols.published_at)}
              </span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <MiniChip>Bucket: {BUCKET}</MiniChip>
            <MiniChip>.mp3 / .wav only</MiniChip>
            <MiniChip>Auto-creates /media post</MiniChip>
          </div>
        </div>

        <div
          ref={dropRef}
          className="mt-4 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-950/20 p-5"
        >
          <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold">Drag & drop MP3/WAV here</div>
              <div className="text-xs opacity-70 mt-1">You can also drop an image thumbnail alongside the audio.</div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-sm font-semibold"
                >
                  Choose Audio
                </button>
                <button
                  type="button"
                  onClick={() => thumbInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/30 text-sm font-semibold"
                >
                  Choose Thumbnail (optional)
                </button>
              </div>

              <input
                ref={audioInputRef}
                type="file"
                accept=".mp3,.wav,audio/mpeg,audio/wav"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!isAudioFile(f)) return setNotice({ type: "error", msg: "Only MP3 or WAV allowed." });
                  setAudioFile(f);
                  if (!newTitle) setNewTitle(f.name.replace(/\.[^/.]+$/, ""));
                }}
              />

              <input
                ref={thumbInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (!isImageFile(f)) return setNotice({ type: "error", msg: "Thumbnail must be jpg/png/webp." });
                  setThumbFile(f);
                }}
              />
            </div>

            <div className="min-w-[280px] w-full md:w-[360px]">
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/40 p-4">
                <div className="text-xs opacity-70">Selected</div>
                <div className="mt-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="opacity-70">Audio:</span>
                    <span className="font-semibold truncate">{audioFile?.name || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="opacity-70">Thumb:</span>
                    <span className="font-semibold truncate">{thumbFile?.name || "—"}</span>
                  </div>
                </div>

                {busy && uploadPct ? (
                  <div className="mt-4">
                    <div className="text-xs opacity-70 mb-1">Uploading… {uploadPct}%</div>
                    <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                      <div className="h-full bg-amber-400" style={{ width: `${uploadPct}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] opacity-70">Title</label>
              <input
                className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Main Theme — Legacy of the Hidden Clans"
              />
            </div>

            <div>
              <label className="block text-[10px] opacity-70">IP (Book/Universe)</label>
              <input
                className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                value={newIP}
                onChange={(e) => setNewIP(e.target.value)}
                placeholder="Legacy of the Hidden Clans"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] opacity-70">Type</label>
                <select
                  className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                >
                  {MEDIA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] opacity-70">Platform</label>
                <select
                  className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                  value={newPlatform}
                  onChange={(e) => setNewPlatform(e.target.value)}
                >
                  {PLATFORMS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] opacity-70">Mood</label>
              <input
                className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                value={newMood}
                onChange={(e) => setNewMood(e.target.value)}
                placeholder="epic, mystical, tragic…"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] opacity-70">Scene / Notes</label>
              <input
                className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                value={newScene}
                onChange={(e) => setNewScene(e.target.value)}
                placeholder="Opening credits theme. Establishes mythic scale…"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-[10px] opacity-70">Tags</label>
              <input
                className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="main-theme, opening-credits, dark-fantasy…"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3 flex-wrap items-center">
            <button
              type="button"
              disabled={busy}
              onClick={handleUploadCreate}
              className="px-5 py-2 rounded-2xl bg-amber-200 text-amber-950 font-semibold hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Upload + Create Media Post
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setAudioFile(null);
                setThumbFile(null);
                setNewTitle("");
                setNewMood("");
                setNewScene("");
                setNewIP("");
                setNotice(null);
              }}
              className="px-5 py-2 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/30 font-semibold"
            >
              Clear
            </button>

            <div className="text-xs opacity-70 flex flex-wrap gap-2">
              <MiniChip>Audio path: {AUDIO_PREFIX}/…</MiniChip>
              <MiniChip>Thumb path: {THUMB_PREFIX}/…</MiniChip>
            </div>
          </div>
        </div>
      </div>

      {/* BROWSE */}
      <div className="mt-8 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
          <div className="flex-1">
            <label className="block text-[10px] opacity-70">Search</label>
            <input
              className="w-full dark:bg-gray-800 text-sm rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700"
              placeholder="Search title, IP, scene, mood…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="min-w-[180px]">
            <label className="block text-[10px] opacity-70">Type</label>
            <select
              className="w-full dark:bg-gray-800 text-sm rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="ALL">All types</option>
              {MEDIA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[180px]">
            <label className="block text-[10px] opacity-70">Platform</label>
            <select
              className="w-full dark:bg-gray-800 text-sm rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
            >
              <option value="ALL">All</option>
              {PLATFORMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs opacity-70">
            Showing <b>{filteredPosts.length}</b> / {mediaPosts.length} (audio-clean)
          </div>
        </div>
      </div>

      {/* RECENT UPLOADS (ASSETS CRUD) */}
      <div className="mt-10">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold mb-1">Recent Audio Uploads</h3>
            <p className="text-xs opacity-70">
              Shows assets where <code>division=media</code> and <code>file_type=audio</code>. You can edit + delete
              duplicates here.
            </p>

            {duplicatesSummary.length ? (
              <div className="mt-2 text-[11px] opacity-70">
                <span className="font-semibold">Duplicates detected:</span>{" "}
                {duplicatesSummary.map(([k, c]) => (
                  <span key={k} className="ml-2">
                    <MiniChip>
                      {c}× {k.slice(0, 26)}
                      {k.length > 26 ? "…" : ""}
                    </MiniChip>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs opacity-80 flex items-center gap-2">
              <input
                type="checkbox"
                checked={deleteFromStorage}
                onChange={(e) => setDeleteFromStorage(e.target.checked)}
              />
              Delete file from Storage too
            </label>

            <button
              type="button"
              className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/30 text-sm font-semibold"
              onClick={refreshAssets}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="overflow-x-auto mt-3 rounded-2xl border border-gray-200 dark:border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
                <th className="py-2 px-3">Preview</th>
                <th className="px-3">Filename</th>
                <th className="px-3">Thumb</th>
                <th className="px-3">Tags</th>
                <th className="px-3">URL</th>
                <th className="px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {audioAssets.length ? (
                audioAssets.map((a) => {
                  const url = a.file_url || "";
                  const thumb = a?.metadata?.thumbnail_url || "";
                  const row = getAssetRow(a.id);

                  const filenameVal = row.filename ?? a.filename ?? "";
                  const tagsVal =
                    row.tagsStr ?? (Array.isArray(a.tags) && a.tags.length ? a.tags.join(", ") : "");
                  const thumbVal = row.thumbStr ?? thumb;

                  return (
                    <tr key={a.id} className="border-b dark:border-gray-800 align-top">
                      <td className="py-2 px-3">
                        <div className="w-[260px] max-w-full">
                          <audio controls className="w-full">
                            <source src={url} />
                          </audio>
                        </div>
                        <div className="mt-2 text-[11px] opacity-60">id: {a.id}</div>
                      </td>

                      <td className="py-2 px-3 min-w-[240px]">
                        <input
                          className="w-full dark:bg-gray-800 text-xs rounded-lg px-2 py-1 border border-gray-200 dark:border-gray-700"
                          value={filenameVal}
                          onChange={(e) => setAssetRow(a.id, { filename: e.target.value })}
                          placeholder="filename.mp3"
                        />
                      </td>

                      <td className="py-2 px-3 min-w-[220px]">
                        <div className="flex items-center gap-2">
                          {thumbVal ? (
                            <img src={thumbVal} className="w-10 h-10 object-cover rounded" alt="" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-800" />
                          )}
                          <input
                            className="w-full dark:bg-gray-800 text-xs rounded-lg px-2 py-1 border border-gray-200 dark:border-gray-700"
                            value={thumbVal}
                            onChange={(e) => setAssetRow(a.id, { thumbStr: e.target.value })}
                            placeholder="https://.../thumb.webp (optional)"
                          />
                        </div>
                      </td>

                      <td className="py-2 px-3 min-w-[260px]">
                        <input
                          className="w-full dark:bg-gray-800 text-xs rounded-lg px-2 py-1 border border-gray-200 dark:border-gray-700"
                          value={tagsVal}
                          onChange={(e) => setAssetRow(a.id, { tagsStr: e.target.value })}
                          placeholder="comma, tags"
                        />
                      </td>

                      <td className="py-2 px-3 max-w-[420px]">
                        <div className="truncate">{url}</div>
                        <div className="mt-1 flex gap-3 flex-wrap">
                          <CopyBtn text={url} label="Copy URL" />
                          {thumbVal ? <CopyBtn text={thumbVal} label="Copy Thumb" /> : null}
                        </div>
                      </td>

                      <td className="py-2 px-3 space-y-2 min-w-[160px]">
                        <button
                          type="button"
                          className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                          onClick={() => saveAsset(a)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                          onClick={() => deleteAsset(a)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="py-6 px-3 opacity-70" colSpan={6}>
                    No audio uploads found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* POSTS LIST */}
      <div className="mt-10">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-semibold mb-1">Media Posts (what appears on /media)</h3>
          <div className="text-xs opacity-70">Audio posts only (mp3/wav audio_url OR external media_url).</div>
        </div>

        <div className="grid grid-cols-1 gap-5 mt-3">
          {filteredPosts.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center bg-white/70 dark:bg-gray-900/50">
              <div className="text-lg font-bold">No media posts yet</div>
              <div className="opacity-80 mt-2">Upload a track above to auto-create one.</div>
              <div className="opacity-70 mt-1 text-sm">
                If uploads show under “Recent Audio Uploads” but not here, the <b>posts insert</b> is failing (likely RLS
                or schema mismatch).
              </div>
            </div>
          ) : (
            filteredPosts.map((p) => {
              const row = getRow(p);
              const quick = getQuick(p);

              const audioUrl = (row?.metaQuick?.audio_url ?? quick.audio_url ?? "").trim();
              const mediaUrl = (row?.metaQuick?.media_url ?? quick.media_url ?? "").trim();
              const effective = audioUrl || mediaUrl;

              const thumb = extractThumbFromPost(p, row);
              const showThumb = !!thumb && !!effective;

              return (
                <div
                  key={p.id}
                  className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm p-5 md:p-6"
                >
                  <div className="flex flex-col md:flex-row gap-4 md:items-start md:justify-between">
                    <div className="flex gap-4 items-start">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-200 dark:bg-gray-800 flex items-center justify-center text-[10px] text-gray-500">
                        {showThumb ? <img src={thumb} className="w-full h-full object-cover" alt="" /> : "audio"}
                      </div>

                      <div>
                        <div className="flex flex-wrap gap-2">
                          {quick.media_type ? <MiniChip>{quick.media_type}</MiniChip> : null}
                          {quick.platform ? <MiniChip>{quick.platform}</MiniChip> : null}
                          {quick.duration ? <MiniChip>{quick.duration}</MiniChip> : null}
                          {quick.book ? <MiniChip>{quick.book}</MiniChip> : null}
                        </div>

                        <div className="mt-2 text-xl font-bold">{row.title ?? p.title}</div>
                        <div className="text-xs opacity-70 mt-1">/media/{row.slug ?? p.slug}</div>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <a
                        className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/30 text-sm font-semibold"
                        href={`/media/${row.slug ?? p.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                      <button
                        className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                        onClick={() => save(p)}
                        type="button"
                      >
                        Save
                      </button>
                      <button
                        className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
                        onClick={() => remove(p.id)}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {effective && isAudioFile(effective) ? (
                    <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/20 p-3">
                      <div className="text-[10px] opacity-70 mb-1">Preview</div>
                      <audio controls className="w-full">
                        <source src={effective} />
                      </audio>
                      <div className="mt-2 flex gap-3 flex-wrap">
                        <CopyBtn text={effective} label="Copy audio_url" />
                        {thumb ? <CopyBtn text={thumb} label="Copy thumbnail" /> : null}
                      </div>
                    </div>
                  ) : effective ? (
                    <div className="mt-4 text-sm">
                      <div className="text-xs opacity-70">External media</div>
                      <a className="underline" href={effective} target="_blank" rel="noreferrer">
                        Open link →
                      </a>
                    </div>
                  ) : (
                    <div className="mt-4 text-sm opacity-70">No audio_url/media_url set yet.</div>
                  )}

                  <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] opacity-70">Title</label>
                      <input
                        className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                        value={row.title ?? p.title ?? ""}
                        onChange={(e) => setRow(p.id, { title: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] opacity-70">Slug</label>
                      <input
                        className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                        value={row.slug ?? p.slug ?? ""}
                        onChange={(e) => setRow(p.id, { slug: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] opacity-70">Thumbnail URL (optional)</label>
                      <input
                        className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                        value={
                          postsCols.thumbnail_url
                            ? row.thumbnail_url ?? p.thumbnail_url ?? quick.thumbnail_url ?? ""
                            : row.featured_image ?? p.featured_image ?? quick.thumbnail_url ?? ""
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (postsCols.thumbnail_url) setRow(p.id, { thumbnail_url: v });
                          else if (postsCols.featured_image) setRow(p.id, { featured_image: v });
                          else setRowQuick(p.id, { thumbnail_url: v }); // metadata-only fallback
                        }}
                        placeholder="https://.../thumb.webp"
                      />
                      <div className="text-[10px] opacity-60 mt-1">
                        Stored in <code>metadata.thumbnail_url</code> always. Column write is auto-detected.
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[10px] opacity-70">Quick Metadata</label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                        <select
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                          value={row?.metaQuick?.media_type ?? quick.media_type}
                          onChange={(e) => setRowQuick(p.id, { media_type: e.target.value })}
                        >
                          <option value="">Media Type</option>
                          {MEDIA_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>

                        <select
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                          value={row?.metaQuick?.platform ?? quick.platform}
                          onChange={(e) => setRowQuick(p.id, { platform: e.target.value })}
                        >
                          <option value="">Platform</option>
                          {PLATFORMS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>

                        <input
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                          placeholder="duration e.g. 2:45"
                          value={row?.metaQuick?.duration ?? quick.duration}
                          onChange={(e) => setRowQuick(p.id, { duration: e.target.value })}
                        />

                        <input
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700 md:col-span-2"
                          placeholder="audio_url (mp3/wav only)"
                          value={row?.metaQuick?.audio_url ?? quick.audio_url}
                          onChange={(e) => setRowQuick(p.id, { audio_url: e.target.value })}
                        />

                        <input
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                          placeholder="media_url (YouTube/Spotify/etc.)"
                          value={row?.metaQuick?.media_url ?? quick.media_url}
                          onChange={(e) => setRowQuick(p.id, { media_url: e.target.value })}
                        />

                        <input
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                          placeholder="IP (book/universe)"
                          value={row?.metaQuick?.book ?? quick.book}
                          onChange={(e) => setRowQuick(p.id, { book: e.target.value, universe: e.target.value })}
                        />

                        <input
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                          placeholder="scene"
                          value={row?.metaQuick?.scene ?? quick.scene}
                          onChange={(e) => setRowQuick(p.id, { scene: e.target.value })}
                        />

                        <input
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                          placeholder="mood"
                          value={row?.metaQuick?.mood ?? quick.mood}
                          onChange={(e) => setRowQuick(p.id, { mood: e.target.value })}
                        />

                        <input
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700 md:col-span-3"
                          placeholder="tags (comma-separated)"
                          value={row?.metaQuick?.tags ?? quick.tags}
                          onChange={(e) => setRowQuick(p.id, { tags: e.target.value })}
                        />

                        <input
                          className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700 md:col-span-3"
                          placeholder="thumbnail_url (optional) — stored in metadata"
                          value={row?.metaQuick?.thumbnail_url ?? quick.thumbnail_url}
                          onChange={(e) => setRowQuick(p.id, { thumbnail_url: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[10px] opacity-70">Metadata JSON (advanced)</label>
                      <textarea
                        className="w-full h-32 dark:bg-gray-800 text-[11px] rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                        value={row.metadataStr ?? JSON.stringify(p.metadata || {}, null, 2)}
                        onChange={(e) => setRow(p.id, { metadataStr: e.target.value })}
                      />
                      <div className="mt-2 text-[10px] opacity-60">
                        Save merges Quick Metadata + JSON. <b>audio_url is enforced to mp3/wav.</b>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </SectionCard>
  );
}
