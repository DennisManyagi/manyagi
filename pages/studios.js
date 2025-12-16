// pages/studios.js
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Hero from "@/components/Hero";
import SectionIntro from "@/components/SectionIntro";
import { supabase } from "@/lib/supabase";

function norm(s = "") {
  return String(s || "").toLowerCase().trim();
}

function pickUniverseArt(u, metaById) {
  return (
    u?.cover_image_url ||
    metaById?.[u.id]?.heroThumb ||
    metaById?.[u.id]?.visualThumb ||
    "/images/og-home.webp"
  );
}

function getUniverseBlurb(u) {
  return (
    u?.logline ||
    u?.tagline ||
    u?.synopsis ||
    "A premium, cinematic universe built for adaptation and expansion."
  );
}

function guessGenre(u) {
  const blob = [u?.title, u?.tagline, u?.logline, u?.synopsis].map(norm).join(" ");
  const hits = [];
  if (blob.includes("sci") || blob.includes("cyber") || blob.includes("future") || blob.includes("space")) hits.push("Sci-Fi");
  if (blob.includes("magic") || blob.includes("dragon") || blob.includes("kingdom") || blob.includes("myth")) hits.push("Fantasy");
  if (blob.includes("dystop") || blob.includes("war") || blob.includes("survival")) hits.push("Dystopian");
  if (blob.includes("horror") || blob.includes("demon") || blob.includes("curse")) hits.push("Dark");
  if (blob.includes("crime") || blob.includes("detective") || blob.includes("heist")) hits.push("Crime");
  if (blob.includes("romance")) hits.push("Romance");
  return hits.slice(0, 2);
}

