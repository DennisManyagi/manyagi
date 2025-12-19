// pages/studios/[slug].js
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Hero from "@/components/Hero";
import Card from "@/components/Card";
import SectionIntro from "@/components/SectionIntro";
import { supabase } from "@/lib/supabase";

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

function YoutubeEmbed({ url }) {
  const id = getYoutubeId(url);
  if (!id) return null;

  return (
    <div className="rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm bg-black">
      <iframe
        className="w-full h-[420px]"
        src={`https://www.youtube.com/embed/${id}`}
        title="Trailer"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

function SpotifyEmbed({ url }) {
  if (!url || !url.includes("spotify.com")) return null;
  const embedUrl = url.replace("open.spotify.com/", "open.spotify.com/embed/");
  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
      <iframe
        src={embedUrl}
        width="100%"
        height="352"
        frameBorder="0"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        title="Spotify"
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

// Minimal render (safe + paste-friendly). If you want full markdown later, swap to react-markdown.
function renderPlainMarkdown(md = "") {
  const text = String(md || "");
  const lines = text.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        // tiny quality: treat headings visually if user uses # ## ###
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

export default function StudioUniverse() {
  const router = useRouter();
  const { slug } = router.query;

  const [universe, setUniverse] = useState(null);
  const [assets, setAssets] = useState([]);
  const [studioPages, setStudioPages] = useState([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    (async () => {
      setLoading(true);

      const { data: u, error: uErr } = await supabase
        .from("universes")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (uErr) console.error(uErr);
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
          .order("sort_order", { ascending: true }),

        supabase
          .from("studio_pages")
          .select("*")
          .eq("universe_id", u.id)
          .eq("status", "published")
          .order("sort_order", { ascending: true })
          .order("updated_at", { ascending: false }),
      ]);

      if (aErr) console.error(aErr);
      setAssets(a || []);

      if (pErr) console.error(pErr);
      setStudioPages(pages || []);

      setLoading(false);
    })();
  }, [slug]);

  const heroImages = useMemo(() => {
    const thumbs = assets.map((x) => x.thumbnail_url).filter(Boolean).slice(0, 6);
    if (thumbs.length) return thumbs;
    if (universe?.cover_image_url) return [universe.cover_image_url];
    return ["/images/og-home.webp"];
  }, [assets, universe]);

  const trailerAsset = useMemo(() => {
    return (
      assets.find((x) => String(x.asset_type || "").toLowerCase() === "trailer") ||
      assets.find((x) => String(x?.metadata?.media_type || "").toLowerCase() === "trailer") ||
      assets.find((x) => String(x?.media_type || "").toLowerCase() === "trailer") ||
      assets.find((x) => String(x.asset_type || "").toLowerCase() === "video") ||
      null
    );
  }, [assets]);

  const trailerUrl = useMemo(() => {
    return trailerAsset?.file_url || trailerAsset?.external_url || universe?.hero_video_url || null;
  }, [trailerAsset, universe]);

  const soundtrackAsset = useMemo(() => {
    return (
      assets.find((x) => String(x.asset_type || "").toLowerCase() === "soundtrack") ||
      assets.find((x) => String(x?.metadata?.media_type || "").toLowerCase() === "playlist") ||
      assets.find((x) => String(x?.media_type || "").toLowerCase() === "playlist") ||
      assets.find((x) => String(x.division || "").toLowerCase() === "media") ||
      null
    );
  }, [assets]);

  const soundtrackUrl = useMemo(() => {
    return soundtrackAsset?.external_url || soundtrackAsset?.file_url || soundtrackAsset?.metadata?.media_url || "";
  }, [soundtrackAsset]);

  const visualAssets = useMemo(() => {
    return assets.filter((a) => {
      const t = String(a.asset_type || "").toLowerCase();
      const div = String(a.division || "").toLowerCase();
      return ["image", "art", "still", "poster"].includes(t) || div === "designs";
    });
  }, [assets]);

  // =========================
  // ✅ NEW: Character Assets (Phase 4)
  // Supports:
  // - asset_type = "character"
  // - OR metadata.kind = "character" (so you can use image + metadata too)
  // =========================
  const characterAssets = useMemo(() => {
    return assets.filter((a) => {
      const t = String(a.asset_type || "").toLowerCase();
      const kind = String(a?.metadata?.kind || "").toLowerCase();
      return t === "character" || kind === "character";
    });
  }, [assets]);

  // =========================
  // ✅ NEW: World Map Assets (gallery + featured URL)
  // =========================
  const worldMapAssets = useMemo(() => {
    return assets
      .filter((a) => String(a.asset_type || "").toLowerCase() === "world_map")
      .filter((a) => (a.thumbnail_url || a.external_url)); // avoid empty rows
  }, [assets]);

  const featuredWorldMapUrl = useMemo(() => {
    // keep compatibility with your universes.world_map_url
    return universe?.world_map_url || null;
  }, [universe]);

  const hasWorldMapSection = useMemo(() => {
    return worldMapAssets.length > 0 || Boolean(featuredWorldMapUrl);
  }, [worldMapAssets.length, featuredWorldMapUrl]);

  const producerPacket = useMemo(() => {
    return (
      assets.find(
        (x) =>
          String(x.division || "").toLowerCase() === "studios" &&
          x.is_public === false &&
          Number(x.price_cents || 0) > 0
      ) || null
    );
  }, [assets]);

  const nftAssets = useMemo(() => {
    return assets.filter((a) => String(a.asset_type || "").toLowerCase() === "nft" || a?.metadata?.nft_url);
  }, [assets]);

  const producerEmailHref = useMemo(() => {
    if (!universe?.title || !universe?.slug) return "mailto:studios@manyagi.net";
    const subject = `Option / Licensing Inquiry — ${universe.title}`;
    const body =
      `Universe: ${universe.title}\n` +
      `Link: https://manyagi.net/studios/${universe.slug}\n\n` +
      `Company:\nRole:\nBudget Range:\nTimeline:\nNotes:\n`;
    return `mailto:studios@manyagi.net?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [universe]);

  const quickSignals = useMemo(() => {
    const signals = [];
    if (trailerUrl) signals.push("Trailer");
    if (visualAssets.length) signals.push(`${visualAssets.length} Visuals`);
    if (characterAssets.length) signals.push(`${characterAssets.length} Characters`);
    if (hasWorldMapSection) signals.push("World Map");
    if (producerPacket) signals.push("Producer Packet");
    if (soundtrackUrl) signals.push("Soundtrack");
    if (nftAssets.length) signals.push("NFT / Collectibles");
    if (studioPages.length) signals.push(`${studioPages.length} Studio Pages`);
    return signals;
  }, [
    trailerUrl,
    visualAssets.length,
    characterAssets.length,
    hasWorldMapSection,
    producerPacket,
    soundtrackUrl,
    nftAssets.length,
    studioPages.length,
  ]);

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
    ...(studioPages.length ? [{ href: "#studio-pages", label: "Studio Pages" }] : []),
    ...(characterAssets.length ? [{ href: "#characters", label: "Characters" }] : []), // ✅ NEW
    { href: "#trailer", label: "Trailer" },
    ...(hasWorldMapSection ? [{ href: "#world-map", label: "World Map" }] : []),
    { href: "#visuals", label: "Visuals" },
    { href: "#vault", label: "IP Vault" },
    { href: "#contact", label: "Options" },
  ];

  return (
    <>
      <Head>
        <title>{universe.title} — Manyagi Studios</title>
        <meta name="description" content={universe.logline || universe.tagline || "A Manyagi Studios Universe."} />
      </Head>

      <Hero
        kicker="Manyagi Studios"
        title={universe.title}
        lead={universe.logline || universe.tagline || "A prestige universe engineered for adaptation."}
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
          <a
            href="#vault"
            className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Enter IP Vault
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
        title="What this is, why it wins, and how it expands"
        lead="A clean, pitch-ready overview — the same structure a producer expects when scanning for optionable IP."
        tone="warm"
      />

      <section className="container mx-auto px-4 pb-12 -mt-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: core story */}
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
            <p className="mt-2 text-base opacity-90">{universe.logline || "A hidden bloodline awakens…"}</p>

            <h3 className="text-2xl font-bold mt-6">Synopsis</h3>
            <p className="mt-2 opacity-90 leading-relaxed">
              {universe.synopsis || "Add a studio-grade synopsis in Admin → Universes."}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
              <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 p-4">
                <div className="text-xs opacity-60 uppercase tracking-wider">Tone</div>
                <div className="font-semibold mt-1">Prestige • Cinematic • Mythic</div>
              </div>
              <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 p-4">
                <div className="text-xs opacity-60 uppercase tracking-wider">Format Fit</div>
                <div className="font-semibold mt-1">Series / Feature / Animation</div>
              </div>
              <div className="rounded-2xl border border-gray-200/70 dark:border-gray-800 bg-white/60 dark:bg-gray-950/30 p-4">
                <div className="text-xs opacity-60 uppercase tracking-wider">Why Now</div>
                <div className="font-semibold mt-1">IP-driven worlds win</div>
              </div>
            </div>
          </div>

          {/* Right: executive scan panel */}
          <div className="rounded-3xl bg-white/80 dark:bg-gray-900/70 border border-amber-100/80 dark:border-gray-800 shadow-sm p-6 md:p-8">
            <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Executive Scan</div>
            <h3 className="text-xl font-bold mt-2">At a glance</h3>

            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Universe</div>
                <div className="text-sm font-semibold text-right">{universe.title}</div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Trailer</div>
                <div className="text-sm font-semibold text-right">{trailerUrl ? "Available" : "Coming soon"}</div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Characters</div>
                <div className="text-sm font-semibold text-right">
                  {characterAssets.length ? `${characterAssets.length} cards` : "Add cast"}
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">World Map</div>
                <div className="text-sm font-semibold text-right">{hasWorldMapSection ? "Available" : "Add maps"}</div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Visuals</div>
                <div className="text-sm font-semibold text-right">
                  {visualAssets.length ? `${visualAssets.length} assets` : "Add visuals"}
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Producer Packet</div>
                <div className="text-sm font-semibold text-right">{producerPacket ? "Gated" : "Enable in assets"}</div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div className="text-sm opacity-70">Studio Pages</div>
                <div className="text-sm font-semibold text-right">
                  {studioPages.length ? `${studioPages.length} published` : "Add pages"}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-black text-white dark:bg-white dark:text-black p-4">
              <div className="text-sm font-semibold">Options / Licensing</div>
              <div className="text-xs opacity-80 mt-1">Serious inquiries: company + budget + timeline.</div>
              <a
                href={producerEmailHref}
                className="mt-4 inline-flex w-full justify-center px-4 py-2 rounded-xl bg-amber-200 text-amber-950 font-semibold hover:bg-amber-300 transition"
              >
                Request Conversation
              </a>
            </div>

            <div className="mt-4 text-xs opacity-60">Tip: Add “Comparable Titles” + “World Bible” pages to increase optionability.</div>
          </div>
        </div>
      </section>

      {/* STUDIO PAGES (NEW) */}
      {studioPages.length ? (
        <>
          <SectionIntro
            id="studio-pages"
            kicker="Studio Package"
            title="Pages & Documents"
            lead="Paste-ready producer materials: one-sheet, bible, press kit, negotiation scripts."
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

      {/* ========================= */}
      {/* ✅ NEW: CHARACTERS SECTION */}
      {/* Place: after One-Sheet and Studio Pages, before World Map (best flow) */}
      {/* ========================= */}
      {characterAssets.length ? (
        <>
          <SectionIntro
            id="characters"
            kicker="Cast"
            title="Characters"
            lead="Key characters, roles, and portraits for pitch + deck continuity."
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
                  {c.thumbnail_url ? (
                    <img
                      src={c.thumbnail_url}
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

                    {/* Optional: if you store role/name in metadata, we show a tiny hint without breaking anything */}
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

      {/* TRAILER (premium block) */}
      {trailerUrl ? (
        <>
          <SectionIntro
            id="trailer"
            kicker="The Hook"
            title="Trailer / Sizzle"
            lead="The fastest way to feel the world — tone, scale, and momentum in one watch."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            <div className="rounded-[28px] overflow-hidden border border-gray-200 dark:border-gray-800 bg-black shadow-sm">
              {isYoutube(trailerUrl) ? (
                <YoutubeEmbed url={trailerUrl} />
              ) : (
                <video src={trailerUrl} controls playsInline className="w-full h-[480px] object-cover bg-black" />
              )}
            </div>

            <div className="mt-4 flex gap-3 flex-wrap justify-center">
              {hasWorldMapSection ? (
                <a
                  href="#world-map"
                  className="px-5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40"
                >
                  🗺️ World Map
                </a>
              ) : null}
              {characterAssets.length ? (
                <a
                  href="#characters"
                  className="px-5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40"
                >
                  🧑‍🤝‍🧑 Characters
                </a>
              ) : null}
              <a href="#visuals" className="px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black">
                🎴 Visuals
              </a>
              <a
                href="#vault"
                className="px-5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40"
              >
                🔒 IP Vault
              </a>
              <a href={producerEmailHref} className="px-5 py-2 rounded-xl bg-amber-200 text-amber-950 font-semibold">
                💼 Options
              </a>
            </div>
          </section>
        </>
      ) : null}

      {/* ========================= */}
      {/* ✅ WORLD MAP SECTION */}
      {/* ========================= */}
      {hasWorldMapSection ? (
        <>
          <SectionIntro
            id="world-map"
            kicker="World"
            title="World Map"
            lead="A visual overview of the geography, zones, and major regions."
            tone="neutral"
            align="center"
          />

          <section className="container mx-auto px-4 pb-14 -mt-6">
            {/* If you have a featured world map URL but no gallery yet, show it first */}
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

            {/* Scroll carousel (for universe_assets rows asset_type=world_map) */}
            {worldMapAssets.length ? (
              <>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 snap-x snap-mandatory">
                  {worldMapAssets.map((m) => (
                    <div
                      key={m.id}
                      className="snap-center shrink-0 w-[92%] md:w-[70%] rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm"
                    >
                      <img
                        src={m.thumbnail_url || m.external_url}
                        alt={m.title || "World map"}
                        className="w-full h-[420px] object-cover"
                        loading="lazy"
                      />
                      <div className="p-4">
                        <div className="font-semibold">{m.title || "World Map"}</div>
                        {m.description ? <div className="text-sm opacity-70 mt-1">{m.description}</div> : null}
                        {m.external_url || m.thumbnail_url ? (
                          <a
                            className="text-sm underline mt-3 inline-block"
                            href={m.external_url || m.thumbnail_url}
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

                {/* Grid fallback / quick browse */}
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {worldMapAssets.slice(0, 6).map((m) => (
                    <a
                      key={`grid-${m.id}`}
                      href={m.external_url || m.thumbnail_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm"
                    >
                      <img
                        src={m.thumbnail_url || m.external_url}
                        alt={m.title || "World map"}
                        className="w-full h-48 object-cover"
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </>
      ) : null}

      {/* VISUALS */}
      <SectionIntro
        id="visuals"
        kicker="Look & Feel"
        title="Visual Identity"
        lead="Posters, scenes, merch mockups, world art — everything a studio uses to instantly picture the adaptation."
        tone="neutral"
        align="center"
      />
      <section className="container mx-auto px-4 pb-14 -mt-6">
        {visualAssets.length ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {visualAssets.slice(0, 9).map((a) => (
              <div
                key={a.id}
                className="rounded-3xl overflow-hidden border border-gray-200/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm"
              >
                {a.thumbnail_url ? (
                  <img src={a.thumbnail_url} alt={a.title || ""} className="w-full h-56 object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-56 bg-gray-100 dark:bg-gray-800" />
                )}
                <div className="p-4">
                  <div className="font-semibold">{a.title || "Asset"}</div>
                  <div className="text-xs opacity-70 mt-1">{String(a.asset_type || "visual").toUpperCase()}</div>
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
            <div className="text-lg font-bold">No visuals yet</div>
            <div className="opacity-80 mt-2">
              Add image/poster assets to <code>universe_assets</code> with <code>status=published</code>.
            </div>
          </div>
        )}
      </section>

      {/* SOUNDTRACK */}
      {soundtrackUrl ? (
        <>
          <SectionIntro
            kicker="Sound"
            title="Official Soundtrack"
            lead="Audio helps a producer feel tone instantly — especially for fantasy/sci-fi worlds."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-14 -mt-6">
            {soundtrackUrl.includes("spotify") ? (
              <SpotifyEmbed url={soundtrackUrl} />
            ) : isYoutube(soundtrackUrl) ? (
              <YoutubeEmbed url={soundtrackUrl} />
            ) : (
              <a className="underline" href={soundtrackUrl} target="_blank" rel="noreferrer">
                Listen to Soundtrack →
              </a>
            )}
          </section>
        </>
      ) : null}

      {/* IP VAULT */}
      <SectionIntro
        id="vault"
        kicker="IP Vault"
        title="Adaptation Assets"
        lead="These are the items producers ask for: packets, decks, lore, collectibles, and business-ready artifacts."
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
                Pitch-ready option/licensing package (deck + world overview + adaptation positioning).
              </p>
              <div className="mt-4 rounded-2xl bg-amber-200 text-amber-950 p-4">
                <div className="text-sm font-semibold">Request access</div>
                <div className="text-xs opacity-80">Email includes budget + timeline.</div>
                <a
                  href={producerEmailHref}
                  className="mt-3 inline-flex w-full justify-center px-4 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black font-semibold"
                >
                  Request Option / Licensing
                </a>
              </div>
            </div>
          ) : (
            <Card title="Producer Packet" description="Enable this by adding a studios asset with is_public=false and price_cents>0.">
              <div className="text-sm opacity-70">Currently not configured.</div>
            </Card>
          )}

          {nftAssets.map((a) => (
            <Card key={a.id} title={a.title || "NFT / Collectible"} description="Limited edition collectible with unlockables.">
              {a.metadata?.nft_url ? (
                <a className="underline" href={a.metadata.nft_url} target="_blank" rel="noreferrer">
                  View NFT →
                </a>
              ) : (
                <div className="text-sm opacity-70">Add metadata.nft_url to link.</div>
              )}
            </Card>
          ))}

          {soundtrackUrl ? (
            <Card title="Soundtrack Package" description="Commercial-ready audio identity and licensing link.">
              <a className="underline" href={soundtrackUrl} target="_blank" rel="noreferrer">
                Open soundtrack →
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
              <div className="text-2xl font-bold mt-1">Creator & Credits</div>
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
              <div className="text-xs opacity-60 uppercase tracking-wider">World / Visuals</div>
              <div className="font-semibold mt-1">Manyagi Studios</div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="container mx-auto px-4 pb-20" id="contact">
        <div className="text-center">
          <div className="text-3xl font-bold">Request Option / Licensing</div>
          <div className="opacity-80 mt-2">Serious inquiries only • include company + budget + timeline</div>

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
