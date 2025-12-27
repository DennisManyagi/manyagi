// pages/studios/[slug].js
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Hero from "@/components/Hero";
import Card from "@/components/Card";
import SectionIntro from "@/components/SectionIntro";
import { supabase } from "@/lib/supabase";
/* ------------------------------
   Publishing helpers (Books)
--------------------------------*/
const asList = (v) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []);

const pickProductImage = (p) =>
  p?.thumbnail_url ||
  p?.display_image ||
  p?.image_url ||
  p?.image ||
  "/placeholder.png";

/**
 * Offers have tier/access_tier/required_tier in metadata.
 * Books do NOT.
 */
const isStudioOfferProduct = (p) => {
  const m = p?.metadata || {};
  const tier = m?.tier ?? m?.access_tier ?? m?.required_tier;
  return tier !== undefined && tier !== null && String(tier).trim() !== "";
};

const isBookProduct = (p) => !isStudioOfferProduct(p);

function matchesUniverseForProduct(product, universe) {
  if (!product || !universe) return false;
  const m = product.metadata || {};
  const uid = safeStr(m.universe_id);
  if (uid && safeStr(universe.id) && uid === safeStr(universe.id)) return true;

  const title = safeStr(universe.title).toLowerCase();
  const slug = safeStr(universe.slug).toLowerCase();

  const fields = [
    safeStr(m.universe).toLowerCase(),
    safeStr(m.book).toLowerCase(),
    safeStr(m.series).toLowerCase(),
    safeStr(m.ip).toLowerCase(),
    safeStr(m.franchise).toLowerCase(),
  ].filter(Boolean);

  if (!fields.length) return false;

  // exact hits
  if (title && fields.includes(title)) return true;
  if (slug && fields.includes(slug)) return true;

  // soft contains
  const hay = fields.join(" ");
  if (title && hay.includes(title)) return true;
  if (slug && hay.includes(slug)) return true;

  return false;
}
/* ------------------------------
   Small helpers (safe string/json)
--------------------------------*/
const asStr = (v) => (v === null || v === undefined ? "" : String(v));
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
function safeMeta(meta) {
  if (!meta) return {};
  if (typeof meta === "object") return meta;
  if (typeof meta === "string") {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}
/* ------------------------------
   URL + platform helpers
--------------------------------*/
function isDirectAudio(url) {
  const u = (url || "").toLowerCase().split("?")[0];
  return u.endsWith(".mp3") || u.endsWith(".wav") || u.endsWith(".m4a") || u.endsWith(".ogg");
}
function inferPlatform(url) {
  if (!url) return "";
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("spotify.com")) return "Spotify";
  if (u.includes("soundcloud.com")) return "SoundCloud";
  if (u.includes("vimeo.com")) return "Vimeo";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("apple.com") || u.includes("music.apple.com")) return "Apple Music";
  if (u.includes("suno")) return "Suno";
  return "";
}
function isYoutube(url = "") {
  const u = String(url || "");
  return u.includes("youtube.com") || u.includes("youtu.be");
}
function getYoutubeId(url = "") {
  const u = String(url || "");
  const youtuBe = u.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
  if (youtuBe?.[1]) return youtuBe[1];
  const watch = u.match(/[?&]v=([a-zA-Z0-9_-]+)/);
  if (watch?.[1]) return watch[1];
  const embed = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/);
  if (embed?.[1]) return embed[1];
  return null;
}
function YoutubeEmbed({ url, title = "Video" }) {
  const id = getYoutubeId(url);
  if (!id) return null;
  return (
    <div className="rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm bg-black">
      <iframe
        className="w-full h-[420px]"
        src={`https://www.youtube.com/embed/${id}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
function SpotifyEmbed({ url, title = "Spotify" }) {
  if (!url || !String(url).includes("spotify.com")) return null;
  const embedUrl = String(url).replace("open.spotify.com/", "open.spotify.com/embed/");
  return (
    <div className="rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30">
      <iframe
        src={embedUrl}
        width="100%"
        height="352"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        title={title}
      />
    </div>
  );
}
function chip(text) {
  return (
    <span className="text-[11px] px-3 py-1 rounded-full bg-white/80 text-gray-800 border border-gray-200/70 dark:bg-gray-900/60 dark:text-gray-100 dark:border-gray-700">
      {text}
    </span>
  );
}
/* ------------------------------
   Media type helpers
--------------------------------*/
function normalizeType(t) {
  const v = (t || "").toLowerCase().trim();
  if (v === "music" || v === "track") return "soundtrack";
  if (v === "chapter preview" || v === "chapter") return "chapter_read";
  if (v === "opening_theme") return "soundtrack";
  if (v === "ending_theme") return "soundtrack";
  if (v === "character_theme") return "soundtrack";
  if (v === "battle_theme") return "score";
  return v || "other";
}
function prettyType(t) {
  const v = normalizeType(t);
  const map = {
    soundtrack: "Soundtracks",
    score: "Score",
    trailer: "Trailers",
    audiobook: "Audiobooks",
    chapter_read: "Chapter Reads",
    scene: "Scenes",
    playlist: "Playlists",
    musicvideo: "Music Videos",
    reel: "Reels",
    podcast: "Podcasts",
    interview: "Interviews",
    event: "Events",
    other: "Media",
  };
  return map[v] || "Media";
}
function primaryCta(item) {
  const t = normalizeType(item.media_type);
  if (t === "soundtrack" || t === "score" || t === "chapter_read" || t === "audiobook") return "Play";
  if (t === "trailer" || t === "musicvideo" || t === "reel") return "Watch";
  if (t === "playlist") return "Open Playlist";
  return "View";
}
function pickCardImage(post, meta) {
  return (
    meta?.thumbnail_url ||
    post?.thumbnail_url ||
    post?.featured_image ||
    meta?.cover_url ||
    meta?.image_url ||
    "/placeholder.png"
  );
}
function bestUrl(meta, post) {
  const audio = asStr(meta?.audio_url).trim();
  const media = asStr(meta?.media_url).trim();
  const audio2 = asStr(post?.audio_url).trim();
  const media2 = asStr(post?.media_url).trim();
  return {
    audio_url: audio || audio2 || "",
    media_url: media || media2 || "",
  };
}
function pickIp(meta) {
  return (
    asStr(meta?.book).trim() ||
    asStr(meta?.series).trim() ||
    asStr(meta?.universe).trim() ||
    asStr(meta?.ip).trim() ||
    asStr(meta?.franchise).trim() ||
    ""
  );
}
/* ------------------------------
   Asset helpers
--------------------------------*/
function getAssetUrl(a) {
  return (
    a?.file_url ||
    a?.external_url ||
    a?.audio_url ||
    a?.video_url ||
    a?.metadata?.media_url ||
    a?.metadata?.audio_url ||
    a?.metadata?.url ||
    ""
  );
}
function getThumb(a) {
  return (
    a?.thumbnail_url ||
    a?.metadata?.thumbnail_url ||
    a?.metadata?.cover_url ||
    a?.metadata?.image_url ||
    a?.metadata?.art_url ||
    ""
  );
}
function guessFileType(url = "") {
  const u = safeStr(url).toLowerCase();
  if (!u) return "";
  const q = u.split("?")[0];
  if (q.endsWith(".mp3")) return "mp3";
  if (q.endsWith(".wav")) return "wav";
  if (q.endsWith(".m4a")) return "m4a";
  if (q.endsWith(".ogg")) return "ogg";
  if (q.endsWith(".mp4")) return "mp4";
  if (q.endsWith(".webm")) return "webm";
  if (q.endsWith(".mov")) return "mov";
  if (q.endsWith(".pdf")) return "pdf";
  if (q.endsWith(".png") || q.endsWith(".jpg") || q.endsWith(".jpeg") || q.endsWith(".webp")) return "image";
  return "";
}
function guessAttachmentKind(url = "") {
  const u = safeStr(url).toLowerCase();
  if (!u) return "link";
  if (u.includes("youtube.com") || u.includes("youtu.be") || u.includes("vimeo.com")) return "video";
  if (u.includes("spotify.com") || u.includes("soundcloud.com") || isDirectAudio(u)) return "audio";
  const ft = guessFileType(u);
  if (ft === "image") return "image";
  if (ft === "pdf") return "document";
  if (["mp4", "webm", "mov"].includes(ft)) return "video";
  if (["mp3", "wav", "m4a", "ogg"].includes(ft)) return "audio";
  return "link";
}
/* ------------------------------
   Attachments (studio pages)
--------------------------------*/
function normalizeTags(input) {
  if (Array.isArray(input)) return input.map((t) => safeStr(t)).filter(Boolean);
  const s = safeStr(input);
  if (!s) return [];
  return s
    .split(",")
    .map((x) => safeStr(x))
    .filter(Boolean);
}
function normalizeAttachment(a) {
  const base = a && typeof a === "object" ? a : {};
  const url = safeStr(base.url || base.file_url || base.external_url);
  const thumb = safeStr(base.thumbnail_url || base.thumb_url || base.cover_url || base.image_url);
  const kind = safeStr(base.kind) || guessAttachmentKind(url || thumb);
  const media_type = safeStr(base.media_type) || "other";
  const title = safeStr(base.title);
  const notes = safeStr(base.notes);
  const duration = safeStr(base.duration);
  const bpm = base.bpm === null || base.bpm === undefined || base.bpm === "" ? null : Number(base.bpm);
  const license_tier = safeStr(base.license_tier);
  const tags = normalizeTags(base.tags || []);
  return {
    id: safeStr(base.id) || `att_${Math.random().toString(16).slice(2)}_${Date.now()}`,
    kind,
    media_type,
    title,
    url,
    thumbnail_url: thumb,
    tags,
    duration,
    bpm: Number.isFinite(bpm) ? bpm : null,
    license_tier,
    notes,
  };
}
function getPageAttachments(page) {
  const md = safeJson(page?.metadata, {});
  const arr = Array.isArray(md?.attachments) ? md.attachments : [];
  return arr.map(normalizeAttachment).filter((x) => x && (x.url || x.thumbnail_url));
}
function niceAttachmentTypeLabel(media_type = "") {
  const t = safeStr(media_type).toLowerCase();
  const m = {
    poster: "Poster / Key Art",
    lookbook: "Lookbook",
    trailer: "Trailer",
    theme: "Theme",
    cue: "Cue",
    stinger: "Stinger",
    packet: "Packet",
    other: "Attachment",
  };
  return m[t] || "Attachment";
}
function renderPlainMarkdown(md = "") {
  const text = String(md || "");
  const lines = text.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const m = line.match(/^(#{1,3})\s+(.*)$/);
        if (m) {
          const level = m[1].length;
          const title = m[2];
          const cls =
            level === 1
              ? "text-2xl font-bold mt-6"
              : level === 2
              ? "text-xl font-bold mt-5"
              : "text-lg font-semibold mt-4";
          return (
            <div key={i} className={cls}>
              {title}
            </div>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed opacity-90">
            {line}
          </p>
        );
      })}
    </div>
  );
}
/* ------------------------------
   UI cards
--------------------------------*/
function HeaderCard({ kicker, title, subtitle, rightChips = [], align = "left", className = "", children }) {
  const center = align === "center";
  return (
    <div
      className={[
        "rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm p-6 md:p-8",
        className,
      ].join(" ")}
    >
      <div className={`flex flex-wrap gap-3 items-start ${center ? "justify-center text-center" : "justify-between"}`}>
        <div className={center ? "w-full" : ""}>
          {kicker ? <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">{kicker}</div> : null}
          {title ? <div className="text-xl md:text-2xl font-bold mt-1">{title}</div> : null}
          {subtitle ? <div className="text-sm opacity-80 mt-2">{subtitle}</div> : null}
        </div>
        {rightChips?.length ? (
          <div className={`flex flex-wrap gap-2 ${center ? "justify-center w-full" : "justify-end"}`}>
            {rightChips.map((c) => (
              <span key={c}>{chip(c)}</span>
            ))}
          </div>
        ) : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
function AudioCard({ a }) {
  const url = a?.audio_url || a?.media_url || getAssetUrl(a);
  const thumb = a?.card_img || getThumb(a);
  const title = a?.title || "Audio";
  const desc = a?.excerpt || a?.description || "";
  const kind = safeStr(a?.media_type || a?.metadata?.media_type || a?.metadata?.audio_kind || a?.asset_type || "audio");
  const fileType = guessFileType(url);
  const isSpotify = url.includes("spotify.com");
  const isYT = isYoutube(url);
  return (
    <div className="rounded-3xl overflow-hidden border border-gray-200/80 dark:border-gray-800 bg-white/85 dark:bg-gray-900/60 shadow-sm">
      {thumb ? (
        <img src={thumb} alt={title} className="w-full h-48 object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-48 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800" />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">
              {prettyType(kind)}
              {fileType ? ` • ${fileType.toUpperCase()}` : ""}
              {a?.platform ? ` • ${a.platform}` : ""}
            </div>
            <div className="text-lg font-semibold mt-1">{title}</div>
            {desc ? <div className="text-sm opacity-80 mt-2 whitespace-pre-wrap">{desc}</div> : null}
          </div>
          <div className="flex flex-col gap-2 items-end">
            {a?.duration ? chip(`${a.duration}`) : null}
            {a?.mood ? chip(`${a.mood}`) : null}
          </div>
        </div>
        <div className="mt-4">
          {isSpotify ? (
            <SpotifyEmbed url={url} title={title} />
          ) : isYT ? (
            <YoutubeEmbed url={url} title={title} />
          ) : url ? (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 p-4">
              <audio controls preload="none" className="w-full">
                <source src={url} />
              </audio>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-sm font-semibold"
                >
                  Open {primaryCta({ media_type: kind })} →
                </a>
                {a?.download_url ? (
                  <a
                    href={a.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40 text-sm"
                  >
                    Download →
                  </a>
                ) : null}
                {a?.license_url ? (
                  <a
                    href={a.license_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 text-sm"
                  >
                    Rights / License →
                  </a>
                ) : null}
                {a?.slug ? (
                  <Link
                    href={`/media/${a.slug}`}
                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40 text-sm"
                  >
                    Details →
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-sm opacity-70">No audio URL found on this item.</div>
          )}
        </div>
        {Array.isArray(a?.tags) && a.tags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {a.tags.slice(0, 8).map((t) => (
              <span
                key={t}
                className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                {String(t)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
function AttachmentCard({ att }) {
  const url = safeStr(att?.url);
  const thumb = safeStr(att?.thumbnail_url);
  const title = safeStr(att?.title) || "Attachment";
  const kind = safeStr(att?.kind || "link");
  const mediaTypeLabel = niceAttachmentTypeLabel(att?.media_type);
  const platform = inferPlatform(url);
  const ft = guessFileType(url);
  const isSpotify = url.includes("spotify.com");
  const isYT = isYoutube(url);
  const isPdf = ft === "pdf";
  const isImage = kind === "image" || ft === "image";
  const isVideo = kind === "video" || ["mp4", "webm", "mov"].includes(ft) || isYT;
  const isAudio = kind === "audio" || ["mp3", "wav", "m4a", "ogg"].includes(ft) || isSpotify || url.includes("soundcloud.com");
  return (
    <div className="rounded-3xl overflow-hidden border border-gray-200/80 dark:border-gray-800 bg-white/85 dark:bg-gray-900/60 shadow-sm">
      {isImage && (thumb || url) ? (
        <img src={thumb || url} alt={title} className="w-full h-52 object-cover" loading="lazy" />
      ) : thumb ? (
        <img src={thumb} alt={title} className="w-full h-52 object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-52 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800" />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">
              {mediaTypeLabel}
              {kind ? ` • ${kind}` : ""}
              {platform ? ` • ${platform}` : ""}
              {ft && ft !== "image" ? ` • ${ft.toUpperCase()}` : ""}
            </div>
            <div className="text-lg font-semibold mt-1 truncate">{title}</div>
            {(att?.duration || att?.bpm || att?.license_tier) ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {att?.duration ? chip(String(att.duration)) : null}
                {att?.bpm ? chip(`${att.bpm} BPM`) : null}
                {att?.license_tier ? chip(String(att.license_tier)) : null}
              </div>
            ) : null}
            {att?.notes ? <div className="text-sm opacity-80 mt-3 whitespace-pre-wrap">{att.notes}</div> : null}
          </div>
        </div>
        <div className="mt-4">
          {isSpotify ? (
            <SpotifyEmbed url={url} title={title} />
          ) : isYT ? (
            <YoutubeEmbed url={url} title={title} />
          ) : isAudio && url ? (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 p-4">
              <audio controls preload="none" className="w-full">
                <source src={url} />
              </audio>
            </div>
          ) : isVideo && url ? (
            <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-black">
              <video src={url} controls playsInline className="w-full h-[360px] object-cover bg-black" />
            </div>
          ) : isPdf && url ? (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 p-4">
              <div className="text-sm opacity-80">PDF ready. Open inline (new tab) or download from the source.</div>
            </div>
          ) : null}
        </div>
        {Array.isArray(att?.tags) && att.tags.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {att.tags.slice(0, 8).map((t) => (
              <span
                key={t}
                className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                {String(t)}
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-sm font-semibold"
            >
              Open →
            </a>
          ) : null}
          {thumb ? (
            <a
              href={thumb}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40 text-sm"
            >
              Thumb →
            </a>
          ) : null}
          {isPdf && url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 text-sm font-semibold"
            >
              Open PDF →
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
function PageAttachmentsRail({ page }) {
  const attachments = useMemo(() => getPageAttachments(page), [page]);
  if (!attachments.length) return null;
  const counts = attachments.reduce(
    (acc, a) => {
      const k = safeStr(a.kind || "link");
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    },
    { image: 0, video: 0, audio: 0, document: 0, link: 0 }
  );
  return (
    <div className="mt-8">
      <HeaderCard
        kicker="Attachments"
        title="Media Rail"
        subtitle="Optional assets attached to this page."
        rightChips={[
          `${attachments.length} total`,
          counts.image ? `i${counts.image}` : null,
          counts.video ? `v${counts.video}` : null,
          counts.audio ? `a${counts.audio}` : null,
          counts.document ? `d${counts.document}` : null,
        ].filter(Boolean)}
        align="left"
        className="mb-5"
      />
      {attachments.length === 1 ? (
        <div className="flex justify-center">
          <div className="w-full max-w-3xl">
            <AttachmentCard att={attachments[0]} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {attachments.map((att) => (
            <AttachmentCard key={att.id} att={att} />
          ))}
        </div>
      )}
    </div>
  );
}
/* ------------------------------
   ACCESS / TIERS (FIXED)
   ✅ This is what caused: ReferenceError: tierLabel is not defined
--------------------------------*/
const ACCESS_TIERS = ["public", "priority", "producer", "packaging"];
function normalizeTier(t) {
  const v = safeStr(t).toLowerCase();
  if (ACCESS_TIERS.includes(v)) return v;
  return "public";
}
const TIER_RANK = { public: 0, priority: 1, producer: 2, packaging: 3 };
function canViewTier(viewerTier, pageTier) {
  const vt = TIER_RANK[normalizeTier(viewerTier)] ?? 0;
  const pt = TIER_RANK[normalizeTier(pageTier)] ?? 0;
  return vt >= pt;
}
function tierLabel(t) {
  const v = normalizeTier(t);
  const map = {
    public: "Public",
    priority: "Priority",
    producer: "Producer",
    packaging: "Packaging",
  };
  return map[v] || "Public";
}
/* ------------------------------
   Page tier logic
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
  const explicit = normalizeTier(md?.access_tier);
  if (md?.access_tier) return explicit;
  if (getPageVisibility(p) === "vault") return "packaging";
  const t = safeStr(p?.page_type);
  return normalizeTier(PAGE_TYPE_DEFAULT_TIER[t] || "public");
}
function tierBadge(t) {
  const v = normalizeTier(t);
  const map = {
    public:
      "text-[10px] px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100 dark:border-emerald-900/40",
    priority:
      "text-[10px] px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 dark:border-amber-900/40",
    producer:
      "text-[10px] px-2 py-0.5 rounded-full border border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/20 dark:text-sky-100 dark:border-sky-900/40",
    packaging:
      "text-[10px] px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 text-slate-800 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700",
  };
  return map[v] || map.public;
}
function niceTypeLabel(t = "") {
  const m = {
    pitch_1p: "Pitch (1 Page)",
    synopsis_1page: "Synopsis (1 Page)",
    comparable_titles: "Comparable Titles",
    format_rating_audience: "Format / Rating / Audience",
    season1_outline: "Season 1 Outline",
    episode_list: "Episode List",
    pilot_outline: "Pilot Outline",
    pilot_script_or_treatment: "Pilot Script / Treatment",
    world_rules_factions: "World Rules + Factions",
    cast_profiles_arcs: "Cast Profiles + Arcs",
    lookbook_pdf: "Lookbook",
    poster_key_art: "Poster / Key Art",
    trailer_storyboard: "Trailer Storyboard",
    teaser_trailer: "Teaser Trailer",
    signature_scene_clip: "Signature Scene Clip",
    themes_main_hero_villain: "Themes (Main / Hero / Villain)",
    trailer_cue_stingers: "Trailer Cues + Stingers",
    chain_of_title_rights_matrix: "Chain of Title + Rights Matrix",
    option_term_sheet_producer_packet: "Option Term Sheet + Producer Packet",
  };
  return m[t] || String(t).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
/* ------------------------------
   Access gating UI
--------------------------------*/
function AccessGateCard({ viewerTier, requiredTier, title, subtitle, universe, onCheckout, children }) {
  const allowed = canViewTier(viewerTier, requiredTier);
  if (allowed) return children || null;
  return (
    <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/75 dark:bg-gray-900/55 shadow-sm p-6 md:p-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Access required</div>
          <div className="text-2xl font-bold mt-2">{title}</div>
          <div className="text-sm opacity-80 mt-2">{subtitle}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={tierBadge(requiredTier)}>{tierLabel(requiredTier)}</span>
            <span className={tierBadge(viewerTier)}>Viewing: {tierLabel(viewerTier)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-[240px]">
          <button
            onClick={() => (typeof onCheckout === "function" ? onCheckout(requiredTier) : null)}
            className="px-5 py-3 rounded-2xl bg-black text-white dark:bg-white dark:text-black font-semibold text-center"
          >
            Unlock {tierLabel(requiredTier)} →
          </button>
        </div>
      </div>
    </div>
  );
}
function PackagesBar({ universe, viewerTier, showVault, onCheckout }) {
  const tiers = [
    {
      key: "priority",
      title: "Priority Window",
      price: "$2,500",
      duration: "45 days",
      bullets: ["Serious evaluation", "Beats + season map", "Full trailer + themes"],
    },
    {
      key: "producer",
      title: "Producer Packet",
      price: "$10,000",
      duration: "90 days",
      bullets: ["Bible + world rules", "Lookbook + deck copy", "Shareable packet PDFs"],
    },
    {
      key: "packaging",
      title: "Packaging Track",
      price: "$35,000",
      duration: "12 months",
      bullets: ["Deal room access", "Rights matrix", "Option docs"],
    },
  ];
  return (
    <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Packages</div>
          <div className="text-2xl font-bold mt-2">Choose access level</div>
          <div className="text-sm opacity-80 mt-2">Organize your studio pages into sellable tiers.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={tierBadge(viewerTier)}>Viewing: {tierLabel(viewerTier)}</span>
            {showVault ? chip("Vault: ON") : chip("Vault: OFF")}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Link
            href={universe?.slug ? `/studios/${universe.slug}?tier=public${showVault ? "&vault=1" : ""}` : "#"}
            className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40 text-sm font-semibold"
          >
            Public
          </Link>
          <Link
            href={universe?.slug ? `/studios/${universe.slug}?tier=priority${showVault ? "&vault=1" : ""}` : "#"}
            className="px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 text-sm font-semibold"
          >
            Priority
          </Link>
          <Link
            href={universe?.slug ? `/studios/${universe.slug}?tier=producer${showVault ? "&vault=1" : ""}` : "#"}
            className="px-4 py-2 rounded-xl border border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/20 dark:text-sky-100 text-sm font-semibold"
          >
            Producer
          </Link>
          <Link
            href={universe?.slug ? `/studios/${universe.slug}?tier=packaging${showVault ? "&vault=1" : ""}` : "#"}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 dark:bg-gray-900 dark:text-gray-100 text-sm font-semibold"
          >
            Packaging
          </Link>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map((t) => {
          const active = normalizeTier(viewerTier) === t.key;
          return (
            <div
              key={t.key}
              className={[
                "rounded-3xl border shadow-sm p-5",
                active
                  ? "border-amber-400/70 bg-amber-50/70 dark:bg-amber-950/10"
                  : "border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/20",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">{t.duration}</div>
                  <div className="text-lg font-bold mt-1">{t.title}</div>
                </div>
                <div className="text-sm font-semibold">{t.price}</div>
              </div>
              <ul className="mt-3 space-y-2 text-sm opacity-90">
                {t.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-[2px]">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => (typeof onCheckout === "function" ? onCheckout(t.key) : null)}
                  className="flex-1 px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-sm font-semibold text-center"
                >
                  Unlock →
                </button>
                <Link
                  href={universe?.slug ? `/studios/${universe.slug}?tier=${t.key}${showVault ? "&vault=1" : ""}#package` : "#"}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40 text-sm font-semibold"
                >
                  Preview
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
/* ------------------------------
   Package grouping
--------------------------------*/
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
const EXEC_GROUPS = [
  {
    key: "executive",
    title: "Executive Read",
    kicker: "Studio Package",
    lead: "Fast producer scan — positioning, format, comps, and the clean pitch.",
    chips: ["Fast scan", "Optionable structure", "Shareable sections"],
    types: new Set(["logline", "pitch_1p", "synopsis_1page", "comparable_titles", "format_rating_audience", "one_sheet"]),
  },
  {
    key: "story",
    title: "Story Proof",
    kicker: "Story",
    lead: "Season structure, beats, pilot direction — enough to greenlight a conversation.",
    chips: ["Beats + arcs", "Pilot-ready", "Season map"],
    types: new Set(["beat_sheet", "season1_outline", "episode_list", "pilot_outline", "pilot_script_or_treatment", "series_bible"]),
  },
  {
    key: "world",
    title: "World & Cast",
    kicker: "Lore",
    lead: "Rules, factions, timeline, glossary, and cast arcs — continuity that scales.",
    chips: ["Rules", "Factions", "Continuity"],
    types: new Set(["world_rules_factions", "timeline", "glossary", "cast_profiles_arcs"]),
  },
  {
    key: "visual",
    title: "Visual & Marketing",
    kicker: "Look",
    lead: "Lookbook, poster, trailer storyboard, teasers, signature scene assets.",
    chips: ["Lookbook", "Poster", "Trailer kit"],
    types: new Set(["lookbook_pdf", "poster_key_art", "trailer_storyboard", "teaser_trailer", "signature_scene_clip"]),
  },
  {
    key: "audio",
    title: "Themes & Trailer Sound",
    kicker: "Sound",
    lead: "Motifs and cues that lock tone immediately.",
    chips: ["Motif-driven", "Trailer-ready", "Tone lock"],
    types: new Set(["themes_main_hero_villain", "trailer_cue_stingers"]),
  },
  {
    key: "vault",
    title: "Deal Room",
    kicker: "Vault",
    lead: "Rights + deal docs. Hidden by default — use ?vault=1.",
    chips: ["Rights", "Deal docs", "Partner-ready"],
    types: new Set(["chain_of_title_rights_matrix", "option_term_sheet_producer_packet", "negotiation", "press_kit", "roadmap", "prompts", "deck_copy"]),
  },
];
function packageProgress(pages = []) {
  const present = new Set(pages.map((p) => safeStr(p.page_type)).filter(Boolean));
  const have = REQUIRED_25_PAGE_TYPES.filter((t) => present.has(t));
  return { count: have.length, total: REQUIRED_25_PAGE_TYPES.length };
}
function groupStudioPages(pages = [], showVault = false, viewerTier = "public") {
  const visible = pages.filter((p) => {
    const vis = getPageVisibility(p);
    if (vis === "vault" && !showVault) return false;
    const pageTier = getPageAccessTier(p);
    if (!canViewTier(viewerTier, pageTier)) return false;
    return true;
  });
  const buckets = EXEC_GROUPS.map((g) => ({ ...g, pages: [] }));
  const used = new Set();
  visible.forEach((p) => {
    const t = safeStr(p.page_type);
    const g = buckets.find((x) => x.types.has(t));
    if (g) {
      g.pages.push(p);
      used.add(p.id);
    }
  });
  const appendix = visible.filter((p) => !used.has(p.id));
  if (appendix.length) {
    buckets.splice(1, 0, {
      key: "appendix",
      title: "Appendix",
      kicker: "Extras",
      lead: "Additional published materials (notes, extras, variants).",
      chips: ["Extra pages", "Deep dives", "Variants"],
      types: new Set(),
      pages: appendix,
    });
  }
  buckets.forEach((b) => {
    b.pages.sort((a, c) => {
      const ao = Number(a.sort_order ?? 9999);
      const co = Number(c.sort_order ?? 9999);
      if (ao !== co) return ao - co;
      const ad = new Date(a.updated_at || 0).getTime();
      const cd = new Date(c.updated_at || 0).getTime();
      return cd - ad;
    });
  });
  return buckets.filter((b) => b.pages.length > 0);
}
function LockedSectionsPreview({ universe, pages = [], viewerTier = "public", showVault = false }) {
  const locked = useMemo(() => {
    const lockedByTier = [];
    const lockedByVault = [];
    (pages || []).forEach((p) => {
      const status = safeStr(p?.status).toLowerCase();
      if (status && status !== "published") return;
      const vis = getPageVisibility(p);
      const requiredTier = getPageAccessTier(p);
      if (vis === "vault" && !showVault) {
        lockedByVault.push({ p, requiredTier, vis });
        return;
      }
      if (!canViewTier(viewerTier, requiredTier)) {
        lockedByTier.push({ p, requiredTier, vis });
        return;
      }
    });
    const sortFn = (a, b) => {
      const ar = TIER_RANK[normalizeTier(a.requiredTier)] ?? 0;
      const br = TIER_RANK[normalizeTier(b.requiredTier)] ?? 0;
      if (br !== ar) return br - ar;
      const ao = Number(a.p?.sort_order ?? 9999);
      const bo = Number(b.p?.sort_order ?? 9999);
      if (ao !== bo) return ao - bo;
      const ad = new Date(a.p?.updated_at || 0).getTime();
      const bd = new Date(b.p?.updated_at || 0).getTime();
      return bd - ad;
    };
    lockedByTier.sort(sortFn);
    lockedByVault.sort(sortFn);
    return { lockedByTier, lockedByVault };
  }, [pages, viewerTier, showVault]);
  const totalLocked = (locked.lockedByTier?.length || 0) + (locked.lockedByVault?.length || 0);
  if (!totalLocked) return null;
  return (
    <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm p-6 md:p-8 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Locked sections preview</div>
          <div className="text-2xl font-bold mt-2">What you unlock</div>
          <div className="text-sm opacity-80 mt-2">Titles only — content stays locked until purchase / access tier is granted.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={tierBadge(viewerTier)}>Viewing: {tierLabel(viewerTier)}</span>
            {locked.lockedByTier.length ? chip(`${locked.lockedByTier.length} tier-locked`) : null}
            {locked.lockedByVault.length ? chip(`${locked.lockedByVault.length} vault-hidden`) : null}
          </div>
        </div>
        <div className="min-w-[240px]">
          <div className="rounded-2xl bg-black text-white dark:bg-white dark:text-black p-4">
            <div className="text-sm font-semibold">Unlock access</div>
            <div className="text-xs opacity-80 mt-1">Upgrade tier above to preview locked sections.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={universe?.slug ? `/studios/${universe.slug}?tier=priority${showVault ? "&vault=1" : ""}#package` : "#"}
                className="px-3 py-2 rounded-xl bg-white/10 dark:bg-black/10 border border-white/20 dark:border-black/20 text-xs font-semibold"
              >
                Priority →
              </Link>
              <Link
                href={universe?.slug ? `/studios/${universe.slug}?tier=producer${showVault ? "&vault=1" : ""}#package` : "#"}
                className="px-3 py-2 rounded-xl bg-white/10 dark:bg-black/10 border border-white/20 dark:border-black/20 text-xs font-semibold"
              >
                Producer →
              </Link>
              <Link
                href={universe?.slug ? `/studios/${universe.slug}?tier=packaging${showVault ? "&vault=1" : ""}#package` : "#"}
                className="px-3 py-2 rounded-xl bg-white/10 dark:bg-black/10 border border-white/20 dark:border-black/20 text-xs font-semibold"
              >
                Packaging →
              </Link>
            </div>
          </div>
        </div>
      </div>
      {locked.lockedByTier.length ? (
        <div className="mt-6">
          <div className="text-sm font-semibold mb-3">Tier-locked pages</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {locked.lockedByTier.slice(0, 24).map(({ p, requiredTier, vis }) => {
              const tag = niceTypeLabel(p.page_type);
              const title = safeStr(p.title) || tag;
              return (
                <div key={p.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{title}</div>
                      <div className="text-xs opacity-70 mt-1">{tag}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={tierBadge(requiredTier)}>{tierLabel(requiredTier)}</span>
                      {vis === "vault" ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 text-slate-800 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700">
                          vault
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {locked.lockedByVault.length ? (
        <div className="mt-8">
          <div className="text-sm font-semibold mb-3">Vault-hidden pages</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {locked.lockedByVault.slice(0, 24).map(({ p, requiredTier }) => {
              const tag = niceTypeLabel(p.page_type);
              const title = safeStr(p.title) || tag;
              return (
                <div key={p.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{title}</div>
                      <div className="text-xs opacity-70 mt-1">{tag}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={tierBadge(requiredTier)}>{tierLabel(requiredTier)}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 text-slate-800 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700">
                        vault
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
/* ------------------------------
   Media normalization
--------------------------------*/
function normalizeApiList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.posts)) return json.posts;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.rows)) return json.rows;
  if (json && Array.isArray(json.items)) return json.items;
  return [];
}
function normalizeMediaPosts(raw) {
  const list = (raw || [])
    .map((p) => {
      const m = safeMeta(p.metadata);
      const media_type = normalizeType(m.media_type || "");
      const urls = bestUrl(m, p);
      const audio_url = urls.audio_url;
      const media_url = urls.media_url;
      const duration = asStr(m.duration || "").trim();
      const platform = asStr(m.platform || "").trim() || inferPlatform(media_url || audio_url);
      const ip = pickIp(m);
      const card_img = pickCardImage(p, m);
      return {
        ...p,
        metadata: m,
        card_img,
        media_type,
        media_url,
        audio_url,
        duration,
        platform,
        ip,
        scene: asStr(m.scene || "").trim(),
        mood: asStr(m.mood || "").trim(),
        download_url: asStr(m.download_url || "").trim(),
        license_url: asStr(m.license_url || "").trim(),
        tags: Array.isArray(m.tags) ? m.tags : [],
        created_at: p.created_at || m.created_at || null,
        updated_at: p.updated_at || m.updated_at || null,
      };
    })
    .filter((it) => !!asStr(it.audio_url).trim() || !!asStr(it.media_url).trim());
  list.sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));
  return list;
}
function matchesUniverseIp(item, universe) {
  if (!item || !universe) return false;
  const ip = safeStr(item.ip).toLowerCase();
  const title = safeStr(universe.title).toLowerCase();
  const slug = safeStr(universe.slug).toLowerCase();
  const m = item.metadata || {};
  const mu = safeStr(m.universe).toLowerCase();
  const mb = safeStr(m.book).toLowerCase();
  const ms = safeStr(m.series).toLowerCase();
  const mip = safeStr(m.ip).toLowerCase();
  const mf = safeStr(m.franchise).toLowerCase();
  if (ip && title && ip === title) return true;
  if (ip && slug && ip === slug) return true;
  if (mu && title && mu === title) return true;
  if (mu && slug && mu === slug) return true;
  if (mb && title && mb === title) return true;
  if (mb && slug && mb === slug) return true;
  if (ms && title && ms === title) return true;
  if (ms && slug && ms === slug) return true;
  if (mip && title && mip === title) return true;
  if (mip && slug && mip === slug) return true;
  if (mf && title && mf === title) return true;
  if (mf && slug && mf === slug) return true;
  const hay = [ip, mu, mb, ms, mip, mf].filter(Boolean).join(" ");
  if (title && hay.includes(title)) return true;
  if (slug && hay.includes(slug)) return true;
  return false;
}
function getPlaysScore(item) {
  const m = item?.metadata || {};
  const candidates = [
    item?.play_count,
    item?.plays,
    item?.view_count,
    item?.views,
    m?.play_count,
    m?.plays,
    m?.view_count,
    m?.views,
    m?.listen_count,
    m?.listens,
  ]
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  if (!candidates.length) return 0;
  return Math.max(...candidates);
}
function getRecencyTs(item) {
  const t = item?.updated_at || item?.created_at || item?.metadata?.updated_at || item?.metadata?.created_at || 0;
  const ts = new Date(t || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
}
function pickSoundtrackCandidate({ mediaPosts = [], audioItems = [] }) {
  const playlist = (mediaPosts || []).find(
    (it) => normalizeType(it.media_type) === "playlist" && safeStr(it.media_url || it.audio_url)
  );
  if (playlist) return { kind: "playlist", item: playlist };
  const candidates = (audioItems || []).filter((it) => {
    const t = normalizeType(it.media_type);
    const url = safeStr(it.media_url || it.audio_url);
    if (!url) return false;
    if (t === "trailer") return false;
    return (
      ["soundtrack", "score", "chapter_read", "audiobook", "scene"].includes(t) ||
      isDirectAudio(url) ||
      isYoutube(url) ||
      url.includes("spotify.com") ||
      url.includes("soundcloud.com")
    );
  });
  if (!candidates.length) return null;
  const sorted = candidates
    .slice()
    .sort((a, b) => {
      const ap = getPlaysScore(a);
      const bp = getPlaysScore(b);
      if (bp !== ap) return bp - ap;
      return getRecencyTs(b) - getRecencyTs(a);
    });
  return { kind: "auto", item: sorted[0] };
}
/* =========================================================
   PAGE COMPONENT
========================================================= */
export default function StudioUniverse() {
  const router = useRouter();
  const { slug } = router.query;
  const showVault = useMemo(() => String(router.query?.vault || "") === "1", [router.query?.vault]);
  const requestedTier = useMemo(() => normalizeTier(router.query?.tier), [router.query?.tier]);
  const [viewerTier, setViewerTier] = useState("public");
  const [universe, setUniverse] = useState(null);
  const [assets, setAssets] = useState([]);
  const [studioPages, setStudioPages] = useState([]);
  const [mediaPosts, setMediaPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tierProducts, setTierProducts] = useState({});
  const [bookProducts, setBookProducts] = useState([]);
  // Keep URL tier in sync as a default (entitlements can override later)
  useEffect(() => {
    setViewerTier(requestedTier || "public");
  }, [requestedTier]);
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: u, error: uErr } = await supabase.from("universes").select("*").eq("slug", slug).maybeSingle();
      if (uErr) console.error(uErr);
      if (cancelled) return;
      setUniverse(u || null);
      if (!u?.id) {
        setAssets([]);
        setStudioPages([]);
        setMediaPosts([]);
        setLoading(false);
        return;
      }
      const [{ data: a, error: aErr }, { data: pages, error: pErr }] = await Promise.all([
        supabase
          .from("universe_assets")
          .select("*")
          .eq("universe_id", u.id)
          .eq("status", "published")
          .order("sort_order", { ascending: true })
          .order("updated_at", { ascending: false }),
        supabase
          .from("studio_pages")
          .select("*")
          .eq("universe_id", u.id)
          .eq("status", "published")
          .order("sort_order", { ascending: true })
          .order("updated_at", { ascending: false }),
      ]);
      if (aErr) console.error(aErr);
      if (pErr) console.error(pErr);
      if (cancelled) return;
      setAssets(a || []);
      setStudioPages(pages || []);
      try {
        const res = await fetch("/api/posts?division=media");
        const json = await res.json();
        const raw = normalizeApiList(json);
        const normalized = normalizeMediaPosts(raw);
        const scoped = normalized.filter((it) => matchesUniverseIp(it, u));
        setMediaPosts(scoped);
      } catch (err) {
        console.error("studio media fetch error:", err);
        setMediaPosts([]);
      }
      setLoading(false);
      // entitlement lookup overrides viewerTier
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (user?.id) {
          const { data: ent } = await supabase
            .from("studio_entitlements")
            .select("tier, status, expires_at, created_at")
            .eq("user_id", user.id)
            .eq("universe_id", u.id)
            .eq("status", "active")
            .order("created_at", { ascending: false });
          let best = "public";
          (ent || []).forEach((e) => {
            const t = normalizeTier(e.tier);
            if ((TIER_RANK[t] ?? 0) > (TIER_RANK[best] ?? 0)) best = t;
          });
          setViewerTier(best);
        }
      } catch (e) {
        console.warn("entitlement lookup failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);
  useEffect(() => {
    if (!universe?.id) return;
    async function loadTierProducts() {
      const { data: products } = await supabase
        .from("products")
        .select("id, metadata")
        .eq("status", "active")
        .filter("metadata->>universe_id", "eq", universe.id)
        .filter("metadata->>kind", "eq", "digital");
      const map = {};
      (products || []).forEach((p) => {
        const meta = safeJson(p.metadata);
        const tier = normalizeTier(meta.tier);
        if (tier) map[tier] = p.id;
      });
      setTierProducts(map);
    }
    loadTierProducts();
  }, [universe?.id]);
  useEffect(() => {
    if (!universe?.id) return;
    let cancelled = false;

    (async () => {
      try {
        // Pull all publishing products from your existing API
        const res = await fetch("/api/products?division=publishing");
        const json = await res.json();

        const all = asList(json).map((p) => {
          const meta = safeJson(p.metadata, {});
          return {
            ...p,
            metadata: meta,
            display_image: pickProductImage(p),
          };
        });

        // books only (exclude studio offers)
        const books = all.filter(isBookProduct);

        // scope to this universe
        const scoped = books.filter((p) => matchesUniverseForProduct(p, universe));

        if (!cancelled) setBookProducts(scoped);
      } catch (e) {
        console.error("studio books fetch error:", e);
        if (!cancelled) setBookProducts([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [universe?.id, universe?.slug, universe?.title]);
  const heroImages = useMemo(() => {
    const thumbs = assets.map((x) => getThumb(x)).filter(Boolean).slice(0, 6);
    if (thumbs.length) return thumbs;
    if (universe?.cover_image_url) return [universe.cover_image_url];
    return ["/images/og-home.webp"];
  }, [assets, universe]);
  const trailerAsset = useMemo(() => {
    return (
      assets.find((x) => safeStr(x.asset_type).toLowerCase() === "trailer") ||
      assets.find((x) => safeStr(x?.metadata?.media_type).toLowerCase() === "trailer") ||
      assets.find((x) => safeStr(x?.media_type).toLowerCase() === "trailer") ||
      assets.find((x) => safeStr(x.asset_type).toLowerCase() === "video") ||
      null
    );
  }, [assets]);
  const trailerUrl = useMemo(() => {
    return getAssetUrl(trailerAsset) || universe?.hero_video_url || null;
  }, [trailerAsset, universe]);
  const worldMapAssets = useMemo(() => {
    return assets
      .filter(
        (a) =>
          safeStr(a.asset_type).toLowerCase() === "world_map" ||
          safeStr(a?.metadata?.kind).toLowerCase() === "world_map"
      )
      .filter((a) => getThumb(a) || a.external_url);
  }, [assets]);
  const featuredWorldMapUrl = useMemo(() => universe?.world_map_url || null, [universe]);
  const hasWorldMapSection = useMemo(() => {
    return worldMapAssets.length > 0 || Boolean(featuredWorldMapUrl);
  }, [worldMapAssets.length, featuredWorldMapUrl]);
  const visualAssetsRaw = useMemo(() => {
    return assets.filter((a) => {
      const t = safeStr(a.asset_type).toLowerCase();
      const div = safeStr(a.division).toLowerCase();
      const url = getAssetUrl(a);
      const ft = guessFileType(url);
      const kind = safeStr(a?.metadata?.kind).toLowerCase();
      const isWorldMap =
        t === "world_map" || kind === "world_map" || safeStr(a?.metadata?.media_type).toLowerCase() === "world_map";
      if (isWorldMap) return false;
      return ["image", "art", "still", "poster", "cover"].includes(t) || div === "designs" || ft === "image" || kind === "visual";
    });
  }, [assets]);
  const merchAssets = useMemo(() => {
    const isMerch = (a) => {
      const t = safeStr(a.asset_type).toLowerCase();
      const kind = safeStr(a?.metadata?.kind).toLowerCase();
      const purpose = safeStr(a?.purpose).toLowerCase();
      const tags = Array.isArray(a?.tags) ? a.tags.map((x) => safeStr(x).toLowerCase()) : [];
      const title = safeStr(a?.title).toLowerCase();
      return (
        ["merch", "mockup", "tshirt", "hoodie", "shirt", "product"].includes(t) ||
        ["merch", "mockup", "product"].includes(kind) ||
        ["merch", "mockup", "product"].includes(purpose) ||
        tags.some((x) => ["merch", "mockup", "tshirt", "hoodie", "product"].includes(x)) ||
        title.includes("merch") ||
        title.includes("mockup") ||
        title.includes("t-shirt") ||
        title.includes("tshirt") ||
        title.includes("hoodie")
      );
    };
    return visualAssetsRaw.filter(isMerch);
  }, [visualAssetsRaw]);
  const characterAssets = useMemo(() => {
    return assets.filter((a) => {
      const t = safeStr(a.asset_type).toLowerCase();
      const kind = safeStr(a?.metadata?.kind).toLowerCase();
      return t === "character" || kind === "character";
    });
  }, [assets]);
  const audioItems = useMemo(() => {
    const isAudioLike = (it) => {
      const t = normalizeType(it.media_type);
      if (["soundtrack", "score", "chapter_read", "audiobook", "scene"].includes(t)) return true;
      const url = safeStr(it.audio_url || it.media_url);
      return isDirectAudio(url) || url.includes("spotify.com") || isYoutube(url) || url.includes("soundcloud.com");
    };
    return (mediaPosts || []).filter(isAudioLike);
  }, [mediaPosts]);
  const soundtrackFromPosts = useMemo(() => {
    const pick = (mediaPosts || []).find((it) => normalizeType(it.media_type) === "playlist");
    return pick || null;
  }, [mediaPosts]);
  const soundtrackUrl = useMemo(() => {
    if (soundtrackFromPosts) return safeStr(soundtrackFromPosts.media_url || soundtrackFromPosts.audio_url);
    const fallbackAsset =
      assets.find((x) => safeStr(x.asset_type).toLowerCase() === "soundtrack") ||
      assets.find((x) => safeStr(x?.metadata?.media_type).toLowerCase() === "playlist") ||
      assets.find((x) => safeStr(x?.media_type).toLowerCase() === "playlist") ||
      assets.find((x) => safeStr(x.division).toLowerCase() === "media") ||
      null;
    return (
      fallbackAsset?.external_url ||
      fallbackAsset?.file_url ||
      fallbackAsset?.metadata?.media_url ||
      fallbackAsset?.metadata?.audio_url ||
      ""
    );
  }, [soundtrackFromPosts, assets]);
  const soundtrackCandidate = useMemo(() => {
    return pickSoundtrackCandidate({ mediaPosts, audioItems });
  }, [mediaPosts, audioItems]);
  const soundtrackResolved = useMemo(() => {
    if (safeStr(soundtrackUrl)) {
      return {
        source: "manual",
        url: safeStr(soundtrackUrl),
        item: soundtrackFromPosts || null,
        label: "Official Soundtrack",
      };
    }
    if (soundtrackCandidate?.item) {
      const it = soundtrackCandidate.item;
      const url = safeStr(it.media_url || it.audio_url);
      if (!url) return null;
      const plays = getPlaysScore(it);
      const kindLabel =
        soundtrackCandidate.kind === "playlist" ? "Official Playlist" : plays > 0 ? "Top Track" : "Most Recent Track";
      return { source: "auto", url, item: it, label: kindLabel };
    }
    return null;
  }, [soundtrackUrl, soundtrackFromPosts, soundtrackCandidate]);
  const producerPacket = useMemo(() => {
    return (
      assets.find(
        (x) => safeStr(x.division).toLowerCase() === "studios" && x.is_public === false && Number(x.price_cents || 0) > 0
      ) || null
    );
  }, [assets]);
  const nftAssets = useMemo(() => {
    return assets.filter((a) => safeStr(a.asset_type).toLowerCase() === "nft" || a?.metadata?.nft_url);
  }, [assets]);
  const producerEmailHref = useMemo(() => {
    if (!universe?.title || !universe?.slug) return "mailto:studios@manyagi.net";
    const subject = `Option / Licensing Inquiry — ${universe.title}`;
    const body =
      `Universe: ${universe.title}\n` +
      `Link: https://manyagi.net/studios/${universe.slug}\n\n` +
      `Company:\nRole:\nBudget Range:\nTimeline:\nWhat are you looking to option?\nNotes:\n`;
    return `mailto:studios@manyagi.net?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [universe]);
  const quickSignals = useMemo(() => {
    const signals = [];
    if (trailerUrl) signals.push("Trailer Ready");
    if (audioItems.length) signals.push(`${audioItems.length} Audio Cues`);
    if (merchAssets.length) signals.push(`${merchAssets.length} Merch Mockups`);
    if (characterAssets.length) signals.push(`${characterAssets.length} Characters`);
    if (hasWorldMapSection) signals.push("World Map");
    if (producerPacket) signals.push("Producer Packet (Gated)");
    if (nftAssets.length) signals.push("Collectibles");
    if (studioPages.length) signals.push(`${studioPages.length} Studio Pages`);
    if (showVault) signals.push("Vault View");
    signals.push(`Tier: ${tierLabel(viewerTier)}`);
    return signals;
  }, [
    trailerUrl,
    audioItems.length,
    merchAssets.length,
    characterAssets.length,
    hasWorldMapSection,
    producerPacket,
    nftAssets.length,
    studioPages.length,
    showVault,
    viewerTier,
  ]);
  const canonicalUrl = useMemo(() => {
    if (!universe?.slug) return "";
    return `https://manyagi.net/studios/${universe.slug}`;
  }, [universe]);
  const jsonLd = useMemo(() => {
    if (!universe?.title) return null;
    return {
      "@context": "https://schema.org",
      "@type": "CreativeWorkSeries",
      name: universe.title,
      description: universe.logline || universe.tagline || "A Manyagi Studios Universe.",
      url: canonicalUrl || undefined,
      creator: { "@type": "Person", name: "Dennis Manyagi" },
      publisher: { "@type": "Organization", name: "Manyagi Studios" },
    };
  }, [universe, canonicalUrl]);
  const groupedPages = useMemo(() => groupStudioPages(studioPages, showVault, viewerTier), [studioPages, showVault, viewerTier]);
  const packageBar = useMemo(() => packageProgress(studioPages), [studioPages]);
  const studioToc = useMemo(() => {
    const toc = [];
    groupedPages.forEach((g) => {
      toc.push({ id: `pkg-${g.key}`, label: g.title, kind: "group" });
      g.pages.forEach((p) => {
        const pageTier = getPageAccessTier(p);
        toc.push({
          id: `p-${p.id}`,
          label: p.title || niceTypeLabel(p.page_type),
          kind: "page",
          tag: niceTypeLabel(p.page_type),
          vault: getPageVisibility(p) === "vault",
          tier: pageTier,
        });
      });
    });
    return toc;
  }, [groupedPages]);
  async function startStudioCheckout(tier) {
    try {
      const { data: auth } = await supabase.auth.getSession();
      const token = auth?.session?.access_token;
      if (!token) {
        router.push(`/login?next=${encodeURIComponent(router.asPath)}`);
        return;
      }
      const product_id = tierProducts[normalizeTier(tier)];
      if (!product_id) throw new Error(`No active product found for ${tier} in this universe.`);
      const res = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ product_id, quantity: 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Checkout failed");
      if (json?.url) window.location.href = json.url;
    } catch (e) {
      alert(e.message || "Checkout failed");
    }
  }
  if (loading) {
    return (
      <section className="container mx-auto px-4 py-16">
        <div className="opacity-70">Loading universe…</div>
      </section>
    );
  }
  if (!universe) {
    return (
      <section className="container mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold">Universe not found</h1>
        <Link href="/studios" className="underline mt-4 inline-block">
          Back to Studios
        </Link>
      </section>
    );
  }
  const navItems = [
    { href: "#one-sheet", label: "One-Sheet" },
    ...(trailerUrl ? [{ href: "#trailer", label: "Trailer" }] : []),
    ...(audioItems.length || soundtrackResolved ? [{ href: "#audio", label: "Sound" }] : []),
    ...(characterAssets.length ? [{ href: "#characters", label: "Characters" }] : []),
    ...(hasWorldMapSection ? [{ href: "#world-map", label: "World Map" }] : []),

    ...(bookProducts.length ? [{ href: "#books", label: "Books" }] : []),

    { href: "#visuals", label: "Merch" },
    { href: "#vault", label: "Adaptation Assets" },
    ...(groupedPages.length ? [{ href: "#package", label: "Producer Materials" }] : []),
    { href: "#contact", label: "Options" },
  ];
  const resolvedSoundtrackUrl = soundtrackResolved?.url || "";
  const isSoundtrackSpotify = resolvedSoundtrackUrl.includes("spotify.com");
  const isSoundtrackYT = isYoutube(resolvedSoundtrackUrl);
  const isSoundtrackAudioFile = ["mp3", "wav", "m4a", "ogg"].includes(guessFileType(resolvedSoundtrackUrl));
  return (
    <>
      <Head>
        <title>{universe.title} — Manyagi Studios</title>
        <meta name="description" content={universe.logline || universe.tagline || "A Manyagi Studios Universe."} />
        {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${universe.title} — Manyagi Studios`} />
        <meta property="og:description" content={universe.logline || universe.tagline || "A Manyagi Studios Universe."} />
        {canonicalUrl ? <meta property="og:url" content={canonicalUrl} /> : null}
        {heroImages?.[0] ? <meta property="og:image" content={heroImages[0]} /> : null}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${universe.title} — Manyagi Studios`} />
        <meta name="twitter:description" content={universe.logline || universe.tagline || "A Manyagi Studios Universe."} />
        {heroImages?.[0] ? <meta name="twitter:image" content={heroImages[0]} /> : null}
        {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
      </Head>
      <Hero
        kicker="Manyagi Studios"
        title={universe.title}
        lead={universe.logline || universe.tagline || "Prestige IP engineered for adaptation."}
        carouselImages={heroImages}
        height="h-[720px]"
      >
        <div className="flex flex-wrap gap-3 justify-center">
          {trailerUrl ? (
            <a href="#trailer" className="btn bg-black text-white py-2 px-4 rounded hover:scale-105 transition dark:bg-white dark:text-black">
              ▶ Watch Trailer
            </a>
          ) : null}
          {audioItems.length || soundtrackResolved ? (
            <a
              href="#audio"
              className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
            >
              🎧 Listen
            </a>
          ) : null}
          {groupedPages.length ? (
            <a
              href="#package"
              className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
            >
              📦 Producer Materials
            </a>
          ) : null}
          <a
            href="#vault"
            className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
          >
            View Adaptation Assets
          </a>
          <a href={producerEmailHref} className="btn bg-amber-200 text-amber-950 py-2 px-4 rounded hover:bg-amber-300 transition">
            💼 Options / Licensing
          </a>
          <Link
            href={showVault ? `/studios/${universe.slug}?tier=${viewerTier}` : `/studios/${universe.slug}?vault=1&tier=${viewerTier}`}
            className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {showVault ? "🔒 Hide Vault" : "🔓 Vault View"}
          </Link>
        </div>
      </Hero>
      <section className="container mx-auto px-4 -mt-8 mb-10">
        <div className="flex gap-2 overflow-x-auto no-scrollbar justify-center text-xs md:text-[13px]">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap px-3 py-2 rounded-full border border-gray-200/80 bg-white/80 text-gray-800 hover:bg-gray-100 hover:border-amber-400 transition dark:bg-gray-900/80 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              {item.label}
            </a>
          ))}
        </div>
      </section>
      <section className="container mx-auto px-4 pb-10 -mt-2">
        <PackagesBar universe={universe} viewerTier={viewerTier} showVault={showVault} onCheckout={startStudioCheckout} />
      </section>
      <SectionIntro
        id="one-sheet"
        kicker="Studio One-Sheet"
        title="Logline • Synopsis • Adaptation Angle"
        lead="A fast executive read — built for the first five minutes of a serious conversation."
        tone="warm"
      />
      <section className="container mx-auto px-4 pb-12 -mt-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-3xl bg-white/80 dark:bg-gray-900/70 border border-amber-100/80 dark:border-gray-800 shadow-sm p-6 md:p-8">
            <div className="flex flex-wrap gap-2 mb-4">
              {quickSignals.map((s) => (
                <span key={s} className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {s}
                </span>
              ))}
            </div>
            <h3 className="text-2xl font-bold">Logline</h3>
            <p className="mt-2 text-base opacity-90">{universe.logline || "Add a studio-grade logline in Admin → Universes."}</p>
            <h3 className="text-2xl font-bold mt-6">Synopsis</h3>
            <p className="mt-2 opacity-90 leading-relaxed">{universe.synopsis || "Add a studio-grade synopsis in Admin → Universes."}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 p-4">
                <div className="text-xs opacity-60 uppercase tracking-wider">Tone</div>
                <div className="font-semibold mt-1">Cinematic • Mythic • Character-driven</div>
              </div>
              <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 p-4">
                <div className="text-xs opacity-60 uppercase tracking-wider">Format</div>
                <div className="font-semibold mt-1">Series / Feature / Animation</div>
              </div>
              <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 p-4">
                <div className="text-xs opacity-60 uppercase tracking-wider">Expansion</div>
                <div className="font-semibold mt-1">Multi-season arcs + spin-offs</div>
              </div>
            </div>
          </div>
          <div className="rounded-3xl bg-white/80 dark:bg-gray-900/70 border border-amber-100/80 dark:border-gray-800 shadow-sm p-6 md:p-8">
            <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Executive Scan</div>
            <h3 className="text-xl font-bold mt-2">At a glance</h3>
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Trailer</div>
                <div className="text-sm font-semibold text-right">{trailerUrl ? "Available" : "Coming soon"}</div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Sound</div>
                <div className="text-sm font-semibold text-right">{audioItems.length ? `${audioItems.length} cues` : soundtrackResolved ? "Available" : "—"}</div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Characters</div>
                <div className="text-sm font-semibold text-right">{characterAssets.length ? `${characterAssets.length}` : "—"}</div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">World Map</div>
                <div className="text-sm font-semibold text-right">{hasWorldMapSection ? "Included" : "—"}</div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Merch</div>
                <div className="text-sm font-semibold text-right">{merchAssets.length ? `${merchAssets.length}` : "—"}</div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Producer Materials</div>
                <div className="text-sm font-semibold text-right">
                  {packageBar.count}/{packageBar.total}
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Viewing Tier</div>
                <div className="text-sm font-semibold text-right">{tierLabel(viewerTier)}</div>
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-amber-200 text-amber-950 p-4">
              <div className="text-sm font-semibold">Options / Licensing</div>
              <div className="text-xs opacity-80 mt-1">Company • budget • timeline</div>
              <a
                href={producerEmailHref}
                className="mt-4 inline-flex w-full justify-center px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold"
              >
                Request Conversation
              </a>
            </div>
          </div>
        </div>
      </section>
      {trailerUrl ? (
        <>
          <SectionIntro id="trailer" kicker="Sizzle" title="Trailer" lead="Tone. Scale. Momentum. One watch." tone="neutral" align="center" />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            <div className="rounded-[28px] overflow-hidden border border-gray-200 dark:border-gray-800 bg-black shadow-sm">
              {isYoutube(trailerUrl) ? <YoutubeEmbed url={trailerUrl} title="Trailer" /> : <video src={trailerUrl} controls playsInline className="w-full h-[480px] object-cover bg-black" />}
            </div>
          </section>
        </>
      ) : null}
      {(audioItems.length || soundtrackResolved) ? (
        <>
          <SectionIntro
            id="audio"
            kicker="Sound"
            title="Themes & Cues"
            lead="Pulled from the same media feed as /media — so your studio page always stays synced."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            <HeaderCard
              kicker="Listening order"
              title="Main Theme → Hero → Villain → Trailer Cue"
              subtitle="Designed to be skimmed fast, then revisited deeper."
              rightChips={["Motif-driven", "Trailer-ready", "Synced with /media"]}
              align="left"
              className="mb-6"
            />
            {audioItems.length ? (
              audioItems.length === 1 ? (
                <div className="flex justify-center">
                  <div className="w-full max-w-3xl">
                    <AudioCard a={audioItems[0]} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {audioItems.map((a) => (
                    <AudioCard key={a.id} a={a} />
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm p-6 md:p-8 text-center">
                <div className="text-lg font-bold">No cues published yet</div>
                <div className="opacity-80 mt-2">Publish media posts tagged to this universe to auto-sync here.</div>
              </div>
            )}
            {soundtrackResolved ? (
              <div className="mt-10">
                <HeaderCard
                  kicker="Official"
                  title="Soundtrack"
                  subtitle="Playlist link (Spotify / YouTube) or the official master track."
                  rightChips={[soundtrackResolved.source === "manual" ? "Manual link" : "Auto-selected", soundtrackResolved.label]}
                  align="center"
                  className="mb-6"
                />
                <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/85 dark:bg-gray-900/60 shadow-sm p-6 md:p-8">
                  {isSoundtrackSpotify ? (
                    <SpotifyEmbed url={resolvedSoundtrackUrl} title="Soundtrack" />
                  ) : isSoundtrackYT ? (
                    <YoutubeEmbed url={resolvedSoundtrackUrl} title="Soundtrack" />
                  ) : isSoundtrackAudioFile ? (
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 p-4">
                      <audio controls preload="none" className="w-full">
                        <source src={resolvedSoundtrackUrl} />
                      </audio>
                    </div>
                  ) : (
                    <div className="text-sm opacity-70">Soundtrack link detected (open via button).</div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    <a
                      className="px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold"
                      href={resolvedSoundtrackUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {isSoundtrackSpotify ? "Listen on Spotify →" : isSoundtrackYT ? "Open on YouTube →" : isSoundtrackAudioFile ? "Open Audio →" : "Open Soundtrack →"}
                    </a>
                    {soundtrackResolved?.item?.slug ? (
                      <Link
                        href={`/media/${soundtrackResolved.item.slug}`}
                        className="px-5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40 font-semibold"
                      >
                        View Details →
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
      {characterAssets.length ? (
        <>
          <SectionIntro id="characters" kicker="Cast" title="Characters" lead="Core cast — roles, identities, and portraits for deck continuity." tone="neutral" align="center" />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {characterAssets.map((c) => (
                <div key={c.id} className="rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm">
                  {getThumb(c) ? (
                    <img src={getThumb(c)} alt={c.title || "Character"} className="w-full h-64 object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-64 bg-gray-100 dark:bg-gray-800" />
                  )}
                  <div className="p-4">
                    <div className="font-semibold text-lg">{c.title || "Character"}</div>
                    {c.description ? <div className="text-sm opacity-80 mt-2 whitespace-pre-wrap leading-relaxed">{c.description}</div> : null}
                    {c?.metadata?.role || c?.metadata?.character_name ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {c?.metadata?.character_name ? chip(String(c.metadata.character_name)) : null}
                        {c?.metadata?.role ? chip(String(c.metadata.role)) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
      {hasWorldMapSection ? (
        <>
          <SectionIntro id="world-map" kicker="World" title="World Map" lead="Geography, regions, and zones — the big picture." tone="neutral" align="center" />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            {featuredWorldMapUrl && worldMapAssets.length === 0 ? (
              <div className="rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm">
                <img src={featuredWorldMapUrl} alt="World map" className="w-full h-[520px] object-cover" loading="lazy" />
                <div className="p-4">
                  <div className="font-semibold">World Map</div>
                  <div className="text-sm opacity-70 mt-1">Featured map</div>
                </div>
              </div>
            ) : null}
            {worldMapAssets.length ? (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 snap-x snap-mandatory">
                {worldMapAssets.map((m) => (
                  <div key={m.id} className="snap-center shrink-0 w-[92%] md:w-[70%] rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm">
                    <img src={getThumb(m) || m.external_url} alt={m.title || "World map"} className="w-full h-[420px] object-cover" loading="lazy" />
                    <div className="p-4">
                      <div className="font-semibold">{m.title || "World Map"}</div>
                      {m.description ? <div className="text-sm opacity-70 mt-1">{m.description}</div> : null}
                      {m.external_url || getThumb(m) ? (
                        <a className="text-sm underline mt-3 inline-block" href={m.external_url || getThumb(m)} target="_blank" rel="noreferrer">
                          Open full size →
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
{bookProducts.length ? (
  <>
    <SectionIntro
      id="books"
      kicker="Publishing"
      title="Books & Collections"
      lead="Publishing products linked to this universe (matched by universe_id)."
      tone="neutral"
      align="center"
    />
    <section className="container mx-auto px-4 pb-14 -mt-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {bookProducts.map((product) => {
          const m = product.metadata || {};

          const buyUrl =
            m.amazon_url ||
            m.kindle_url ||
            m.paperback_url ||
            m.store_url ||
            null;

          const alsoLinks = [
            m.kindle_url ? { label: "Kindle", url: m.kindle_url } : null,
            m.paperback_url ? { label: "Paperback", url: m.paperback_url } : null,
          ].filter(Boolean);

          const chips = [
            m.series || m.book || null,
            m.format ? String(m.format).toUpperCase() : null,
            m.year ? `Published ${m.year}` : null,
          ].filter(Boolean);

          return (
            <Card
              key={product.id}
              title={product.name}
              description={product.description}
              image={product.display_image || pickProductImage(product)}
              category="publishing"
              tags={Array.isArray(product.tags) ? product.tags : []}
            >
              {chips.length ? (
                <div className="flex flex-wrap gap-2 justify-center mb-3">
                  {chips.map((c) => (
                    <span
                      key={c}
                      className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {buyUrl ? (
                  <a
                    href={buyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn bg-black text-white py-2 px-4 rounded hover:opacity-90 transition"
                  >
                    Get Your Copy
                  </a>
                ) : (
                  <Link
                    href="/publishing"
                    className="btn bg-black text-white py-2 px-4 rounded hover:opacity-90 transition"
                  >
                    View in Publishing
                  </Link>
                )}

                {m.pdf_url ? (
                  <a
                    href={m.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    Read Sample
                  </a>
                ) : null}
              </div>

              {alsoLinks.length ? (
                <div className="text-xs text-gray-600 dark:text-gray-300 mt-3 text-center">
                  Also available:{" "}
                  {alsoLinks.map((l, i) => (
                    <a
                      key={l.label}
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-blue-700"
                    >
                      {l.label}
                      {i < alsoLinks.length - 1 ? ", " : ""}
                    </a>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </section>
  </>
) : null}
      <SectionIntro id="visuals" kicker="Visual Identity" title="Merch" lead="Merch mockups for brand extension, drops, and audience capture." tone="neutral" align="center" />
      <section className="container mx-auto px-4 pb-14 -mt-6">
        {merchAssets.length ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {merchAssets.slice(0, 12).map((a) => (
              <div key={a.id} className="rounded-3xl overflow-hidden border border-gray-200/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm">
                {getThumb(a) ? (
                  <img src={getThumb(a)} alt={a.title || ""} className="w-full h-56 object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-56 bg-gray-100 dark:bg-gray-800" />
                )}
                <div className="p-4">
                  <div className="font-semibold">{a.title || "Merch Asset"}</div>
                  <div className="text-xs opacity-70 mt-1">{safeStr(a.asset_type || "merch").toUpperCase()}</div>
                  {a.external_url || a.file_url ? (
                    <a className="text-sm underline mt-3 inline-block" href={a.external_url || a.file_url} target="_blank" rel="noreferrer">
                      Open →
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-gray-200 dark:border-gray-800 p-8 bg-white/70 dark:bg-gray-900/50 text-center">
            <div className="text-lg font-bold">No merch uploaded yet</div>
            <div className="opacity-80 mt-2">Add merch mockups to universe assets.</div>
          </div>
        )}
      </section>
      <SectionIntro id="vault" kicker="IP Vault" title="Adaptation Assets" lead="Package components for partners, buyers, and serious option conversations." tone="warm" align="center" />
      <section className="container mx-auto px-4 pb-14 -mt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {producerPacket ? (
            <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm p-6">
              <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Gated</div>
              <div className="text-xl font-bold mt-2">Producer Packet</div>
              <p className="opacity-80 mt-2">Deck + positioning + world overview (delivered on request).</p>
              <div className="mt-4 rounded-2xl bg-amber-200 text-amber-950 p-4">
                <div className="text-sm font-semibold">Request access</div>
                <div className="text-xs opacity-80">Include company • budget • timeline.</div>
                <a
                  href={producerEmailHref}
                  className="mt-3 inline-flex w-full justify-center px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold"
                >
                  Request Option / Licensing
                </a>
              </div>
            </div>
          ) : (
            <Card title="Producer Packet" description="Enable by adding a studios asset with is_public=false and price_cents>0.">
              <div className="text-sm opacity-70">Currently not configured.</div>
            </Card>
          )}
          {nftAssets.map((a) => (
            <Card key={a.id} title={a.title || "Collectible"} description="Limited edition collectible / unlockable.">
              {a.metadata?.nft_url ? (
                <a className="underline" href={a.metadata.nft_url} target="_blank" rel="noreferrer">
                  View →
                </a>
              ) : (
                <div className="text-sm opacity-70">Add metadata.nft_url to link.</div>
              )}
            </Card>
          ))}
          {(audioItems.length || soundtrackResolved) ? (
            <Card title="Sound Package" description="Themes + cues + soundtrack (synced from /media).">
              <a className="underline" href="#audio">
                Open sound →
              </a>
            </Card>
          ) : null}
        </div>
      </section>
      {groupedPages.length ? (
        <>
          <SectionIntro id="package" kicker="Studio Package" title="Producer-Ready Materials" lead="Organized like a real optionable package — skim first, dive second." tone="neutral" align="center" />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            <AccessGateCard
              viewerTier={viewerTier}
              requiredTier="public"
              title="Producer Materials"
              subtitle="If a page is marked Priority / Producer / Packaging, it will only show when you view that tier."
              universe={universe}
              onCheckout={startStudioCheckout}
            >
              <LockedSectionsPreview universe={universe} pages={studioPages} viewerTier={viewerTier} showVault={showVault} />
              <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm p-6 md:p-8 mb-6 mt-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Package completeness</div>
                    <div className="text-2xl font-bold mt-2">
                      {packageBar.count}/{packageBar.total} ready
                    </div>
                    <div className="text-sm opacity-80 mt-2">Add missing pages in Studio Pages.</div>
                  </div>
                  <div className="min-w-[220px] flex-1">
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 border overflow-hidden mt-2">
                      <div className="h-full bg-black dark:bg-white" style={{ width: `${Math.round((packageBar.count / packageBar.total) * 100)}%` }} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 justify-end">
                      {showVault ? chip("Vault: ON") : chip("Vault: OFF")}
                      {chip(`Tier: ${tierLabel(viewerTier)}`)}
                      {chip("Copy-paste friendly")}
                      {chip("Executive order")}
                    </div>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {studioToc.slice(0, 18).map((t) => {
                    if (t.kind === "group") {
                      return (
                        <a key={t.id} href={`#${t.id}`} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 px-4 py-3 hover:border-amber-400 transition">
                          <div className="text-xs opacity-60 uppercase tracking-wider">Section</div>
                          <div className="font-semibold mt-1">{t.label}</div>
                        </a>
                      );
                    }
                    return (
                      <a
                        key={t.id}
                        href={`#${t.id}`}
                        className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 px-4 py-3 hover:border-amber-400 transition"
                        title={t.tag}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold">{t.label}</div>
                          <div className="flex gap-2 items-center">
                            <span className={tierBadge(t.tier)}>{tierLabel(t.tier)}</span>
                            {t.vault ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 text-slate-800 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700">
                                vault
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100 dark:border-emerald-900/40">
                                public
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs opacity-70 mt-1">{t.tag}</div>
                      </a>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-10">
                {groupedPages.map((g) => (
                  <div key={g.key} id={`pkg-${g.key}`} className="scroll-mt-28">
                    <HeaderCard kicker={g.kicker} title={g.title} subtitle={g.lead} rightChips={g.chips || []} align="center" className="mb-6" />
                    <div className="grid grid-cols-1 gap-5">
                      {g.pages.map((p) => {
                        const vis = getPageVisibility(p);
                        const tag = niceTypeLabel(p.page_type);
                        const anchorId = `p-${p.id}`;
                        const pageTier = getPageAccessTier(p);
                        return (
                          <div
                            key={p.id}
                            id={anchorId}
                            className="scroll-mt-28 rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm p-6 md:p-8"
                          >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <div className="flex flex-wrap gap-2 items-center">
                                  <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">{tag}</div>
                                  <span className={tierBadge(pageTier)}>{tierLabel(pageTier)}</span>
                                  {vis === "vault" ? (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 text-slate-800 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700">
                                      vault
                                    </span>
                                  ) : (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-100 dark:border-emerald-900/40">
                                      public
                                    </span>
                                  )}
                                </div>
                                <h3 className="text-2xl font-bold mt-2">{p.title || tag}</h3>
                                {p.excerpt ? <div className="mt-2 text-sm opacity-80">{p.excerpt}</div> : null}
                              </div>
                              {p.hero_image_url || p.hero_video_url ? (
                                <div className="flex gap-2">
                                  {p.hero_video_url ? (
                                    <a href={p.hero_video_url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-sm">
                                      Open Video →
                                    </a>
                                  ) : null}
                                  {p.hero_image_url ? (
                                    <a href={p.hero_image_url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl border border-gray-300 bg-white/70 dark:bg-gray-950/40 text-sm">
                                      Open Image →
                                    </a>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <div className="mt-5">{renderPlainMarkdown(p.content_md)}</div>
                            <PageAttachmentsRail page={p} />
                            <div className="mt-6 flex justify-end">
                              <a href="#package" className="text-sm underline opacity-70 hover:opacity-100">
                                Back to materials ↑
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </AccessGateCard>
          </section>
        </>
      ) : (
        <>
          <SectionIntro
            id="package"
            kicker="Studio Package"
            title="Producer-Ready Materials"
            lead="No pages are visible at your current tier. Publish pages and/or raise your viewing tier to preview gated packages."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            <AccessGateCard
              viewerTier={viewerTier}
              requiredTier="priority"
              title="Priority Window materials are not visible"
              subtitle="Switch to ?tier=priority or set some pages to Public."
              universe={universe}
              onCheckout={startStudioCheckout}
            />
            <div className="mt-6">
              <LockedSectionsPreview universe={universe} pages={studioPages} viewerTier={viewerTier} showVault={showVault} />
            </div>
          </section>
        </>
      )}
      <section className="container mx-auto px-4 pb-14">
        <div className="rounded-3xl bg-white/80 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-800 shadow-sm p-6 md:p-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Creator</div>
              <div className="text-2xl font-bold mt-1">Credits</div>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {chip("© Manyagi Studios")}
              {chip("All Rights Reserved")}
              {chip("Original IP")}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 p-4">
              <div className="text-xs opacity-60 uppercase tracking-wider">Created by</div>
              <div className="font-semibold mt-1">Dennis Manyagi</div>
            </div>
            <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 p-4">
              <div className="text-xs opacity-60 uppercase tracking-wider">Music / Sound</div>
              <div className="font-semibold mt-1">Manyagi Media</div>
            </div>
            <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 p-4">
              <div className="text-xs opacity-60 uppercase tracking-wider">Studio Packaging</div>
              <div className="font-semibold mt-1">Manyagi Studios</div>
            </div>
          </div>
        </div>
      </section>
      <section className="container mx-auto px-4 pb-20" id="contact">
        <div className="text-center">
          <div className="text-3xl font-bold">Options / Licensing</div>
          <div className="opacity-80 mt-2">Company • budget • timeline</div>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <a href={producerEmailHref} className="px-6 py-3 rounded-2xl bg-black text-white dark:bg-white dark:text-black font-semibold">
              Email Studios →
            </a>
            <Link href="/studios" className="px-6 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40">
              Back to Library
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}