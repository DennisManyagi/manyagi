// pages/designs.js
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useDispatch } from 'react-redux';
import { addToCart } from '../lib/cartSlice';
import SubscriptionForm from '../components/SubscriptionForm';
import Recommender from '../components/Recommender';
import Hero from '../components/Hero';
import Card from '../components/Card';
import SectionIntro from '../components/SectionIntro';

const PAGE_SIZE = 16;
const RAILS_LIMIT = 200; // larger pull just for rails

// Prefer higher-quality image fields when available
function pickImage(p) {
  return (
    (p?.thumbnail_url &&
      typeof p.thumbnail_url === 'string' &&
      p.thumbnail_url) ||
    (p?.display_image &&
      typeof p.display_image === 'string' &&
      p.display_image) ||
    (p?.image_url && typeof p.image_url === 'string' && p.image_url) ||
    (p?.image && typeof p.image === 'string' && p.image) ||
    '/placeholder.png' // CSP-safe local fallback
  );
}

// Simple shuffle for light randomization of rails
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Stable key for dedupe across rails
function productKey(p) {
  return p?.id || p?.slug || p?.sku || p?.name || '';
}

export default function Designs() {
  const router = useRouter();
  const dispatch = useDispatch();

  // Grid state (paged)
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  // Rails state (global, non-paged)
  const [railItems, setRailItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [railsLoading, setRailsLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const initial = useMemo(
    () => ({
      q: (router.query.q || '').toString(),
      collection: (router.query.collection || '').toString(),
      tag: (router.query.tag || '').toString(),
      sort: (router.query.sort || 'new').toString(),
    }),
    [router.query]
  );

  const [q, setQ] = useState(initial.q);
  const [collection, setCollection] = useState(initial.collection);
  const [tag, setTag] = useState(initial.tag);
  const [sort, setSort] = useState(initial.sort);

  const canLoadMore = items.length < total;

  const carouselImages = [
    'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/merch-carousel-1.webp',
    'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/merch-carousel-2.webp',
    'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/merch-carousel-3.webp',
    'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/merch-carousel-4.webp',
    'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/merch-carousel-5.webp',
  ];

  // --- GRID FETCH (paged, respects filters) ---
  const fetchProducts = async ({ offset = 0, append = false } = {}) => {
    const params = new URLSearchParams({
      division: 'designs',
      limit: String(PAGE_SIZE),
      offset: String(offset),
      sort: sort || 'new',
    });
    if (q) params.set('q', q);
    if (collection) params.set('collection', collection);
    if (tag) params.set('tag', tag);

    try {
      if (offset === 0) setLoading(true);
      else setFetchingMore(true);

      const res = await fetch(`/api/products?${params.toString()}`);
      const data = await res.json();

      const nextItemsRaw = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : [];

      const nextItems = nextItemsRaw.map((p) => ({
        ...p,
        display_image: pickImage(p),
      }));

      setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setTotal(Number(data?.total ?? nextItems.length));
    } catch (e) {
      console.error('Designs fetch error:', e);
      if (offset === 0) {
        const sample = [
          {
            id: 'fallback-tee',
            name: 'Sample T-Shirt',
            price: 29.99,
            display_image:
              'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/mock-tee-1.webp',
            division: 'designs',
            description:
              'Fallback design merchandise. Made with 100% cotton for comfort.',
            printful_product_id: 'fallback-tee-id',
            productType: 'merch',
            metadata: { book: 'Sample', prompt: 1 },
            slug: 'sample-t-shirt',
          },
        ];
        setItems(sample);
        setTotal(sample.length);
      }
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  };

  // --- RAIL FETCH (global, not paged, no filters; just used for rails) ---
  const fetchRailProducts = async () => {
    const params = new URLSearchParams({
      division: 'designs',
      limit: String(RAILS_LIMIT),
      offset: '0',
      sort: 'new',
    });

    try {
      setRailsLoading(true);
      const res = await fetch(`/api/products?${params.toString()}`);
      const data = await res.json();

      const raw = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : [];

      const normalized = raw.map((p) => ({
        ...p,
        display_image: pickImage(p),
      }));

      setRailItems(normalized);
    } catch (e) {
      console.error('Designs rails fetch error:', e);
      // Fallback: at least use whatever is already in the grid
      setRailItems((prev) => (prev.length ? prev : items));
    } finally {
      setRailsLoading(false);
    }
  };

  useEffect(() => {
    setQ(initial.q);
    setCollection(initial.collection);
    setTag(initial.tag);
    setSort(initial.sort || 'new');

    // fetch paged grid (respects filters)
    fetchProducts({ offset: 0, append: false });

    // Always keep rails based on the *global* pool, independent of filters
    // so NFTs, bestsellers, etc. can appear even if not on the first page.
    fetchRailProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.q, initial.collection, initial.tag, initial.sort]);

  const applyFilters = (e) => {
    e?.preventDefault?.();
    const params = new URLSearchParams();
    params.set('division', 'designs');
    if (q) params.set('q', q);
    if (collection) params.set('collection', collection);
    if (tag) params.set('tag', tag);
    if (sort) params.set('sort', sort);
    router.push(`/designs?${params.toString()}`, undefined, { shallow: true });
  };

  const clearFilters = () => {
    setQ('');
    setCollection('');
    setTag('');
    setSort('new');
    router.push('/designs?division=designs', undefined, { shallow: true });
  };

  const loadMore = () => {
    if (!canLoadMore || fetchingMore) return;
    fetchProducts({ offset: items.length, append: true });
  };

  const collectionOptions = useMemo(() => {
    const set = new Set();
    items.forEach((p) => {
      if (p?.metadata?.book) set.add(p.metadata.book);
      if (p?.metadata?.series) set.add(p.metadata.series);
      if (p?.metadata?.drop) set.add(p.metadata.drop);
      if (p?.metadata?.year) set.add(String(p.metadata.year));
      if (p?.metadata?.prompt) set.add(`prompt-${p.metadata.prompt}`);
    });
    return Array.from(set);
  }, [items]);

  const tagOptions = useMemo(() => {
    const set = new Set();
    items.forEach((p) => (p?.tags || []).forEach((t) => set.add(t)));
    return Array.from(set);
  }, [items]);

  const handleAddToCart = (product) => {
    dispatch(
      addToCart({
        ...product,
        productType: 'merch',
        printful_product_id: product.printful_product_id,
        metadata: product.metadata || {},
      })
    );
    setShowModal(true);
    setTimeout(() => setShowModal(false), 1600);
  };

  const filtersActive =
    q || collection || tag || (sort && sort !== 'new');

  // ---- Multi-rail derived slices (based on global railItems) ----
  const rails = useMemo(() => {
    const base = railItems.length ? railItems : items;
    const usedIds = new Set();

    const pickUnique = (candidates, limit) => {
      if (!candidates || !candidates.length || limit <= 0) return [];
      const out = [];
      const pool = shuffle(candidates);
      for (const p of pool) {
        const key = productKey(p);
        if (!key || usedIds.has(key)) continue;
        out.push(p);
        usedIds.add(key);
        if (out.length >= limit) break;
      }
      return out;
    };

    // Featured collections (drop/series/book), flagged via metadata or tags
    const featuredCandidatesMap = new Map();
    base.forEach((p) => {
      const m = p.metadata || {};
      const tags = p.tags || [];
      const isFeatured =
        m.featured_collection || tags.includes('featured_collection');
      if (!isFeatured) return;
      const label =
        m.drop || m.series || m.book || (m.year && String(m.year)) || p.name;
      if (!label) return;
      if (!featuredCandidatesMap.has(label)) {
        featuredCandidatesMap.set(label, p);
      }
    });
    const featuredCandidates = Array.from(featuredCandidatesMap.values());

    // NFTs (PRIORITY lane – make sure OpenSea URLs are always in here)
    const nftCandidates = base.filter((p) => {
      const m = p.metadata || {};
      const tags = (p.tags || []).map((t) => t.toLowerCase());
      const nftUrl = m.nft_url || m.nft_link || '';

      const hasOpenSea =
        typeof nftUrl === 'string' && nftUrl.includes('opensea.io');

      return (
        hasOpenSea ||
        m.nft ||
        tags.includes('nft') ||
        tags.includes('token') ||
        tags.includes('onchain')
      );
    });

    // Bestsellers (metadata or tag)
    const bestsellerCandidates = base.filter((p) => {
      const m = p.metadata || {};
      const tags = (p.tags || []).map((t) => t.toLowerCase());
      return m.bestseller || tags.includes('bestseller');
    });

    // Wall / studio art
    const wallArtCandidates = base.filter((p) => {
      const m = p.metadata || {};
      const tags = (p.tags || []).map((t) => t.toLowerCase());
      const type = String(m.product_type || '').toLowerCase();
      return (
        tags.includes('poster') ||
        tags.includes('print') ||
        tags.includes('wall_art') ||
        tags.includes('canvas') ||
        type === 'poster' ||
        type === 'print'
      );
    });

    // Under $25
    const under25Candidates = base.filter((p) => {
      const price = Number(p.price || p.metadata?.price);
      return price > 0 && price < 25;
    });

    // ORDER MATTERS:
    // 1) Featured collections
    // 2) NFTs (OpenSea & other on-chain)
    // 3) Bestsellers
    // 4) Wall art
    // 5) Under $25
    const featuredCollections = pickUnique(featuredCandidates, 4);
    const nftDesigns = pickUnique(nftCandidates, 8);
    const bestsellerDesigns = pickUnique(bestsellerCandidates, 8);
    const wallArtDesigns = pickUnique(wallArtCandidates, 8);
    const under25Designs = pickUnique(under25Candidates, 8);

    return {
      featuredCollections,
      nftDesigns,
      bestsellerDesigns,
      wallArtDesigns,
      under25Designs,
    };
  }, [railItems, items]);

  const {
    featuredCollections,
    nftDesigns,
    bestsellerDesigns,
    wallArtDesigns,
    under25Designs,
  } = rails;

  if (loading && railsLoading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        Loading designs…
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Manyagi Designs — Premium Apparel & Gear</title>
        <meta
          name="description"
          content="High-quality T-shirts, mugs, prints, and digital collectibles inspired by the Manyagi Universe. Exclusive drops, story-linked collections, and premium merch."
        />
      </Head>

      {/* HERO */}
      <Hero
        kicker="Manyagi Designs"
        title="Wear the Universe"
        lead="Story-linked apparel, posters, and gear forged from the worlds of the Manyagi Universe. Designed to feel like limited drops, not generic merch."
        carouselImages={carouselImages}
        height="h-[600px]"
      >
        <Link
          href="#products"
          className="btn bg-blue-600 text-white py-3 px-5 rounded hover:scale-105 transition"
        >
          Browse the Collection
        </Link>
      </Hero>

      {/* MICRO-NAV STRIP (Disney+ style) */}
      <section className="container mx-auto px-4 -mt-8 mb-10">
        <div className="flex gap-2 overflow-x-auto no-scrollbar justify-center text-xs md:text-[13px]">
          {[
            { href: '#products', label: 'All Designs' },
            { href: '#collections', label: 'Collections' },
            { href: '#nfts', label: 'NFTs' },
            { href: '#bestsellers', label: 'Bestsellers' },
            { href: '#wall-art', label: 'Wall Art' },
            { href: '#under-25', label: 'Under $25' },
            { href: '#subscribe', label: 'Updates' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap px-3 py-2 rounded-full border border-gray-200/80 bg-white/80 text-gray-800 hover:bg-gray-100 hover:border-blue-400 transition dark:bg-gray-900/80 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              {item.label}
            </a>
          ))}
        </div>
      </section>

      {/* INTRO TO DESIGNS */}
      <SectionIntro
        id="designs-overview"
        kicker="Merch, But Cinematic"
        title="Designs Made to Feel Like Scenes"
        lead="Each piece is tied to a moment, character, or location from the Manyagi stories—so when you wear it, it feels like a frame pulled from a prestige series."
        tone="warm"
      />

      {/* TRUST BADGES */}
      <section className="container mx-auto px-4 pb-10 -mt-6">
        <div className="flex flex-wrap justify-center gap-4 md:gap-8">
          {[
            {
              label: 'Premium Printful Fulfillment',
              sub: 'Global, on-demand production',
            },
            {
              label: 'Secure Payment',
              sub: 'Stripe, PayPal & major cards',
            },
            {
              label: '30-Day Returns',
              sub: 'On misprints & damaged items',
            },
          ].map((badge) => (
            <div
              key={badge.label}
              className="flex flex-col items-center px-4 py-3 rounded-2xl bg-white/80 shadow-sm border border-amber-100 text-xs md:text-sm text-gray-700 dark:bg-gray-900/70 dark:border-amber-800/50 dark:text-gray-100"
            >
              <span className="font-semibold">{badge.label}</span>
              <span className="opacity-80">{badge.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* FILTER BAR */}
      <section className="container mx-auto px-4 pt-4">
        <div className="rounded-3xl bg-white/80 dark:bg-gray-900/80 border border-amber-100/80 dark:border-gray-800 shadow-sm px-4 md:px-6 py-5 md:py-6">
          <form
            onSubmit={applyFilters}
            className="flex flex-col md:flex-row gap-4 items-stretch md:items-end"
          >
            <div className="flex-1">
              <label className="block text-xs font-semibold tracking-wide uppercase mb-1 text-gray-600 dark:text-gray-300">
                Search
              </label>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search title, scene, book…"
                className="w-full border rounded-xl px-3 py-2 text-sm dark:bg-gray-950 dark:border-gray-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-wide uppercase mb-1 text-gray-600 dark:text-gray-300">
                Collection
              </label>
              <select
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                className="border rounded-xl px-3 py-2 w-40 md:w-48 text-sm dark:bg-gray-950 dark:border-gray-700"
              >
                <option value="">All</option>
                {collectionOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-wide uppercase mb-1 text-gray-600 dark:text-gray-300">
                Tag
              </label>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="border rounded-xl px-3 py-2 w-40 md:w-48 text-sm dark:bg-gray-950 dark:border-gray-700"
              >
                <option value="">All</option>
                {tagOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold tracking-wide uppercase mb-1 text-gray-600 dark:text-gray-300">
                Sort
              </label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="border rounded-xl px-3 py-2 w-32 md:w-40 text-sm dark:bg-gray-950 dark:border-gray-700"
              >
                <option value="new">Newest</option>
                <option value="price_asc">Price ↑</option>
                <option value="price_desc">Price ↓</option>
              </select>
            </div>
            <div className="flex gap-2 md:gap-3">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
                Apply
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
              >
                Clear
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* SNAPSHOT BAR + PRODUCTS GRID (All Designs rail) */}
      <section id="products" className="container mx-auto px-4 py-10">
        {/* Snapshot pill */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-white/80 border border-amber-200/70 shadow-sm text-sm text-gray-700 text-center dark:bg-gray-900/70 dark:border-amber-800/60 dark:text-gray-100">
            <span className="text-[11px] font-semibold tracking-[0.26em] uppercase text-amber-700/80 dark:text-amber-300/80">
              Design Gallery
            </span>
            <span>
              Showing{' '}
              <span className="font-semibold">{items.length}</span> of{' '}
              <span className="font-semibold">{total}</span> designs
              {filtersActive && ' in your filtered view.'}
              {!filtersActive && '.'}
            </span>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50/70 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700/80 dark:bg-amber-900/40 dark:text-amber-50 dark:hover:bg-amber-900/60"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg">No products found for your filters.</p>
            <button
              onClick={clearFilters}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
              {items.map((product) => (
                <Link key={product.id} href={`/designs/${product.slug}`}>
                  <Card
                    title={product.name}
                    description={`${product.description} Made with premium materials for lasting comfort.`}
                    image={product.display_image}
                    category="designs"
                    buyButton={product}
                    onBuy={() => handleAddToCart(product)}
                  />
                </Link>
              ))}
            </div>

            {canLoadMore && (
              <div className="text-center mt-10">
                <button
                  disabled={fetchingMore}
                  onClick={loadMore}
                  className="px-5 py-2 rounded-full bg-gray-200 hover:bg-gray-300 text-sm font-medium dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  {fetchingMore ? 'Loading…' : 'Load more designs'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* FEATURED COLLECTIONS RAIL */}
      {featuredCollections.length > 0 && (
        <>
          <SectionIntro
            id="collections"
            kicker="Featured Collections"
            title="Story-Linked Capsules & Drops"
            lead="Curated sets of tees, posters, and accessories tied to specific books, arcs, and seasons in the Manyagi Universe."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-12 -mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              {featuredCollections.map((p) => {
                const m = p.metadata || {};
                return (
                  <Link key={p.id} href={`/designs/${p.slug}`}>
                    <Card
                      title={m.drop || m.series || p.name}
                      description={p.description}
                      image={p.display_image}
                      category="designs"
                    >
                      {m.book && (
                        <div className="mb-2 flex justify-center">
                          <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            From {m.book}
                          </span>
                        </div>
                      )}
                      <div className="mt-3 flex justify-center">
                        <Link
                          href={`/designs?collection=${encodeURIComponent(
                            m.drop || m.series || m.book || ''
                          )}`}
                          className="text-xs font-semibold text-blue-600 hover:underline"
                        >
                          View this collection →
                        </Link>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* NFT RAIL */}
      {nftDesigns.length > 0 && (
        <>
          <SectionIntro
            id="nfts"
            kicker="Digital Collectibles"
            title="On-Chain Scenes & Covers"
            lead="Select designs are available as NFTs or digital collectibles — made for collectors who want a stake in the universe."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-12 -mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              {nftDesigns.map((product) => {
                const m = product.metadata || {};
                const nftUrl = m.nft_url || m.nft_link || '';
                return (
                  <Link key={product.id} href={`/designs/${product.slug}`}>
                    <Card
                      title={product.name}
                      description={product.description}
                      image={product.display_image}
                      category="designs"
                    >
                      <div className="flex flex-wrap gap-2 justify-center mb-3">
                        <span className="text-[11px] px-2 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                          NFT / Digital Collectible
                        </span>
                        {m.book && (
                          <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            {m.book}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex justify-center gap-2 flex-wrap">
                        {nftUrl && (
                          <a
                            href={nftUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn bg-purple-600 text-white py-2 px-4 rounded text-xs hover:bg-purple-700 transition"
                          >
                            View NFT
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAddToCart(product)}
                          className="btn bg-gray-900 text-white py-2 px-4 rounded text-xs hover:bg-black transition"
                        >
                          Get the Physical
                        </button>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* BESTSELLERS RAIL */}
      {bestsellerDesigns.length > 0 && (
        <>
          <SectionIntro
            id="bestsellers"
            kicker="Bestsellers"
            title="Pieces People Keep Reordering"
            lead="Quiet fan favorites — the designs that get reordered, gifted, and spotted the most."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-12 -mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              {bestsellerDesigns.map((product) => {
                const m = product.metadata || {};
                return (
                  <Link key={product.id} href={`/designs/${product.slug}`}>
                    <Card
                      title={product.name}
                      description={product.description}
                      image={product.display_image}
                      category="designs"
                    >
                      {m.book && (
                        <div className="mb-2 flex justify-center">
                          <span className="text-[11px] px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
                            Fan favorite from {m.book}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAddToCart(product)}
                        className="mt-3 w-full inline-flex justify-center rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
                      >
                        Add to Cart
                      </button>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* WALL ART RAIL */}
      {wallArtDesigns.length > 0 && (
        <>
          <SectionIntro
            id="wall-art"
            kicker="Wall & Studio"
            title="Posters & Prints"
            lead="Build a Manyagi wall — key scenes, characters, and emblems framed as high-resolution art."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-12 -mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              {wallArtDesigns.map((product) => {
                const m = product.metadata || {};
                return (
                  <Link key={product.id} href={`/designs/${product.slug}`}>
                    <Card
                      title={product.name}
                      description={product.description}
                      image={product.display_image}
                      category="designs"
                    >
                      <div className="flex flex-wrap gap-2 justify-center mb-2">
                        <span className="text-[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                          Poster / Wall Art
                        </span>
                        {m.book && (
                          <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                            {m.book}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddToCart(product)}
                        className="mt-3 w-full inline-flex justify-center rounded-md bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black transition"
                      >
                        Add to Cart
                      </button>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* UNDER $25 RAIL */}
      {under25Designs.length > 0 && (
        <>
          <SectionIntro
            id="under-25"
            kicker="Everyday Pieces"
            title="Under $25"
            lead="Low-friction entries into the universe — perfect for gifts, first-time buyers, or stacking multiple designs."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-12 -mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
              {under25Designs.map((product) => {
                const m = product.metadata || {};
                return (
                  <Link key={product.id} href={`/designs/${product.slug}`}>
                    <Card
                      title={product.name}
                      description={product.description}
                      image={product.display_image}
                      category="designs"
                    >
                      {m.book && (
                        <div className="mb-2 flex justify-center">
                          <span className="text-[11px] px-2 py-1 rounded-full bg-green-50 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                            From {m.book}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleAddToCart(product)}
                        className="mt-3 w-full inline-flex justify-center rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
                      >
                        Add to Cart
                      </button>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* SUBSCRIBE */}
      <section id="subscribe" className="container mx-auto px-4 pb-16">
        <SubscriptionForm
          formId="8432506"
          uid="a194031db7"
          title="Stay Updated on New Designs"
          description="Get notified about new drops, limited runs, NFT releases, and exclusive offers from Manyagi Designs."
        />
      </section>

      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg text-center dark:bg-gray-900">
            <p className="text-base font-medium">Added to cart!</p>
            <Link
              href="/cart"
              className="text-blue-600 hover:underline mt-4 inline-block"
            >
              View Cart
            </Link>
          </div>
        </div>
      )}

      {/* GLOBAL RECOMMENDER */}
      <Recommender />
    </>
  );
}