import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import MediaShowcaseForm from "@/components/admin/MediaShowcaseForm";
import SectionCard from "@/components/admin/SectionCard";
import { safeJSON } from "@/lib/adminUtils";

/**
 * STATE OF THE ART MEDIA ADMIN (Audio-first)
 * - Upload MP3/WAV to Supabase Storage (drag/drop + picker)
 * - Optional thumbnail upload (image) attached to the audio
 * - Creates Posts (division=media) so it instantly appears on /media + media.js
 * - Also creates Assets (division=media) so it appears in Recent Uploads
 * - Enforces audio-only (mp3/wav) for song uploads
 * - Inline preview player + duration auto-detect (best-effort)
 * - Search, filters, “Suno drop” workflow
 *
 * Assumptions:
 * - posts table exists with: title, slug, excerpt, content, division, status, metadata, thumbnail_url, featured_image
 * - assets table exists with: division, file_url, file_type, filename, purpose, tags, metadata
 * - Supabase Storage bucket exists (default BUCKET="public")
 */

const BUCKET = "public"; // <-- change to your bucket name if needed (e.g. "assets")
const AUDIO_PREFIX = "media/audio";
const THUMB_PREFIX = "media/thumbs";

const AUDIO_EXTS = ["mp3", "wav"];
const IMG_EXTS = ["jpg", "jpeg", "png", "webp"];

const MEDIA_TYPES = ["soundtrack", "score", "chapter_read", "scene", "podcast", "interview", "event", "playlist"];

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
  const e = extOf(s);
  return AUDIO_EXTS.includes(e);
}

function isImageFile(fileOrUrl) {
  if (!fileOrUrl) return false;
  const s = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl.name;
  const e = extOf(s);
  return IMG_EXTS.includes(e);
}

