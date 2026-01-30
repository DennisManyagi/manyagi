// pages/publishing.js
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { addToCart } from '../lib/cartSlice';
import SubscriptionForm from '../components/SubscriptionForm';
import Recommender from '../components/Recommender';
import Hero from '../components/Hero';
import Card from '../components/Card';
import SectionIntro from '../components/SectionIntro';
import { supabase } from '@/lib/supabase';

const asList = (v) =>
  Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : [];

const pickImage = (p) =>
  p?.thumbnail_url ||
  p?.display_image ||
  p?.image_url ||
  p?.image ||
  '/placeholder.png';

// simple Fisher–Yates shuffle for light randomization
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * Offers have tier/access_tier/required_tier in metadata.
 * Books do NOT.
 */
const isStudioOffer = (p) => {
  const m = p?.metadata || {};
  const tier = m?.tier ?? m?.access_tier ?? m?.required_tier;
  return tier !== undefined && tier !== null && String(tier).trim() !== '';
};

const isBook = (p) => !isStudioOffer(p);

export default function Publishing() {
  const dispatch = useDispatch();
  const [products, setProducts] = useState([]);
  const [carouselImages, setCarouselImages] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // UX: allow readers to filter by series/universe
  const [activeSeries, setActiveSeries] = useState('ALL');

  // ✅ NEW: stop double-clicking + show basic feedback
  const [checkoutLoadingId, setCheckoutLoadingId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // ---- 1) Fetch publishing products ----
        const res = await fetch('/api/products?division=publishing');
        const json = await res.json();
        const list = asList(json).map((p) => ({
          ...p,
          display_image: pickImage(p),
        }));
        setProducts(list);
        setTotal(Number(json?.total ?? list.length));

        // ---- 2) Fetch carousel images for hero ----
        const { data: assetData, error: assetErr } = await supabase
          .from('assets')
          .select('file_url')
          .eq('division', 'publishing')
          .eq('purpose', 'carousel')
          .order('created_at', { ascending: false });

        if (assetErr) {
          console.warn('[publishing carousel assets error]', assetErr);
        }

        const fetchedImages = assetData?.map((d) => d.file_url) || [];

        setCarouselImages(
          fetchedImages.length > 0
            ? fetchedImages
            : [
                'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/book-carousel-1.webp',
                'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/book-carousel-2.webp',
                'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/book-carousel-3.webp',
                'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/book-carousel-4.webp',
              ]
        );
      } catch (err) {
        console.error('Publishing fetch error:', err);
        setProducts([]);
        setTotal(0);
        setCarouselImages([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleAddToCart = (product) => {
    dispatch(addToCart({ ...product, productType: 'book' }));
  };

  // ✅ NEW: Stripe checkout (re-uses your existing create-session endpoint)
  const handleStripeCheckout = async (product) => {
    try {
      const pid = product?.id;
      if (!pid) {
        alert('Missing product id.');
        return;
      }

      // Only show button when this exists, but guard anyway
      const stripePriceId = product?.metadata?.stripe_price_id;
      if (!stripePriceId) {
        alert('This book is not configured for Stripe checkout yet.');
        return;
      }

      setCheckoutLoadingId(pid);

      const res = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: pid,
          quantity: 1,
          // optional overrides:
          // success_url: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          // cancel_url: `${window.location.origin}/publishing`,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Checkout failed');

      if (json?.url) {
        window.location.href = json.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (e) {
      alert(`Checkout failed: ${e.message}`);
    } finally {
      setCheckoutLoadingId(null);
    }
  };

  /**
   * books-only list derived once and reused everywhere
   */
  const books = useMemo(() => products.filter(isBook), [products]);

  // ---- Derived data: series filters & filtered list ----
  const seriesOptions = useMemo(() => {
    const set = new Set();
    books.forEach((p) => {
      const m = p.metadata || {};
      const label = m.series || m.book;
      if (label) set.add(String(label));
    });
    return ['ALL', ...Array.from(set)];
  }, [books]);

  const filteredProducts = useMemo(() => {
    if (activeSeries === 'ALL') return books;
    return books.filter((p) => {
      const m = p.metadata || {};
      return m.series === activeSeries || m.book === activeSeries;
    });
  }, [books, activeSeries]);

  // ---- Multi-rail slices ----
  const startHereBooks = useMemo(() => {
    if (!books.length) return [];
    const flagged = books.filter((p) => p?.metadata?.start_here);
    if (flagged.length >= 3) return shuffle(flagged).slice(0, 3);

    const sorted = [...books].sort(
      (a, b) => (b?.metadata?.year || 0) - (a?.metadata?.year || 0)
    );
    return sorted.slice(0, 3);
  }, [books]);

  const sampleBooks = useMemo(
    () => shuffle(books.filter((p) => p?.metadata?.pdf_url)).slice(0, 4),
    [books]
  );

  const merchLinkedBooks = useMemo(
    () =>
      shuffle(
        books.filter((p) => {
          const m = p.metadata || {};
          const tags = p.tags || [];
          return m.has_merch || tags.includes('has_merch') || tags.includes('designs');
        })
      ).slice(0, 4),
    [books]
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        Loading books...
      </div>
    );
  }

  const list = asList(filteredProducts);

  return (
    <>
      <Head>
        <title>Manyagi Publishing — Discover Epic Tales</title>
        <meta
          name="description"
          content="Immerse yourself in cinematic novels and poetry by D.N. Manyagi across the connected Manyagi Universe."
        />
      </Head>

      {/* HERO */}
      <Hero
        kicker="Manyagi Publishing"
        title="Uncover Hidden Worlds & Lasting Characters"
        lead="From grounded dystopias to hybrid magic-tech epics, explore stories built to live far beyond the page."
        carouselImages={carouselImages}
        height="h-[600px]"
      >
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="#where-to-start"
            className="btn bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
          >
            Start Reading
          </Link>
          <Link
            href="#books"
            className="btn bg-white/90 text-gray-900 border border-gray-200 py-2 px-4 rounded hover:bg-gray-100 transition dark:bg-gray-900 dark:text-white dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Browse the Library
          </Link>
        </div>
      </Hero>

      {/* MICRO-NAV */}
      <section className="container mx-auto px-4 -mt-8 mb-10">
        <div className="flex gap-2 overflow-x-auto no-scrollbar justify-center text-xs md:text-[13px]">
          {[
            { href: '#where-to-start', label: 'Start Here' },
            { href: '#books', label: 'All Books' },
            { href: '#samples', label: 'Samples' },
            { href: '#books-with-merch', label: 'With Merch' },
            { href: '#subscribe', label: 'Updates' },
            { href: '#reader-impressions', label: 'Praise' },
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

      {/* TESTIMONIALS */}
      <SectionIntro
        id="reader-impressions"
        kicker="Reader Impressions"
        title="Stories Made to Stay With You"
        lead="Readers describe the Manyagi Universe as emotionally grounded, cinematic, and dangerously bingeable. Start with any book and you'll feel the connective tissue running through them all."
        tone="warm"
      />

      <section className="container mx-auto px-4 pb-10 -mt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="card p-5 text-center bg-white/90 shadow-sm rounded-2xl dark:bg-gray-900/60">
            <p className="italic text-sm md:text-base">
              &quot;Felt like watching a prestige series in my head.&quot;
            </p>
            <p className="text-xs mt-3 text-gray-500 dark:text-gray-400">— Early Reader</p>
          </div>
          <div className="card p-5 text-center bg-white/90 shadow-sm rounded-2xl dark:bg-gray-900/60">
            <p className="italic text-sm md:text-base">
              &quot;Grounded, human, and still wildly imaginative.&quot;
            </p>
            <p className="text-xs mt-3 text-gray-500 dark:text-gray-400">— Beta Reader</p>
          </div>
          <div className="card p-5 text-center bg-white/90 shadow-sm rounded-2xl dark:bg-gray-900/60">
            <p className="italic text-sm md:text-base">
              &quot;The kind of world you keep thinking about at work.&quot;
            </p>
            <p className="text-xs mt-3 text-gray-500 dark:text-gray-400">— Advance Copy Reader</p>
          </div>
        </div>
      </section>

      {/* LIBRARY */}
      <section id="books" className="container mx-auto px-4 pt-10 pb-16">
        {seriesOptions.length > 1 && (
          <div className="flex flex-wrap gap-3 justify-center mb-6">
            {seriesOptions.map((series) => {
              const isActive = activeSeries === series;
              return (
                <button
                  key={series}
                  type="button"
                  onClick={() => setActiveSeries(series)}
                  className={[
                    'px-4 py-2 rounded-full text-sm border transition',
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white/90 text-gray-800 border-gray-200 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  {series === 'ALL' ? 'All Series' : series}
                </button>
              );
            })}
          </div>
        )}

        {/* Snapshot (your “count only what is shown” version) */}
        <div className="mb-8">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-white/80 border border-amber-200/70 shadow-sm text-sm text-gray-700 text-center dark:bg-gray-900/70 dark:border-amber-800/60 dark:text-gray-100">
              <span className="text-[11px] font-semibold tracking-[0.26em] uppercase text-amber-700/80 dark:text-amber-300/80">
                Library Snapshot
              </span>
              <span>
                Showing <span className="font-semibold">{list.length}</span> of{' '}
                <span className="font-semibold">{list.length}</span> books &amp; collections
                {activeSeries !== 'ALL' && (
                  <>
                    {' '}
                    in <span className="italic">“{activeSeries}”</span>
                  </>
                )}
                .
              </span>

              {activeSeries !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setActiveSeries('ALL')}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50/70 px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700/80 dark:bg-amber-900/40 dark:text-amber-50 dark:hover:bg-amber-900/60"
                >
                  <span>Clear filter</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {list.length === 0 ? (
            <div className="col-span-full text-center text-lg">
              No publishing items found for this filter yet.
            </div>
          ) : (
            list.map((product) => {
              const m = product.metadata || {};
              const buyUrl =
                m.amazon_url ||
                m.kindle_url ||
                m.paperback_url ||
                m.store_url ||
                null;

              const stripePriceId = m.stripe_price_id || null;

              const alsoLinks = [
                m.kindle_url ? { label: 'Kindle', url: m.kindle_url } : null,
                m.paperback_url ? { label: 'Paperback', url: m.paperback_url } : null,
              ].filter(Boolean);

              const chips = [
                m.series || m.book || null,
                m.format ? String(m.format).toUpperCase() : null,
                m.year ? `Published ${m.year}` : null,
              ].filter(Boolean);

              const isCheckingOut = checkoutLoadingId === product.id;

              return (
                <Link key={product.id} href={`/publishing/${product.slug}`}>
                  <Card
                    title={product.name}
                    description={product.description}
                    image={product.display_image || pickImage(product)}
                    category="publishing"
                    tags={Array.isArray(product.tags) ? product.tags : []}
                  >
                    {chips.length > 0 && (
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
                    )}

                    {/* CTAs */}
                    <div className="flex flex-wrap gap-3 mt-2 justify-center">
                      {/* External store wins if present */}
                      {buyUrl && (
                        <a
                          href={buyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
                        >
                          Get Your Copy
                        </a>
                      )}

                      {/* Stripe buy for digital (only when no external buyUrl) */}
                      {!buyUrl && stripePriceId && (
                        <button
                          type="button"
                          disabled={isCheckingOut}
                          onClick={() => handleStripeCheckout(product)}
                          className={[
                            'btn py-2 px-4 rounded transition',
                            isCheckingOut
                              ? 'bg-gray-400 text-white cursor-not-allowed'
                              : 'bg-blue-600 text-white hover:bg-blue-700',
                          ].join(' ')}
                          title={`Stripe: ${stripePriceId}`}
                        >
                          {isCheckingOut ? 'Redirecting…' : 'Buy Digital'}
                        </button>
                      )}

                      {m.pdf_url && (
                        <a
                          href={m.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn bg-gray-700 text-white py-2 px-4 rounded hover:bg-gray-800 transition"
                        >
                          Read Sample
                        </a>
                      )}
                    </div>

                    {alsoLinks.length > 0 && (
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-3 text-center">
                        Also available:{' '}
                        {alsoLinks.map((l, i) => (
                          <a
                            key={l.label}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-blue-700"
                          >
                            {l.label}
                            {i < alsoLinks.length - 1 ? ', ' : ''}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Fallback cart only when no buyUrl AND no Stripe price */}
                    {!buyUrl && !stripePriceId && (
                      <div className="mt-4 flex justify-center">
                        <button
                          type="button"
                          onClick={() => handleAddToCart(product)}
                          className="text-xs px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          Add to Manyagi Cart
                        </button>
                      </div>
                    )}
                  </Card>
                </Link>
              );
            })
          )}
        </div>
      </section>

      {/* START HERE */}
      <SectionIntro
        id="where-to-start"
        kicker="Start Here"
        title="Entry Points Into the Manyagi Universe"
        lead="Not sure which book to pick up first? These titles are designed as clean on-ramps into the wider universe."
        tone="warm"
        align="center"
      />
      <section className="container mx-auto px-4 pb-16 -mt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {startHereBooks.map((p) => (
            <Link key={p.id} href={`/publishing/${p.slug}`}>
              <Card
                title={p.name}
                description={p.description}
                image={p.display_image || pickImage(p)}
                category="publishing"
              />
            </Link>
          ))}
          {startHereBooks.length < 3 && (
            <p className="col-span-full text-center opacity-70 text-sm">
              Flag more titles with <code>metadata.start_here = true</code> in admin to fill this rail.
            </p>
          )}
        </div>
      </section>

      {/* SAMPLES */}
      {sampleBooks.length > 0 && (
        <>
          <SectionIntro
            id="samples"
            kicker="Free to Read"
            title="Books with Sample Chapters"
            lead="Dip into the worlds before you commit — these titles include free PDF samples or first chapters."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-16 -mt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {sampleBooks.map((p) => {
                const m = p.metadata || {};
                return (
                  <Link key={p.id} href={`/publishing/${p.slug}`}>
                    <Card
                      title={p.name}
                      description={p.description}
                      image={p.display_image || pickImage(p)}
                      category="publishing"
                    >
                      {m.pdf_url && (
                        <div className="mt-3 flex justify-center">
                          <a
                            href={m.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn bg-gray-800 text-white py-2 px-4 rounded text-xs hover:bg-black transition"
                          >
                            Read Sample
                          </a>
                        </div>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* MERCH LINKED */}
      {merchLinkedBooks.length > 0 && (
        <>
          <SectionIntro
            id="books-with-merch"
            kicker="Books With Merch"
            title="Stories With Their Own Collections"
            lead="These books have T-shirts, posters, or other designs tied directly to their worlds."
            tone="neutral"
            align="center"
          />
          <section className="container mx-auto px-4 pb-16 -mt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {merchLinkedBooks.map((p) => (
                <Link key={p.id} href={`/publishing/${p.slug}`}>
                  <Card
                    title={p.name}
                    description={p.description}
                    image={p.display_image || pickImage(p)}
                    category="publishing"
                  >
                    <div className="mt-3 flex justify-center">
                      <Link
                        href={`/designs?collection=${encodeURIComponent(
                          p.metadata?.series || p.metadata?.book || p.name
                        )}`}
                        className="text-xs font-semibold text-blue-600 hover:underline"
                      >
                        View merch for this book →
                      </Link>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      {/* SUBSCRIBE */}
      <section id="subscribe" className="container mx-auto px-4 py-16">
        <SubscriptionForm
          formId="8427848"
          uid="637df68a01"
          title="Subscribe to Publishing Updates"
          description="Get launch dates, exclusive previews, and behind-the-scenes notes from the Manyagi Universe."
        />
      </section>

      <Recommender />
    </>
  );
}