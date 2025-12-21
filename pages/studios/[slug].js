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
   Small helpers
--------------------------------*/
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

function safeStr(v) {
  return String(v ?? "").trim();
}

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

// Minimal render (safe + paste-friendly). If you want full markdown later, swap to react-markdown.
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

function AudioCard({ a }) {
  const url = getAssetUrl(a);
  const thumb = getThumb(a);
  const title = a?.title || "Audio";
  const desc = a?.description || a?.excerpt || "";
  const kind =
    safeStr(a?.metadata?.audio_kind) ||
    safeStr(a?.metadata?.media_type) ||
    safeStr(a?.media_type) ||
    safeStr(a?.asset_type) ||
    "audio";
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
              {safeStr(kind).replaceAll("_", " ")}
              {fileType ? ` • ${fileType.toUpperCase()}` : ""}
            </div>
            <div className="text-lg font-semibold mt-1">{title}</div>
            {desc ? <div className="text-sm opacity-80 mt-2 whitespace-pre-wrap">{desc}</div> : null}
          </div>

          <div className="flex flex-col gap-2 items-end">
            {a?.metadata?.license_tier ? chip(`License: ${a.metadata.license_tier}`) : null}
            {a?.metadata?.bpm ? chip(`BPM ${a.metadata.bpm}`) : null}
            {a?.metadata?.duration ? chip(`${a.metadata.duration}`) : null}
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
                  Open Audio →
                </a>

                {a?.metadata?.download_url ? (
                  <a
                    href={a.metadata.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40 text-sm"
                  >
                    Download →
                  </a>
                ) : null}

                {a?.metadata?.license_url ? (
                  <a
                    href={a.metadata.license_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 text-sm"
                  >
                    Rights / License →
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="text-sm opacity-70">No audio URL found on this asset.</div>
          )}
        </div>

        {a?.metadata?.tags?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {a.metadata.tags.slice(0, 8).map((t) => (
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

export default function StudioUniverse() {
  const router = useRouter();
  const { slug } = router.query;

  const [universe, setUniverse] = useState(null);
  const [assets, setAssets] = useState([]);
  const [studioPages, setStudioPages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data: u, error: uErr } = await supabase
        .from("universes")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (uErr) console.error(uErr);
      if (cancelled) return;

      setUniverse(u || null);

      if (!u?.id) {
        setAssets([]);
        setStudioPages([]);
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
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

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

  // World maps (STRICT: only world maps)
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

  // Visuals raw (STRICT: exclude world maps always)
  const visualAssetsRaw = useMemo(() => {
    return assets.filter((a) => {
      const t = safeStr(a.asset_type).toLowerCase();
      const div = safeStr(a.division).toLowerCase();
      const url = getAssetUrl(a);
      const ft = guessFileType(url);
      const kind = safeStr(a?.metadata?.kind).toLowerCase();

      const isWorldMap =
        t === "world_map" ||
        kind === "world_map" ||
        safeStr(a?.metadata?.media_type).toLowerCase() === "world_map";

      if (isWorldMap) return false;

      return (
        ["image", "art", "still", "poster", "cover"].includes(t) ||
        div === "designs" ||
        ft === "image" ||
        kind === "visual"
      );
    });
  }, [assets]);

  // ✅ Visual Identity = MERCH ONLY (no tabs)
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

  // Characters (STRICT: only characters)
  const characterAssets = useMemo(() => {
    return assets.filter((a) => {
      const t = safeStr(a.asset_type).toLowerCase();
      const kind = safeStr(a?.metadata?.kind).toLowerCase();
      return t === "character" || kind === "character";
    });
  }, [assets]);

  // AUDIO LIST
  const audioAssets = useMemo(() => {
    const AUDIO_TYPES = new Set([
      "audio",
      "track",
      "song",
      "theme",
      "score",
      "soundtrack",
      "ost",
      "opening",
      "ending",
      "chapter_read",
      "voice",
      "dialogue",
      "sfx",
      "music",
    ]);

    const isAudio = (a) => {
      const t = safeStr(a.asset_type).toLowerCase();
      const mt = safeStr(a?.metadata?.media_type).toLowerCase();
      const kind = safeStr(a?.metadata?.audio_kind).toLowerCase();
      const div = safeStr(a?.division).toLowerCase();

      const url = getAssetUrl(a);
      const ft = guessFileType(url);
      const platformAudio = url.includes("spotify.com") || isYoutube(url);

      if (AUDIO_TYPES.has(t) || AUDIO_TYPES.has(mt) || AUDIO_TYPES.has(kind)) return true;
      if (div === "media") return true;
      if (platformAudio) return true;
      if (["mp3", "wav", "m4a", "ogg"].includes(ft)) return true;

      return false;
    };

    const isTrailerish = (a) => {
      const t = safeStr(a.asset_type).toLowerCase();
      const mt = safeStr(a?.metadata?.media_type).toLowerCase();
      return t === "trailer" || t === "video" || mt === "trailer";
    };

    return assets.filter((a) => isAudio(a) && !isTrailerish(a));
  }, [assets]);

  const soundtrackAsset = useMemo(() => {
    return (
      assets.find((x) => safeStr(x.asset_type).toLowerCase() === "soundtrack") ||
      assets.find((x) => safeStr(x?.metadata?.media_type).toLowerCase() === "playlist") ||
      assets.find((x) => safeStr(x?.media_type).toLowerCase() === "playlist") ||
      assets.find((x) => safeStr(x.division).toLowerCase() === "media") ||
      null
    );
  }, [assets]);

  const soundtrackUrl = useMemo(() => {
    return (
      soundtrackAsset?.external_url ||
      soundtrackAsset?.file_url ||
      soundtrackAsset?.metadata?.media_url ||
      soundtrackAsset?.metadata?.audio_url ||
      ""
    );
  }, [soundtrackAsset]);

  const producerPacket = useMemo(() => {
    return (
      assets.find(
        (x) =>
          safeStr(x.division).toLowerCase() === "studios" &&
          x.is_public === false &&
          Number(x.price_cents || 0) > 0
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
    if (audioAssets.length) signals.push(`${audioAssets.length} Audio Cues`);
    if (merchAssets.length) signals.push(`${merchAssets.length} Merch Mockups`);
    if (characterAssets.length) signals.push(`${characterAssets.length} Characters`);
    if (hasWorldMapSection) signals.push("World Map");
    if (producerPacket) signals.push("Producer Packet (Gated)");
    if (nftAssets.length) signals.push("Collectibles");
    if (studioPages.length) signals.push(`${studioPages.length} Studio Pages`);
    return signals;
  }, [
    trailerUrl,
    audioAssets.length,
    merchAssets.length,
    characterAssets.length,
    hasWorldMapSection,
    producerPacket,
    nftAssets.length,
    studioPages.length,
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
    ...(audioAssets.length ? [{ href: "#audio", label: "Audio" }] : []),
    ...(studioPages.length ? [{ href: "#studio-pages", label: "Studio Pages" }] : []),
    ...(characterAssets.length ? [{ href: "#characters", label: "Characters" }] : []),
    ...(hasWorldMapSection ? [{ href: "#world-map", label: "World Map" }] : []),
    { href: "#visuals", label: "Merch" },
    { href: "#vault", label: "IP Vault" },
    { href: "#contact", label: "Options" },
  ];

  const isSoundtrackSpotify = soundtrackUrl?.includes("spotify.com");
  const isSoundtrackYT = isYoutube(soundtrackUrl);
  const isSoundtrackAudioFile = ["mp3", "wav", "m4a", "ogg"].includes(guessFileType(soundtrackUrl));

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

        {jsonLd ? (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        ) : null}
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
            <a
              href="#trailer"
              className="btn bg-black text-white py-2 px-4 rounded hover:scale-105 transition dark:bg-white dark:text-black"
            >
              ▶ Watch Trailer
            </a>
          ) : null}

          {audioAssets.length ? (
            <a
              href="#audio"
              className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
            >
              🎧 Listen
            </a>
          ) : null}

          <a
            href="#vault"
            className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
          >
            View IP Vault
          </a>

          <a
            href={producerEmailHref}
            className="btn bg-amber-200 text-amber-950 py-2 px-4 rounded hover:bg-amber-300 transition"
          >
            💼 Options / Licensing
          </a>
        </div>
      </Hero>

      {/* Micro-nav strip */}
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
                <span
                  key={s}
                  className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  {s}
                </span>
              ))}
            </div>

            <h3 className="text-2xl font-bold">Logline</h3>
            <p className="mt-2 text-base opacity-90">
              {universe.logline || "Add a studio-grade logline in Admin → Universes."}
            </p>

            <h3 className="text-2xl font-bold mt-6">Synopsis</h3>
            <p className="mt-2 opacity-90 leading-relaxed">
              {universe.synopsis || "Add a studio-grade synopsis in Admin → Universes."}
            </p>

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
                <div className="text-sm opacity-70">Audio</div>
                <div className="text-sm font-semibold text-right">
                  {audioAssets.length ? `${audioAssets.length} cues` : "—"}
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Characters</div>
                <div className="text-sm font-semibold text-right">
                  {characterAssets.length ? `${characterAssets.length}` : "—"}
                </div>
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
                <div className="text-sm opacity-70">Studio Pages</div>
                <div className="text-sm font-semibold text-right">
                  {studioPages.length ? `${studioPages.length}` : "—"}
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Producer Packet</div>
                <div className="text-sm font-semibold text-right">{producerPacket ? "Gated" : "—"}</div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-black text-white dark:bg-white dark:text-black p-4">
              <div className="text-sm font-semibold">Options / Licensing</div>
              <div className="text-xs opacity-80 mt-1">Company • budget • timeline</div>
              <a
                href={producerEmailHref}
                className="mt-4 inline-flex w-full justify-center px-4 py-2 rounded-xl bg-amber-200 text-amber-950 font-semibold hover:bg-amber-300 transition"
              >
                Request Conversation
              </a>
            </div>

            <div className="mt-4 text-xs opacity-60">
              Tip: Add “Comparable Titles” + “Season Arc” as Studio Pages to increase optionability.
            </div>
          </div>
        </div>
      </section>

      {/* TRAILER */}
      {trailerUrl ? (
        <>
          <SectionIntro
            id="trailer"
            kicker="Sizzle"
            title="Trailer"
            lead="Tone. Scale. Momentum. One watch."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            <div className="rounded-[28px] overflow-hidden border border-gray-200 dark:border-gray-800 bg-black shadow-sm">
              {isYoutube(trailerUrl) ? (
                <YoutubeEmbed url={trailerUrl} title="Trailer" />
              ) : (
                <video src={trailerUrl} controls playsInline className="w-full h-[480px] object-cover bg-black" />
              )}
            </div>
          </section>
        </>
      ) : null}

      {/* AUDIO */}
      {audioAssets.length ? (
        <>
          <SectionIntro
            id="audio"
            kicker="Sound"
            title="Themes & Cues"
            lead="The emotional signature of the world — the fastest proof of tone."
            tone="neutral"
            align="center"
          />

          <section className="container mx-auto px-4 pb-14 -mt-6">
            <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm p-6 md:p-8 mb-6">
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div>
                  <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Listening order</div>
                  <div className="text-xl font-bold mt-1">Main Theme → Hero → Villain → Trailer Cue</div>
                  <div className="text-sm opacity-80 mt-2">Designed to be skimmed fast, then revisited deeper.</div>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  {chip("Motif-driven")}
                  {chip("Trailer-ready")}
                  {chip("Clear licensing path")}
                </div>
              </div>
            </div>

            {audioAssets.length === 1 ? (
              <div className="flex justify-center">
                <div className="w-full max-w-3xl">
                  <AudioCard a={audioAssets[0]} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {audioAssets.map((a) => (
                  <AudioCard key={a.id} a={a} />
                ))}
              </div>
            )}

            {/* Official Soundtrack */}
            {soundtrackUrl ? (
              <div className="mt-10">
                <div className="text-center mb-5">
                  <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Official</div>
                  <div className="text-2xl font-bold mt-2">Soundtrack</div>
                  <div className="opacity-80 mt-2">Playlist link (Spotify / YouTube) or the official master track.</div>
                </div>

                <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/85 dark:bg-gray-900/60 shadow-sm p-6 md:p-8">
                  {isSoundtrackSpotify ? (
                    <SpotifyEmbed url={soundtrackUrl} title="Official Soundtrack" />
                  ) : isSoundtrackYT ? (
                    <YoutubeEmbed url={soundtrackUrl} title="Official Soundtrack" />
                  ) : isSoundtrackAudioFile ? (
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/30 p-4">
                      <audio controls preload="none" className="w-full">
                        <source src={soundtrackUrl} />
                      </audio>
                    </div>
                  ) : (
                    <div className="text-sm opacity-70">Soundtrack link detected (open via button).</div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    <a
                      className="px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold"
                      href={soundtrackUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {isSoundtrackSpotify
                        ? "Listen on Spotify →"
                        : isSoundtrackYT
                        ? "Open on YouTube →"
                        : isSoundtrackAudioFile
                        ? "Open Audio →"
                        : "Open Soundtrack →"}
                    </a>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {/* STUDIO PAGES */}
      {studioPages.length ? (
        <>
          <SectionIntro
            id="studio-pages"
            kicker="Studio Package"
            title="Deck Pages & Materials"
            lead="The written package — ready for coverage, partners, and serious option conversations."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            <div className="grid grid-cols-1 gap-5">
              {studioPages.map((p) => (
                <div
                  key={p.id}
                  className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm p-6 md:p-8"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">{p.page_type}</div>
                      <h3 className="text-2xl font-bold mt-2">{p.title}</h3>
                      {p.excerpt ? <div className="mt-2 text-sm opacity-80">{p.excerpt}</div> : null}
                    </div>

                    {p.hero_image_url || p.hero_video_url ? (
                      <div className="flex gap-2">
                        {p.hero_video_url ? (
                          <a
                            href={p.hero_video_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black text-sm"
                          >
                            Open Video →
                          </a>
                        ) : null}
                        {p.hero_image_url ? (
                          <a
                            href={p.hero_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 rounded-xl border border-gray-300 bg-white/70 dark:bg-gray-950/40 text-sm"
                          >
                            Open Image →
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5">{renderPlainMarkdown(p.content_md)}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {/* CHARACTERS */}
      {characterAssets.length ? (
        <>
          <SectionIntro
            id="characters"
            kicker="Cast"
            title="Characters"
            lead="Core cast — roles, identities, and portraits for deck continuity."
            tone="neutral"
            align="center"
          />

          <section className="container mx-auto px-4 pb-14 -mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {characterAssets.map((c) => (
                <div
                  key={c.id}
                  className="rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm"
                >
                  {getThumb(c) ? (
                    <img
                      src={getThumb(c)}
                      alt={c.title || "Character"}
                      className="w-full h-64 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-64 bg-gray-100 dark:bg-gray-800" />
                  )}

                  <div className="p-4">
                    <div className="font-semibold text-lg">{c.title || "Character"}</div>
                    {c.description ? (
                      <div className="text-sm opacity-80 mt-2 whitespace-pre-wrap leading-relaxed">{c.description}</div>
                    ) : null}

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

      {/* WORLD MAP */}
      {hasWorldMapSection ? (
        <>
          <SectionIntro
            id="world-map"
            kicker="World"
            title="World Map"
            lead="Geography, regions, and zones — the big picture."
            tone="neutral"
            align="center"
          />

          <section className="container mx-auto px-4 pb-14 -mt-6">
            {featuredWorldMapUrl && worldMapAssets.length === 0 ? (
              <div className="rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm">
                <img
                  src={featuredWorldMapUrl}
                  alt="World map"
                  className="w-full h-[520px] object-cover"
                  loading="lazy"
                />
                <div className="p-4">
                  <div className="font-semibold">World Map</div>
                  <div className="text-sm opacity-70 mt-1">Featured map</div>
                </div>
              </div>
            ) : null}

            {worldMapAssets.length ? (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 snap-x snap-mandatory">
                {worldMapAssets.map((m) => (
                  <div
                    key={m.id}
                    className="snap-center shrink-0 w-[92%] md:w-[70%] rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm"
                  >
                    <img
                      src={getThumb(m) || m.external_url}
                      alt={m.title || "World map"}
                      className="w-full h-[420px] object-cover"
                      loading="lazy"
                    />
                    <div className="p-4">
                      <div className="font-semibold">{m.title || "World Map"}</div>
                      {m.description ? <div className="text-sm opacity-70 mt-1">{m.description}</div> : null}
                      {m.external_url || getThumb(m) ? (
                        <a
                          className="text-sm underline mt-3 inline-block"
                          href={m.external_url || getThumb(m)}
                          target="_blank"
                          rel="noreferrer"
                        >
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

      {/* VISUAL IDENTITY (MERCH ONLY) */}
      <SectionIntro
        id="visuals"
        kicker="Visual Identity"
        title="Merch"
        lead="Merch mockups for brand extension, drops, and audience capture."
        tone="neutral"
        align="center"
      />

      <section className="container mx-auto px-4 pb-14 -mt-6">
        {merchAssets.length ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {merchAssets.slice(0, 12).map((a) => (
              <div
                key={a.id}
                className="rounded-3xl overflow-hidden border border-gray-200/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm"
              >
                {getThumb(a) ? (
                  <img src={getThumb(a)} alt={a.title || ""} className="w-full h-56 object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-56 bg-gray-100 dark:bg-gray-800" />
                )}
                <div className="p-4">
                  <div className="font-semibold">{a.title || "Merch Asset"}</div>
                  <div className="text-xs opacity-70 mt-1">{safeStr(a.asset_type || "merch").toUpperCase()}</div>
                  {a.external_url || a.file_url ? (
                    <a
                      className="text-sm underline mt-3 inline-block"
                      href={a.external_url || a.file_url}
                      target="_blank"
                      rel="noreferrer"
                    >
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
            <div className="opacity-80 mt-2">
              Add merch mockups into <code>universe_assets</code> (status=published). Use asset_type like{" "}
              <code>merch</code> / <code>mockup</code> / <code>tshirt</code>, or title tags like “t-shirt”, “hoodie”.
            </div>
          </div>
        )}
      </section>

      {/* IP VAULT */}
      <SectionIntro
        id="vault"
        kicker="IP Vault"
        title="Adaptation Assets"
        lead="Package components for partners, buyers, and serious option conversations."
        tone="warm"
        align="center"
      />

      <section className="container mx-auto px-4 pb-14 -mt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {producerPacket ? (
            <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm p-6">
              <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Gated</div>
              <div className="text-xl font-bold mt-2">Producer Packet</div>
              <p className="opacity-80 mt-2">
                Deck + positioning + world overview (delivered on request).
              </p>
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

          {audioAssets.length ? (
            <Card title="Audio Package" description="Themes + cues for trailer identity and tone lock.">
              <a className="underline" href="#audio">
                Open audio →
              </a>
            </Card>
          ) : null}
        </div>
      </section>

      {/* CREDITS */}
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

      {/* CONTACT */}
      <section className="container mx-auto px-4 pb-20" id="contact">
        <div className="text-center">
          <div className="text-3xl font-bold">Options / Licensing</div>
          <div className="opacity-80 mt-2">Company • budget • timeline</div>

          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <a
              href={producerEmailHref}
              className="px-6 py-3 rounded-2xl bg-black text-white dark:bg-white dark:text-black font-semibold"
            >
              Email Studios →
            </a>
            <Link
              href="/studios"
              className="px-6 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40"
            >
              Back to Library
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