function publicUrlFor(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

async function getAudioDurationSeconds(url) {
  // best-effort duration sniff using HTMLAudioElement (works if CORS/public)
  return new Promise((resolve) => {
    try {
      const a = new Audio();
      a.preload = "metadata";
      a.src = url;
      const cleanup = () => {
        a.onloadedmetadata = null;
        a.onerror = null;
      };
      a.onloadedmetadata = () => {
        const d = Number(a.duration);
        cleanup();
        if (!Number.isFinite(d) || d <= 0) return resolve(null);
        resolve(d);
      };
      a.onerror = () => {
        cleanup();
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
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

function buildMetaFromQuick(q = {}) {
  // Only allow audio_url to be mp3/wav; if not, drop it.
  const audio_url = q.audio_url?.trim() || "";
  const cleanedAudio = isAudioFile(audio_url) ? audio_url : "";

  let tags = q.tags;
  if (typeof tags === "string") {
    tags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  return {
    media_type: q.media_type || "soundtrack",
    platform: q.platform || "Suno",
    audio_url: cleanedAudio,
    media_url: q.media_url?.trim() || "",
    duration: q.duration || "",
    mood: q.mood || "",
    scene: q.scene || "",
    book: q.book || "",
    series: q.series || "",
    universe: q.universe || "",
    download_url: q.download_url?.trim() || "",
    license_url: q.license_url?.trim() || "",
    tags: Array.isArray(tags) ? tags : [],
  };
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

  // Browse
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [platformFilter, setPlatformFilter] = useState("ALL");

  // Editor state per post
  const [edits, setEdits] = useState({});

  // Upload panel state
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

  const audioInputRef = useRef(null);
  const thumbInputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*")
        .eq("division", "media")
        .order("created_at", { ascending: false })
        .limit(75);

      if (error) console.error(error);
      setMediaAssets(data || []);
    })();
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
    // normalize tags back to string for UI
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
      series: merged.series || "",
      universe: merged.universe || "",
      download_url: merged.download_url || "",
      license_url: merged.license_url || "",
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

  const filteredPosts = useMemo(() => {
    let list = [...mediaPosts];

    if (typeFilter !== "ALL") {
      list = list.filter((p) => String(p?.metadata?.media_type || "").toLowerCase() === typeFilter.toLowerCase());
    }
    if (platformFilter !== "ALL") {
      list = list.filter((p) => String(p?.metadata?.platform || "").toLowerCase() === platformFilter.toLowerCase());
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
          m.series,
          m.universe,
          m.scene,
          m.mood,
          Array.isArray(m.tags) ? m.tags.join(", ") : m.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      });
    }

    // IMPORTANT: show only items whose audio is mp3/wav (or external link)
    // We will hide "image-only" posts from MediaTab to keep it audio-clean.
    list = list.filter((p) => {
      const m = p.metadata || {};
      const a = String(m.audio_url || "").trim();
      const u = String(m.media_url || "").trim();
      const okAudio = a ? isAudioFile(a) : false;
      const okExternal = !!u; // allow Spotify/YT links
      return okAudio || okExternal;
    });

    return list;
  }, [mediaPosts, q, typeFilter, platformFilter]);

  // Drag/drop handlers (audio required)
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
        setNotice({ type: "error", msg: "Drop an MP3 or WAV file (audio uploads are restricted to mp3/wav)." });
        return;
      }
      setAudioFile(aud);
      if (img) setThumbFile(img);

      if (!newTitle) {
        const base = aud.name.replace(/\.[^/.]+$/, "");
        setNewTitle(base);
      }
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

    // Use upsert to avoid collisions; cache control ok
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });

    if (error) throw error;
    return { path, url: publicUrlFor(path) };
  }

  async function createAssetRow({ audioUrl, thumbUrl, audioFilename, tagsArr }) {
    // Keep an assets row for “Recent Uploads” browsing / copy URL workflow
    // file_type should be "audio" for mp3/wav
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
    if (error) console.error("assets insert error", error);
  }

  async function createMediaPost({ title, audioUrl, thumbUrl, durationStr }) {
    const slug = slugify(`${title}-${Date.now().toString().slice(-5)}`);

    const meta = buildMetaFromQuick({
      media_type: newType,
      platform: newPlatform,
      audio_url: audioUrl,
      duration: durationStr || "",
      mood: newMood,
      scene: newScene,
      book: newIP,
      series: "",
      universe: newIP,
      tags: newTags,
      media_url: "",
      download_url: "",
      license_url: "",
    });

    // Thumbnail must be allowed only if tied to audio.
    const payload = {
      division: "media",
      status: "published",
      title: title || "Untitled Track",
      slug,
      excerpt: `${meta.media_type || "soundtrack"} • ${meta.platform || "Suno"}${meta.duration ? ` • ${meta.duration}` : ""}`,
      content: meta.scene || meta.mood || "",
      thumbnail_url: thumbUrl || null,
      featured_image: thumbUrl || null, // legacy
      metadata: meta,
    };

    const { error } = await supabase.from("posts").insert(payload);
    if (error) throw error;
  }

  async function handleUploadCreate() {
    try {
      setNotice(null);

      if (!audioFile) {
        setNotice({ type: "error", msg: "Select an MP3 or WAV file first." });
        return;
      }
      if (!isAudioFile(audioFile)) {
        setNotice({ type: "error", msg: "Only MP3/WAV uploads are allowed." });
        return;
      }
      if (thumbFile && !isImageFile(thumbFile)) {
        setNotice({ type: "error", msg: "Thumbnail must be an image (jpg/png/webp)." });
        return;
      }

      setBusy(true);
      setUploadPct(5);

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

      // 3) try to determine duration
      let durationStr = "";
      const sec = await getAudioDurationSeconds(audioUrl);
      if (sec) durationStr = formatDuration(sec);

      setUploadPct(82);

      // 4) insert assets row (recent uploads)
      const tagsArr = newTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      await createAssetRow({
        audioUrl,
        thumbUrl,
        audioFilename: audioFile.name,
        tagsArr,
      });

      // 5) create post (so it appears on /media)
      const title = (newTitle || audioFile.name.replace(/\.[^/.]+$/, "")).trim();
      await createMediaPost({ title, audioUrl, thumbUrl, durationStr });

      setUploadPct(100);

      // refresh
      setAudioFile(null);
      setThumbFile(null);
      setNewTitle("");
      setNewMood("");
      setNewScene("");
      setNewIP("");
      setNotice({ type: "ok", msg: "Uploaded + created a Media post. Your track should now appear on /media." });

      // reload assets list
      const { data } = await supabase
        .from("assets")
        .select("*")
        .eq("division", "media")
        .order("created_at", { ascending: false })
        .limit(75);
      setMediaAssets(data || []);

      refreshAll?.();
    } catch (e) {
      setNotice({ type: "error", msg: `Upload failed: ${e.message}` });
    } finally {
      setBusy(false);
      setTimeout(() => setUploadPct(0), 600);
    }
  }

  async function save(post) {
    try {
      setNotice(null);
      const row = edits[post.id] || {};
      if (!Object.keys(row).length) return;

      let mergedMeta = post.metadata || {};

      if (row.metadataStr !== undefined) mergedMeta = safeJSON(row.metadataStr, mergedMeta);
      if (row.metaQuick) mergedMeta = { ...mergedMeta, ...buildMetaFromQuick(row.metaQuick) };

      // enforce mp3/wav for audio_url if present
      if (mergedMeta.audio_url && !isAudioFile(mergedMeta.audio_url)) {
        mergedMeta.audio_url = "";
      }

      // thumbnail is only allowed if there is audio_url (or media_url)
      const hasAudio = !!mergedMeta.audio_url;
      const hasExternal = !!mergedMeta.media_url;

      const thumb = row.thumbnail_url ?? row.featured_image ?? post.thumbnail_url ?? post.featured_image ?? "";
      const allowThumb = (hasAudio || hasExternal) && thumb;

      const payload = {
        ...(row.title !== undefined ? { title: row.title } : {}),
        ...(row.slug !== undefined ? { slug: row.slug } : {}),
        ...(row.excerpt !== undefined ? { excerpt: row.excerpt } : {}),
        ...(row.content !== undefined ? { content: row.content } : {}),
        ...(row.thumbnail_url !== undefined ? { thumbnail_url: allowThumb ? row.thumbnail_url : null } : {}),
        ...(row.featured_image !== undefined ? { featured_image: allowThumb ? row.featured_image : null } : {}),
        metadata: mergedMeta,
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

  function copyAudioUrlFromAsset(a) {
    navigator.clipboard?.writeText?.(a.file_url || "");
    setNotice({ type: "ok", msg: "Copied audio URL." });
  }

  return (
    <SectionCard title="Media (Audio Studio)">
      {/* keep your create form if you still use it */}
      <MediaShowcaseForm onCreated={refreshAll} />

      {/* Notice */}
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

      {/* UPLOAD STUDIO */}
      <div className="mt-6 rounded-3xl border border-amber-100/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 p-5 md:p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Suno Workflow</div>
            <h3 className="text-xl md:text-2xl font-bold mt-1">Upload a Track (MP3/WAV)</h3>
            <p className="text-xs opacity-70 mt-1">
              Audio-only uploads. Thumbnails are optional and only displayed if attached to a song.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <MiniChip>Bucket: {BUCKET}</MiniChip>
            <MiniChip>.mp3 / .wav only</MiniChip>
            <MiniChip>Auto-creates /media post</MiniChip>
          </div>
        </div>

        {/* Dropzone */}
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
                  if (!isAudioFile(f)) {
                    setNotice({ type: "error", msg: "Only MP3 or WAV allowed." });
                    return;
                  }
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
                  if (!isImageFile(f)) {
                    setNotice({ type: "error", msg: "Thumbnail must be jpg/png/webp." });
                    return;
                  }
                  setThumbFile(f);
                }}
              />
            </div>

            <div className="min-w-[280px] w-full md:w-[340px]">
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

                {audioFile ? (
                  <div className="mt-3 text-xs opacity-70">
                    Tip: keep names clean. Your title + slug are generated from the track name.
                  </div>
                ) : null}

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

          {/* Meta fields */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] opacity-70">Title</label>
              <input
                className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Opening Theme"
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
                placeholder="mystical, triumphant, tense…"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] opacity-70">Scene / Notes</label>
              <input
                className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                value={newScene}
                onChange={(e) => setNewScene(e.target.value)}
                placeholder="Chapter 1 — Opening Theme"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-[10px] opacity-70">Tags</label>
              <input
                className="w-full dark:bg-gray-800 text-sm rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="suno, cinematic, fantasy"
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
              <MiniChip>Audio goes to: {AUDIO_PREFIX}/…</MiniChip>
              <MiniChip>Thumb goes to: {THUMB_PREFIX}/…</MiniChip>
            </div>
          </div>
        </div>
      </div>

      {/* BROWSE CONTROLS */}
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

        <div className="mt-3 text-xs opacity-80 flex flex-wrap gap-2">
          <MiniChip>Uploads restricted to MP3/WAV</MiniChip>
          <MiniChip>Thumbnails only show if tied to a song</MiniChip>
          <MiniChip>Auto-post creation = instant /media visibility</MiniChip>
        </div>
      </div>

      {/* RECENT UPLOADS (assets table) */}
      <div className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold mb-1">Recent Audio Uploads</h3>
            <p className="text-xs opacity-70">
              Shows only assets where <code>file_type=audio</code> and URL ends with mp3/wav.
            </p>
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
                <th className="px-3">Copy</th>
              </tr>
            </thead>
            <tbody>
              {mediaAssets.length ? (
                mediaAssets
                  .filter((a) => {
                    const url = a.file_url || "";
                    const ok = isAudioFile(url);
                    return a.file_type === "audio" && ok;
                  })
                  .map((a) => {
                    const url = a.file_url || "";
                    const thumb = a?.metadata?.thumbnail_url || "";
                    return (
                      <tr key={a.id} className="border-b dark:border-gray-800 align-top">
                        <td className="py-2 px-3">
                          <div className="w-[260px] max-w-full">
                            <audio controls className="w-full">
                              <source src={url} />
                            </audio>
                          </div>
                        </td>
                        <td className="py-2 px-3">{a.filename || "—"}</td>
                        <td className="py-2 px-3">
                          {thumb ? (
                            <img src={thumb} className="w-12 h-12 object-cover rounded" alt="" />
                          ) : (
                            <span className="text-xs opacity-60">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {Array.isArray(a.tags) && a.tags.length ? a.tags.join(", ") : "—"}
                        </td>
                        <td className="py-2 px-3 max-w-[420px] truncate">{url}</td>
                        <td className="py-2 px-3 space-y-1">
                          <CopyBtn text={url} label="Copy URL" />
                          {thumb ? <CopyBtn text={thumb} label="Copy Thumb URL" /> : null}
                          <button
                            type="button"
                            className="text-blue-600 underline text-xs"
                            onClick={() => copyAudioUrlFromAsset(a)}
                          >
                            Copy for audio_url
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

      {/* SHOWCASE POSTS (posts table) */}
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
            </div>
          ) : (
            filteredPosts.map((p) => {
              const row = getRow(p);
              const quick = getQuick(p);

              const audioUrl = (row?.metaQuick?.audio_url ?? quick.audio_url ?? "").trim();
              const mediaUrl = (row?.metaQuick?.media_url ?? quick.media_url ?? "").trim();
              const effective = audioUrl || mediaUrl;

              // thumbs only shown if tied to audio/external
              const thumb =
                row.thumbnail_url ??
                row.featured_image ??
                p.thumbnail_url ??
                p.featured_image ??
                "";

              const showThumb = !!thumb && (!!effective);

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

                  {/* Player (only direct mp3/wav) */}
                  {effective && isAudioFile(effective) ? (
                    <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/20 p-3">
                      <div className="text-[10px] opacity-70 mb-1">Preview</div>
                      <audio controls className="w-full">
                        <source src={effective} />
                      </audio>
                      <div className="mt-2 flex gap-3 flex-wrap">
                        <CopyBtn text={effective} label="Copy audio_url" />
                        {thumb ? <CopyBtn text={thumb} label="Copy thumbnail_url" /> : null}
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
                    <div className="mt-4 text-sm opacity-70">
                      No audio_url/media_url set yet (this tab hides image-only items).
                    </div>
                  )}

                  {/* Editor */}
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
                        value={row.thumbnail_url ?? p.thumbnail_url ?? ""}
                        onChange={(e) => setRow(p.id, { thumbnail_url: e.target.value })}
                        placeholder="Only used if tied to audio"
                      />
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
                        Save merges Quick Metadata + JSON. audio_url is enforced to mp3/wav.
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
