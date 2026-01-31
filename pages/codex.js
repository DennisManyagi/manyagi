// pages/codex.js
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Hero from '@/components/Hero';
import SectionIntro from '@/components/SectionIntro';

function norm(s = "") {
  return String(s || "").toLowerCase().trim();
}

function pickLoreArt(entry, metaById) {
  return (
    entry?.featured_image ||
    metaById?.[entry.id]?.heroThumb ||
    metaById?.[entry.id]?.visualThumb ||
    "/images/og-home.webp"
  );
}

function getLoreBlurb(entry) {
  return (
    entry?.excerpt ||
    entry?.content?.slice(0, 150) + '...' ||
    "Dive into the eternal canon of the Manyagi Universe."
  );
}

function guessCategory(entry) {
  return entry.metadata?.category || 'Uncategorized';
}

function RailRow({ title, subtitle, items, q }) {
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

      {/* Horizontal scroll rail */}
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
        {items.map((entry) => {
          const art = pickLoreArt(entry);
          const category = guessCategory(entry);

          return (
            <Link
              key={entry.id}
              href={`/codex/${entry.slug}`}
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

                {/* Category chip */}
                <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
                  <span className="text-[11px] px-2 py-1 rounded-full bg-white/90 text-black font-semibold">
                    {category}
                  </span>
                </div>

                {/* Title */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="text-[11px] tracking-[0.28em] uppercase text-white/70">
                    Lore Entry
                  </div>
                  <div className="text-xl font-bold text-white leading-tight">
                    {entry.title}
                  </div>
                </div>
              </div>

              <div className="p-5">
                <p className="text-sm opacity-80 line-clamp-3">
                  {getLoreBlurb(entry)}
                </p>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold underline">
                    Access Entry →
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

export default function ResonanceCodex() {
  const [entries, setEntries] = useState([]);
  const [universes, setUniverses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: loreData }, { data: universeData }] = await Promise.all([
        supabase.from('posts').select('*').eq('division', 'lore').eq('status', 'published').order('created_at', { ascending: false }),
        supabase.from('universes').select('*').eq('status', 'published').order('updated_at', { ascending: false }),
      ]);
      setEntries(loreData || []);
      setUniverses(universeData || []);
      setLoading(false);
    })();
  }, []);

  const filteredEntries = useMemo(() => {
    const query = norm(q);
    if (!query) return entries;

    return (entries || []).filter((entry) => {
      const blob = [entry.title, entry.slug, entry.excerpt, entry.content, entry.metadata?.category, entry.metadata?.universe_id]
        .map(norm)
        .join(" ");
      return blob.includes(query);
    });
  }, [entries, q]);

  const rails = useMemo(() => {
    const base = filteredEntries || [];

    // Group by categories
    const byCategory = {};
    base.forEach((entry) => {
      const cat = guessCategory(entry);
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(entry);
    });

    // Group by universes
    const byUniverse = {};
    base.forEach((entry) => {
      const uniId = entry.metadata?.universe_id || 'uncategorized';
      if (!byUniverse[uniId]) byUniverse[uniId] = [];
      byUniverse[uniId].push(entry);
    });

    // Example rails: Recent, By Category, By Universe
    const recent = base.slice(0, 12);

    return {
      recent,
      byCategory,
      byUniverse,
    };
  }, [filteredEntries]);

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
        <title>The Resonance Codex — Manyagi Archives</title>
        <meta name="description" content="The official repository of Manyagi Universe logic, history, and dossiers." />
      </Head>

      <Hero 
        kicker="Manyagi Archives" 
        title="The Resonance Codex" 
        lead="Declassified logic and chronicles from the expanding Manyagi ecosystem. Explore by universe, category, or search for immersive fan experiences."
        videoSrc="/videos/resonance-bg.mp4" // Looping Exile Portal
        height="h-[500px]"
        carouselImages={carouselImages}
      >
        <div className="flex flex-wrap gap-3 justify-center">
          <a
            href="#browse"
            className="btn bg-black text-white py-2 px-4 rounded hover:scale-105 transition dark:bg-white dark:text-black"
          >
            Browse Lore
          </a>
        </div>
      </Hero>

      {/* Search Bar */}
      <section className="container mx-auto px-4 pb-10 -mt-4">
        <div className="rounded-3xl bg-white/80 dark:bg-gray-900/75 border border-amber-100/80 dark:border-gray-800 shadow-sm px-4 md:px-6 py-5">
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div>
              <div className="text-sm opacity-70">Browse Lore</div>
              <div className="text-2xl font-bold">Codex Library</div>
              <div className="text-xs opacity-70 mt-1">
                Showing <span className="font-semibold">{filteredEntries.length}</span>{" "}
                of <span className="font-semibold">{entries.length}</span>
              </div>
            </div>

            <div className="flex gap-2 w-full md:w-[520px]">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search lore titles, categories, universes…"
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
          <div className="opacity-70">Loading Codex…</div>
        </section>
      ) : entries.length === 0 ? (
        <section className="container mx-auto px-4 pb-16">
          <div className="rounded-3xl border border-gray-200 dark:border-gray-800 p-8 bg-white/70 dark:bg-gray-900/50">
            <div className="text-xl font-bold">No lore entries published yet</div>
            <p className="opacity-80 mt-2">
              Create one in Admin → Archives, then set status to published.
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
          {/* Recent Lore Rail */}
          <RailRow
            title="Recent Entries"
            subtitle="Newly declassified lore"
            items={rails.recent}
            q={q}
          />

          {/* Rails by Category */}
          {Object.keys(rails.byCategory).map((cat) => (
            <RailRow
              key={cat}
              title={`${cat} Entries`}
              subtitle={`Explore ${cat.toLowerCase()} lore`}
              items={rails.byCategory[cat]}
              q={q}
            />
          ))}

          {/* Rails by Universe */}
          {Object.keys(rails.byUniverse).map((uniId) => {
            const universe = universes.find(u => u.id === uniId) || { title: 'Uncategorized' };
            return (
              <RailRow
                key={uniId}
                title={`${universe.title} Lore`}
                subtitle={`Chronicles from the ${universe.title} universe`}
                items={rails.byUniverse[uniId]}
                q={q}
              />
            );
          })}

          {/* Full Grid Fallback */}
          <section className="container mx-auto px-4 pb-16">
            <div className="mt-2 mb-5 text-sm opacity-70">
              Full Codex
            </div>
            {filteredEntries.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center bg-white/70 dark:bg-gray-900/50">
                <div className="text-lg font-bold">No matches</div>
                <div className="opacity-80 mt-2">Try a different search term.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {filteredEntries.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/codex/${entry.slug}`}
                    className="group rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition bg-white/70 dark:bg-gray-900/50"
                  >
                    <div className="relative h-48">
                      <img
                        src={pickLoreArt(entry)}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-tr from-black/55 to-transparent" />
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="text-[11px] tracking-[0.28em] uppercase text-white/80">
                          Lore Entry
                        </div>
                        <div className="text-xl font-bold text-white">
                          {entry.title}
                        </div>
                      </div>
                    </div>

                    <div className="p-5">
                      <p className="text-sm opacity-80 line-clamp-3">
                        {getLoreBlurb(entry)}
                      </p>

                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-sm font-semibold underline">
                          Access →
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