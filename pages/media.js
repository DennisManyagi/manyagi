// pages/media.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Hero from "@/components/Hero";
import Recommender from "@/components/Recommender";
import SectionIntro from "@/components/SectionIntro";
import SubscriptionForm from "@/components/SubscriptionForm";

// -------------------------------
// helpers
// -------------------------------
const asStr = (v) => (v === null || v === undefined ? "" : String(v));

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

function groupBy(arr, key) {
  return (arr || []).reduce((acc, item) => {
    const k = asStr(item?.[key] || "other").toLowerCase();
    acc[k] = acc[k] || [];
    acc[k].push(item);
    return acc;
  }, {});
}

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

function normalizeType(t) {
  const v = (t || "").toLowerCase().trim();

  // legacy mappings
  if (v === "music" || v === "track") return "soundtrack";
  if (v === "chapter preview" || v === "chapter") return "chapter_read";

  // your MediaTab types
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

function clamp(s, n = 140) {
  const str = asStr(s);
  if (str.length <= n) return str;
  return str.slice(0, n - 1) + "…";
}

function pickCardImage(post, meta) {
  return (
    meta?.thumbnail_url ||
    post.thumbnail_url ||
    post.featured_image ||
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

function normalizeApiList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.posts)) return json.posts;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.rows)) return json.rows;
  if (json && Array.isArray(json.items)) return json.items;
  return [];
}

// -------------------------------
// embeds
// -------------------------------
function MediaEmbed({ mediaUrl, audioUrl }) {
  const url = (audioUrl || mediaUrl || "").trim();
  if (!url) return null;

  if (isDirectAudio(url)) {
    return (
      <div className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 p-3">
        <audio controls className="w-full">
          <source src={url} />
        </audio>
      </div>
    );
  }

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isSpotify = url.includes("open.spotify.com");
  const isSoundCloud = url.includes("soundcloud.com");
  const isVimeo = url.includes("vimeo.com");

  if (isYouTube) {
    let embed = url;
    if (url.includes("watch?v=")) {
      const id = url.split("watch?v=")[1].split("&")[0];
      embed = `https://www.youtube.com/embed/${id}`;
    } else if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1].split(/[?&]/)[0];
      embed = `https://www.youtube.com/embed/${id}`;
    }
    return (
      <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-gray-300 dark:border-gray-700">
        <iframe src={embed} title="Media Preview" className="w-full h-full" allowFullScreen />
      </div>
    );
  }

  if (isSpotify) {
    const embed = url.replace("open.spotify.com/", "open.spotify.com/embed/");
    return (
      <div className="w-full rounded-2xl overflow-hidden border border-gray-300 dark:border-gray-700">
        <iframe
          src={embed}
          title="Spotify Player"
          className="w-full h-[152px] md:h-[232px]"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        />
      </div>
    );
  }

  if (isSoundCloud) {
    const embed = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&show_teaser=true`;
    return (
      <div className="w-full rounded-2xl overflow-hidden border border-gray-300 dark:border-gray-700">
        <iframe src={embed} title="SoundCloud Player" className="w-full h-[166px]" allow="autoplay" />
      </div>
    );
  }

  if (isVimeo) {
    let embed = url;
    const parts = url.split("vimeo.com/");
    if (parts[1]) {
      const id = parts[1].split(/[?&]/)[0];
      embed = `https://player.vimeo.com/video/${id}`;
    }
    return (
      <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-gray-300 dark:border-gray-700">
        <iframe src={embed} title="Vimeo Player" className="w-full h-full" allowFullScreen />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center w-full bg-blue-600 text-white text-sm font-semibold py-2 px-3 rounded-full hover:bg-blue-700 transition"
    >
      Open Link
    </a>
  );
}