function RailRow({ title, subtitle, items, metaById, q }) {
  if (!items?.length) return null;

  return (
    <section className="container mx-auto px-4 pb-10">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <div className="text-sm opacity-70">{subtitle}</div>
          <h3 className="text-xl md:text-2xl font-bold">{title}</h3>
        </div>
        {q ? (
          <div className="text-xs opacity-70">Filtered by “{q}”</div>
        ) : null}
      </div>

      {/* Netflix-ish rail */}
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
        {items.map((u) => {
          const m = metaById?.[u.id] || {};
          const art = pickUniverseArt(u, metaById);
          const genres = guessGenre(u);

          return (
            <Link
              key={u.id}
              href={`/studios/${u.slug}`}
              className="group min-w-[280px] sm:min-w-[320px] md:min-w-[360px] rounded-3xl overflow-hidden border border-gray-200/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm hover:shadow-md transition"
            >
              <div className="relative h-44">
                <img
                  src={art}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/65 via-black/20 to-transparent" />

                {/* Top chips */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                  <div className="flex gap-2 flex-wrap">
                    {m.hasTrailer ? (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-white/90 text-black font-semibold">
                        ▶ Trailer
                      </span>
                    ) : null}
                    {m.hasPacket ? (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-amber-200 text-amber-900 font-semibold">
                        💼 Producer Ready
                      </span>
                    ) : null}
                    {m.visualCount > 0 ? (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-white/15 text-white border border-white/20">
                        🎴 {m.visualCount} Visuals
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-white/70">
                    {u?.updated_at ? `Updated` : ""}
                  </div>
                </div>

                {/* Title */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="text-[11px] tracking-[0.28em] uppercase text-white/70">
                    Universe
                  </div>
                  <div className="text-xl font-bold text-white leading-tight">
                    {u.title}
                  </div>
                </div>
              </div>

              <div className="p-5">
                {/* Genres */}
                {genres.length ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {genres.map((g) => (
                      <span
                        key={g}
                        className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                ) : null}

                <p className="text-sm opacity-80 line-clamp-3">
                  {getUniverseBlurb(u)}
                </p>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold underline">
                    Open →
                  </span>
                  <span className="text-xs opacity-60">
                    {m.hasPacket ? "Optionable" : "Explore"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Studios() {
  const [universes, setUniverses] = useState([]);
  const [metaById, setMetaById] = useState({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: u, error: uErr } = await supabase
        .from("universes")
        .select("*")
        .eq("status", "published")
        .order("updated_at", { ascending: false });

      if (uErr) console.error(uErr);

      const list = u || [];
      setUniverses(list);

      // Pull lightweight asset signals to power “Netflix rails”
      if (list.length) {
        const ids = list.map((x) => x.id);

        const { data: a, error: aErr } = await supabase
          .from("universe_assets")
          .select("id, universe_id, asset_type, division, thumbnail_url, file_url, external_url, is_public, price_cents, status, metadata")
          .in("universe_id", ids)
          .eq("status", "published");

        if (aErr) console.error(aErr);

        const by = {};
        (a || []).forEach((asset) => {
          const uid = asset.universe_id;
          if (!by[uid]) {
            by[uid] = {
              hasTrailer: false,
              hasPacket: false,
              visualCount: 0,
              heroThumb: null,
              visualThumb: null,
            };
          }

          const t = String(asset.asset_type || "").toLowerCase();
          const div = String(asset.division || "").toLowerCase();
          const mediaType =
            String(asset?.metadata?.media_type || "").toLowerCase() ||
            String(asset?.metadata?.type || "").toLowerCase();

          const isTrailer =
            t === "trailer" || mediaType === "trailer" || t === "video";

          const isVisual =
            ["image", "art", "still", "poster"].includes(t) ||
            div === "designs";

          if (isTrailer) by[uid].hasTrailer = true;

          if (isVisual) {
            by[uid].visualCount += 1;
            if (!by[uid].visualThumb && asset.thumbnail_url) {
              by[uid].visualThumb = asset.thumbnail_url;
            }
          }

          // Producer packet = studios division + gated + priced
          if (
            div === "studios" &&
            asset.is_public === false &&
            Number(asset.price_cents || 0) > 0
          ) {
            by[uid].hasPacket = true;
          }

          // a “hero thumb” preference (any thumbnail helps)
          if (!by[uid].heroThumb && asset.thumbnail_url) {
            by[uid].heroThumb = asset.thumbnail_url;
          }
        });

        setMetaById(by);
      } else {
        setMetaById({});
      }

      setLoading(false);
    })();
  }, []);

  const featured = useMemo(() => {
    const list = universes || [];
    const flagged = list.find((u) => u.is_featured);
    return flagged || list[0] || null;
  }, [universes]);

  const filtered = useMemo(() => {
    const query = norm(q);
    if (!query) return universes;

    return (universes || []).filter((u) => {
      const blob = [u.title, u.slug, u.tagline, u.logline, u.synopsis]
        .map(norm)
        .join(" ");
      return blob.includes(query);
    });
  }, [universes, q]);

  const rails = useMemo(() => {
    const base = filtered || [];

    // Producer-ready
    const producerReady = base.filter((u) => metaById?.[u.id]?.hasPacket);

    // Trailer-first
    const withTrailers = base.filter((u) => metaById?.[u.id]?.hasTrailer);

    // New & updated (already sorted by updated_at from DB)
    const newUpdated = base.slice(0, 12);

    // Visual heavy
    const visualHeavy = [...base]
      .sort((a, b) => (metaById?.[b.id]?.visualCount || 0) - (metaById?.[a.id]?.visualCount || 0))
      .slice(0, 12);

    return {
      producerReady: producerReady.slice(0, 12),
      withTrailers: withTrailers.slice(0, 12),
      newUpdated,
      visualHeavy,
    };
  }, [filtered, metaById]);

  const carouselImages = useMemo(() => {
    return [
      "/images/video-carousel-1.webp",
      "/images/video-carousel-2.webp",
      "/images/video-carousel-3.webp",
    ];
  }, []);

  return (
    <>
      <Head>
        <title>Manyagi Studios — The IP Vault</title>
        <meta
          name="description"
          content="Hollywood-ready universes: trailers, decks, world bibles, and monetizable assets — curated per IP."
        />
      </Head>

      <Hero
        kicker="Manyagi Studios"
        title="The IP Vault"
        lead="Prestige worlds engineered for adaptation: trailers, decks, lore, and monetizable assets—organized like a studio slate."
        carouselImages={carouselImages}
        height="h-[650px]"
      >
        <div className="flex flex-wrap gap-3 justify-center">
          <a
            href="#browse"
            className="btn bg-black text-white py-2 px-4 rounded hover:scale-105 transition dark:bg-white dark:text-black"
          >
            Browse Universes
          </a>
          <a
            href="mailto:studios@manyagi.net?subject=Studios%20%7C%20Options%20%2F%20Licensing%20Inquiry"
            className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Licensing / Options
          </a>
        </div>
      </Hero>

      {/* MICRO-NAV (Disney+/Netflix style) */}
      <section className="container mx-auto px-4 -mt-8 mb-10" id="browse">
        <div className="flex gap-2 overflow-x-auto no-scrollbar justify-center text-xs md:text-[13px]">
          {[
            { href: "#featured", label: "Featured" },
            { href: "#producer-ready", label: "Producer Ready" },
            { href: "#trailers", label: "Trailers" },
            { href: "#new-updated", label: "New & Updated" },
            { href: "#visuals", label: "Visual Worlds" },
          ].map((item) => (
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
        kicker="Studio Slate"
        title="Built to Be Optioned"
        lead="Each universe is structured like a studio packet: a hook, a visual identity, and an expandable roadmap (film, series, animation, games, merch)."
        tone="warm"
      />

      {/* SEARCH / STATUS BAR */}
      <section className="container mx-auto px-4 pb-10 -mt-4">
        <div className="rounded-3xl bg-white/80 dark:bg-gray-900/75 border border-amber-100/80 dark:border-gray-800 shadow-sm px-4 md:px-6 py-5">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div>
              <div className="text-sm opacity-70">Browse Universes</div>
              <div className="text-2xl font-bold">Studios Library</div>
              <div className="text-xs opacity-70 mt-1">
                Showing <span className="font-semibold">{filtered.length}</span>{" "}
                of <span className="font-semibold">{universes.length}</span>
              </div>
            </div>

            <div className="flex gap-2 w-full md:w-[520px]">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search universes, themes, worlds…"
                className="w-full border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2 bg-white/80 dark:bg-gray-950/60"
              />
              {q ? (
                <button
                  onClick={() => setQ("")}
                  className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-800"
                  aria-label="Clear search"
                  title="Clear"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="container mx-auto px-4 pb-16">
          <div className="opacity-70">Loading Studios…</div>
        </section>
      ) : universes.length === 0 ? (
        <section className="container mx-auto px-4 pb-16">
          <div className="rounded-3xl border border-gray-200 dark:border-gray-800 p-8 bg-white/70 dark:bg-gray-900/50">
            <div className="text-xl font-bold">No universes published yet</div>
            <p className="opacity-80 mt-2">
              Create one in Admin → Universes, then set <code>status</code> to{" "}
              <code>published</code>.
            </p>
            <div className="mt-6">
              <Link
                href="/admin"
                className="px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black inline-block"
              >
                Go to Admin →
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* FEATURED BANNER (big, cinematic) */}
          {featured ? (
            <section className="container mx-auto px-4 pb-10" id="featured">
              <div className="rounded-[28px] overflow-hidden border border-gray-200/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-sm">
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  <div className="p-7 md:p-10">
                    <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">
                      Featured Universe
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold mt-2 leading-tight">
                      {featured.title}
                    </h2>
                    <p className="mt-3 opacity-80 max-w-xl">
                      {getUniverseBlurb(featured)}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {metaById?.[featured.id]?.hasTrailer ? (
                        <span className="text-xs px-3 py-1 rounded-full bg-black text-white dark:bg-white dark:text-black">
                          ▶ Trailer Available
                        </span>
                      ) : null}
                      {metaById?.[featured.id]?.hasPacket ? (
                        <span className="text-xs px-3 py-1 rounded-full bg-amber-200 text-amber-900">
                          💼 Producer Packet (Gated)
                        </span>
                      ) : null}
                      {(guessGenre(featured) || []).map((g) => (
                        <span
                          key={g}
                          className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                          {g}
                        </span>
                      ))}
                    </div>

                    <div className="mt-7 flex gap-3 flex-wrap">
                      <Link
                        href={`/studios/${featured.slug}`}
                        className="px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black"
                      >
                        Enter Studio Page
                      </Link>

                      <a
                        href={`mailto:studios@manyagi.net?subject=${encodeURIComponent(
                          `Licensing / Options Inquiry — ${featured.title}`
                        )}`}
                        className="px-5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40"
                      >
                        Licensing / Options
                      </a>
                    </div>

                    <div className="text-xs opacity-60 mt-4">
                      Designed for pitch: hook + visuals + expansion potential.
                    </div>
                  </div>

                  <div className="relative min-h-[320px]">
                    <img
                      src={pickUniverseArt(featured, metaById)}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-black/70 via-black/15 to-transparent" />
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* RAILS */}
          <div id="producer-ready" />
          <RailRow
            title="Producer Ready"
            subtitle="Gated packets + licensing energy"
            items={rails.producerReady}
            metaById={metaById}
            q={q}
          />

          <div id="trailers" />
          <RailRow
            title="Trailers & Hooks"
            subtitle="Fastest way to feel the world"
            items={rails.withTrailers}
            metaById={metaById}
            q={q}
          />

          <div id="new-updated" />
          <RailRow
            title="New & Updated"
            subtitle="Recently refined universes"
            items={rails.newUpdated}
            metaById={metaById}
            q={q}
          />

          <div id="visuals" />
          <RailRow
            title="Visual Worlds"
            subtitle="Image-heavy universes"
            items={rails.visualHeavy}
            metaById={metaById}
            q={q}
          />

          {/* FALLBACK GRID (classic browse) */}
          <section className="container mx-auto px-4 pb-16">
            <div className="mt-2 mb-5 text-sm opacity-70">
              Full Library
            </div>
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center bg-white/70 dark:bg-gray-900/50">
                <div className="text-lg font-bold">No matches</div>
                <div className="opacity-80 mt-2">Try a different search term.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {filtered.map((u) => (
                  <Link
                    key={u.id}
                    href={`/studios/${u.slug}`}
                    className="group rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition bg-white/70 dark:bg-gray-900/50"
                  >
                    <div className="relative h-48">
                      <img
                        src={pickUniverseArt(u, metaById)}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-tr from-black/55 to-transparent" />
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="text-[11px] tracking-[0.28em] uppercase text-white/80">
                          Universe
                        </div>
                        <div className="text-xl font-bold text-white">
                          {u.title}
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      <p className="text-sm opacity-80 line-clamp-3">
                        {getUniverseBlurb(u)}
                      </p>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-sm font-semibold underline">
                          Open →
                        </div>
                        <div className="flex gap-2">
                          {metaById?.[u.id]?.hasTrailer ? (
                            <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800">
                              ▶
                            </span>
                          ) : null}
                          {metaById?.[u.id]?.hasPacket ? (
                            <span className="text-[11px] px-2 py-1 rounded-full bg-amber-200 text-amber-900">
                              💼
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