// -------------------------------
// rail component
// -------------------------------
function Rail({ id, title, lead, items }) {
  if (!items?.length) return null;

  return (
    <section id={id} className="container mx-auto px-4 py-10">
      <SectionIntro kicker="MEDIA" title={title} lead={lead} tone="neutral" align="center" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 -mt-6">
        {items.slice(0, 9).map((item) => (
          <div
            key={item.id}
            className="rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm bg-white/70 dark:bg-gray-900/50"
          >
            <div className="relative h-44">
              <img src={item.card_img} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-tr from-black/55 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <div className="text-[11px] tracking-[0.28em] uppercase text-white/80">{prettyType(item.media_type)}</div>
                <div className="text-lg font-bold text-white leading-snug line-clamp-2">{item.title}</div>
              </div>
            </div>

            <div className="p-5">
              <p className="text-sm opacity-80 line-clamp-3">
                {item.scene ? (
                  <>
                    <span className="font-semibold">Scene:</span> {clamp(item.scene, 90)}
                    <br />
                    <span className="opacity-80">{item.excerpt ? clamp(item.excerpt, 90) : ""}</span>
                  </>
                ) : (
                  clamp(item.excerpt || "Explore this media item.", 140)
                )}
              </p>

              <div className="mt-4 flex gap-2 flex-wrap">
                {item.platform && (
                  <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs dark:bg-gray-800 dark:text-gray-200">
                    {item.platform}
                  </span>
                )}
                {item.duration && (
                  <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs dark:bg-gray-800 dark:text-gray-200">
                    {item.duration}
                  </span>
                )}
                {item.ip && (
                  <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-200">
                    {item.ip}
                  </span>
                )}
                {item.mood && (
                  <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs dark:bg-purple-900/40 dark:text-purple-200">
                    {item.mood}
                  </span>
                )}
              </div>

              <div className="mt-4">
                <MediaEmbed mediaUrl={item.media_url} audioUrl={item.audio_url} />
              </div>

              <div className="mt-4 flex gap-2 flex-wrap">
                <Link
                  href={`/media/${item.slug}`}
                  className="px-3 py-2 rounded-full text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  {primaryCta(item)} Details →
                </Link>

                {item.download_url && (
                  <a
                    href={item.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-full text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition"
                  >
                    Download
                  </a>
                )}

                {item.license_url && (
                  <a
                    href={item.license_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-full text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
                  >
                    License
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {items.length > 9 && (
        <div className="text-center mt-8">
          <a
            href="#library"
            className="inline-flex items-center justify-center px-5 py-2 rounded-full border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            Browse full library ↓
          </a>
        </div>
      )}
    </section>
  );
}

// -------------------------------
// page
// -------------------------------
export default function MediaPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIP, setActiveIP] = useState("ALL");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/posts?division=media");
        const json = await res.json();
        const raw = normalizeApiList(json);

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
              created_at: p.created_at || m.created_at || null,
            };
          })
          .filter((it) => !!asStr(it.audio_url).trim() || !!asStr(it.media_url).trim());

        list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        setItems(list);
      } catch (err) {
        console.error("media fetch error:", err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const carouselImages = [
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-1.webp",
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-2.webp",
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-3.webp",
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-4.webp",
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-5.webp",
  ];

  const ipOptions = useMemo(() => {
    const set = new Set();
    items.forEach((it) => {
      if (it.ip) set.add(String(it.ip));
    });
    return ["ALL", ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    if (activeIP === "ALL") return items;
    return items.filter((it) => it.ip === activeIP);
  }, [items, activeIP]);

  const dropNow = useMemo(() => filtered.slice(0, 9), [filtered]);

  const byType = useMemo(() => groupBy(filtered, "media_type"), [filtered]);
  const soundtracks = byType["soundtrack"] || [];
  const score = byType["score"] || [];
  const trailers = byType["trailer"] || [];
  const audiobooks = byType["audiobook"] || [];
  const chapterReads = byType["chapter_read"] || [];
  const scenes = byType["scene"] || [];
  const playlists = byType["playlist"] || [];
  const musicVideos = byType["musicvideo"] || [];

  if (loading) {
    return <div className="container mx-auto px-4 py-16 text-center">Loading media...</div>;
  }

  return (
    <>
      <Head>
        <title>Manyagi Media — Soundtracks & Trailers</title>
        <meta
          name="description"
          content="Soundtracks, score, trailers, audiobooks, and scene reads from the Manyagi Universe."
        />
      </Head>

      {/* ✅ FIX: ensure hero does NOT overlap next section by removing negative margin usage below
          and adding a real spacer after Hero. */}
      <div className="relative">
        <Hero
          kicker="Manyagi Media"
          title="The Universe, In Sound & Motion"
          lead="Soundtracks, score, trailers, audiobooks, chapter reads, and scene moments — organized by IP so every world feels alive."
          carouselImages={carouselImages}
          height="h-[600px]"
        >
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="#drop-now" className="btn bg-blue-600 text-white py-3 px-5 rounded hover:scale-105 transition">
              Drop Now
            </Link>
            <Link
              href="#library"
              className="btn bg-white/90 text-gray-900 border border-gray-200 py-3 px-5 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Full Library
            </Link>
          </div>
        </Hero>

        {/* spacer so the next block never tucks under the hero (even if Hero uses absolute layers) */}
        <div className="h-6 md:h-10" />
      </div>

      {/* ✅ FIX: removed -mt-8 (this is what was pulling the IP filter under/into the hero)
          also make sure it sits above anything with z-10 */}
      <section className="container mx-auto px-4 mt-2 md:mt-4 mb-10 relative z-10">
        <div className="rounded-3xl bg-white/80 dark:bg-gray-900/80 border border-amber-100/80 dark:border-gray-800 shadow-sm px-4 md:px-6 py-5 md:py-6">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold tracking-[0.26em] uppercase text-amber-700/80 dark:text-amber-300/80">
                IP Filter
              </div>
              <div className="text-sm opacity-80">Pick a universe to browse music + media together.</div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {ipOptions.slice(0, 10).map((ip) => {
                const isActive = activeIP === ip;
                return (
                  <button
                    key={ip}
                    type="button"
                    onClick={() => setActiveIP(ip)}
                    className={[
                      "px-4 py-2 rounded-full text-sm border transition",
                      isActive
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white/90 text-gray-800 border-gray-200 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-800",
                    ].join(" ")}
                  >
                    {ip === "ALL" ? "All IPs" : ip}
                  </button>
                );
              })}
              {ipOptions.length > 10 && (
                <span className="text-xs opacity-70 self-center">(+{ipOptions.length - 10} more)</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <SectionIntro
        kicker="Manyagi Media"
        title={activeIP === "ALL" ? "Drops Across the Universe" : `${activeIP} — Media Hub`}
        lead="Start with the newest drops, then dive into soundtracks, score, trailers, and reads."
        tone="warm"
      />

      <Rail id="drop-now" title="Drop Now" lead="Newest uploads first — perfect for fast Suno drops and instant site updates." items={dropNow} />

      <Rail id="soundtracks" title="Soundtracks" lead="Main themes, scene tracks, and character motifs." items={soundtracks} />
      <Rail id="score" title="Score" lead="Cinematic underscore and mood beds for key moments." items={score} />

      <Rail id="trailers" title="Trailers" lead="Visual previews powered by the music — designed for share + pitch." items={trailers} />

      <Rail id="audiobooks" title="Audiobooks" lead="Long-form audio versions for binge listening." items={audiobooks} />
      <Rail id="chapter-reads" title="Chapter Preview Reads" lead="Short reads to tease the book before purchase." items={chapterReads} />

      <Rail id="scenes" title="Scenes" lead="Moment-based clips: a fight, a reveal, a betrayal — each with its own sound." items={scenes} />
      <Rail id="playlists" title="Playlists" lead="Curated listening sessions per IP, character, or arc." items={playlists} />
      <Rail id="musicvideos" title="Music Videos" lead="Full cinematic edits where the song is the story." items={musicVideos} />

      {/* FULL LIBRARY GRID */}
      <section id="library" className="container mx-auto px-4 py-10">
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-white/80 border border-amber-200/70 shadow-sm text-sm text-gray-700 text-center dark:bg-gray-900/70 dark:border-amber-800/60 dark:text-gray-100">
            <span className="text-[11px] font-semibold tracking-[0.26em] uppercase text-amber-700/80 dark:text-amber-300/80">
              Full Library
            </span>
            <span>
              Showing <span className="font-semibold">{filtered.length}</span> item(s)
              {activeIP !== "ALL" ? (
                <>
                  {" "}
                  for <span className="italic">“{activeIP}”</span>
                </>
              ) : null}
              .
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg">No media items yet for this IP.</p>
            <p className="text-sm opacity-70 mt-2">
              Add a Media post in Admin → Media with metadata.book/universe and metadata.audio_url or metadata.media_url.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm bg-white/70 dark:bg-gray-900/50"
              >
                <div className="relative h-48">
                  <img src={item.card_img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-tr from-black/55 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="text-[11px] tracking-[0.28em] uppercase text-white/80">{prettyType(item.media_type)}</div>
                    <div className="text-xl font-bold text-white">{item.title}</div>
                  </div>
                </div>

                <div className="p-5">
                  <p className="text-sm opacity-80 line-clamp-3">{item.excerpt || "Explore this media item."}</p>

                  <div className="mt-4 flex gap-2 flex-wrap">
                    {item.platform && (
                      <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs dark:bg-gray-800 dark:text-gray-200">
                        {item.platform}
                      </span>
                    )}
                    {item.ip && (
                      <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-200">
                        {item.ip}
                      </span>
                    )}
                    {item.scene && (
                      <span className="px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs dark:bg-purple-900/40 dark:text-purple-200">
                        {clamp(item.scene, 40)}
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <MediaEmbed mediaUrl={item.media_url} audioUrl={item.audio_url} />
                  </div>

                  <div className="mt-4 flex gap-2 flex-wrap">
                    <Link href={`/media/${item.slug}`} className="text-sm font-semibold underline">
                      {primaryCta(item)} Details →
                    </Link>
                    {item.download_url && (
                      <a
                        href={item.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold underline"
                      >
                        Download →
                      </a>
                    )}
                    {item.license_url && (
                      <a
                        href={item.license_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold underline"
                      >
                        License →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="subscribe" className="container mx-auto px-4 pb-16">
        <SubscriptionForm
          formId="8427848"
          uid="637df68a01"
          title="Get Media Updates"
          description="New soundtrack drops, trailer releases, and scene music by IP."
        />
      </section>

      <Recommender />
    </>
  );
}
