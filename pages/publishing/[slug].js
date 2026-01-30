import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToCart } from '../../lib/cartSlice';
import SubscriptionForm from '../../components/SubscriptionForm';
import Recommender from '../../components/Recommender';
import SectionIntro from '../../components/SectionIntro';
import { supabase } from '@/lib/supabase';

const PLACEHOLDER_IMAGE =
  'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/og-home.webp';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDivision(div) {
  if (!div) return 'Publishing';
  return div.charAt(0).toUpperCase() + div.slice(1);
}

function getReadingTime(text = '') {
  if (!text.trim()) return '';
  const words = text.trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} min read`;
}

// super lightweight markdown-ish renderer: # / ## / ### => headings, else paragraph
function renderContentBlocks(content = '') {
  const blocks = content.split(/\n\s*\n/); // double newline = new block

  return blocks
    .map((raw, idx) => {
      const text = raw.trim();
      if (!text) return null;

      if (text.startsWith('### ')) {
        return (
          <h3 key={idx} className="mt-6 mb-2 text-lg font-semibold">
            {text.slice(4)}
          </h3>
        );
      }
      if (text.startsWith('## ')) {
        return (
          <h2 key={idx} className="mt-8 mb-3 text-xl font-bold">
            {text.slice(3)}
          </h2>
        );
      }
      if (text.startsWith('# ')) {
        return (
          <h1 key={idx} className="mt-10 mb-4 text-2xl font-bold">
            {text.slice(2)}
          </h1>
        );
      }

      return (
        <p key={idx} className="mb-4 leading-relaxed">
          {text}
        </p>
      );
    })
    .filter(Boolean);
}

/* -------------------------------
   Media helpers (mirrors media.js/index.js)
--------------------------------*/
const asStr = (v) => (v === null || v === undefined ? '' : String(v));

function safeMeta(meta) {
  if (!meta) return {};
  if (typeof meta === 'object') return meta;
  if (typeof meta === 'string') {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function isDirectAudio(url) {
  const u = (url || '').toLowerCase().split('?')[0];
  return u.endsWith('.mp3') || u.endsWith('.wav') || u.endsWith('.m4a') || u.endsWith('.ogg');
}

function inferPlatform(url) {
  if (!url) return '';
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('spotify.com')) return 'Spotify';
  if (u.includes('soundcloud.com')) return 'SoundCloud';
  if (u.includes('vimeo.com')) return 'Vimeo';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('apple.com') || u.includes('music.apple.com')) return 'Apple Music';
  if (u.includes('suno')) return 'Suno';
  return '';
}

function normalizeType(t) {
  const v = (t || '').toLowerCase().trim();
  if (v === 'music' || v === 'track') return 'soundtrack';
  if (v === 'chapter preview' || v === 'chapter') return 'chapter_read';
  if (v === 'opening_theme') return 'soundtrack';
  if (v === 'ending_theme') return 'soundtrack';
  if (v === 'character_theme') return 'soundtrack';
  if (v === 'battle_theme') return 'score';
  return v || 'other';
}

function prettyType(t) {
  const map = {
    soundtrack: 'Soundtrack',
    score: 'Score',
    trailer: 'Trailer',
    audiobook: 'Audiobook',
    chapter_read: 'Chapter Read',
    scene: 'Scene',
    playlist: 'Playlist',
    musicvideo: 'Music Video',
    reel: 'Reel',
    podcast: 'Podcast',
    interview: 'Interview',
    event: 'Event',
    other: 'Media',
  };
  return map[normalizeType(t)] || 'Media';
}

function bestUrl(meta, post) {
  const audio = asStr(meta?.audio_url).trim();
  const media = asStr(meta?.media_url).trim();

  const audio2 = asStr(post?.audio_url).trim();
  const media2 = asStr(post?.media_url).trim();

  return {
    audio_url: audio || audio2 || '',
    media_url: media || media2 || '',
  };
}

function pickIp(meta) {
  return (
    asStr(meta?.book).trim() ||
    asStr(meta?.series).trim() ||
    asStr(meta?.universe).trim() ||
    asStr(meta?.ip).trim() ||
    asStr(meta?.franchise).trim() ||
    ''
  );
}

function norm(s = "") {
  return String(s || "").toLowerCase().trim();
}

function pickProductArt(p) {
  return (
    p?.thumbnail_url ||
    p?.featured_image ||
    PLACEHOLDER_IMAGE
  );
}

function getProductBlurb(p) {
  return (
    p?.description ||
    p?.tagline ||
    p?.synopsis ||
    "Premium merchandise from the Manyagi Universe."
  );
}

function Chip({ children, tone = 'neutral' }) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-100/80 text-amber-800 border-amber-200 dark:bg-amber-900/25 dark:text-amber-200 dark:border-amber-800/40'
      : tone === 'blue'
      ? 'bg-blue-100/80 text-blue-800 border-blue-200 dark:bg-blue-900/25 dark:text-blue-200 dark:border-blue-800/40'
      : tone === 'purple'
      ? 'bg-purple-100/80 text-purple-800 border-purple-200 dark:bg-purple-900/25 dark:text-purple-200 dark:border-purple-800/40'
      : 'bg-white/70 text-gray-800 border-gray-200 dark:bg-gray-900/60 dark:text-gray-100 dark:border-gray-700';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs border ${cls}`}>
      {children}
    </span>
  );
}

function MediaEmbed({ mediaUrl, audioUrl }) {
  const url = (audioUrl || mediaUrl || '').trim();
  if (!url) return null;

  if (isDirectAudio(url)) {
    return (
      <div className="w-full rounded-2xl border border-gray-200/80 dark:border-gray-700/70 bg-white/70 dark:bg-gray-900/50 p-4">
        <audio controls className="w-full">
          <source src={url} />
        </audio>
      </div>
    );
  }

  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
  const isSpotify = url.includes('open.spotify.com');
  const isSoundCloud = url.includes('soundcloud.com');
  const isVimeo = url.includes('vimeo.com');

  if (isYouTube) {
    let embed = url;
    if (url.includes('watch?v=')) {
      const id = url.split('watch?v=')[1].split('&')[0];
      embed = `https://www.youtube.com/embed/${id}`;
    } else if (url.includes('youtu.be/')) {
      const id = url.split('youtu.be/')[1].split(/[?&]/)[0];
      embed = `https://www.youtube.com/embed/${id}`;
    }
    return (
      <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-gray-300/70 dark:border-gray-700/70 shadow-sm">
        <iframe src={embed} title="Media Preview" className="w-full h-full" allowFullScreen />
      </div>
    );
  }

  if (isSpotify) {
    const embed = url.replace('open.spotify.com/', 'open.spotify.com/embed/');
    return (
      <div className="w-full rounded-2xl overflow-hidden border border-gray-300/70 dark:border-gray-700/70 shadow-sm">
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
    const embed = `https://w.soundcloud.com/player/?url=${encodeURIComponent(
      url
    )}&auto_play=false&show_teaser=true`;
    return (
      <div className="w-full rounded-2xl overflow-hidden border border-gray-300/70 dark:border-gray-700/70 shadow-sm">
        <iframe src={embed} title="SoundCloud Player" className="w-full h-[166px]" allow="autoplay" />
      </div>
    );
  }

  if (isVimeo) {
    let embed = url;
    const parts = url.split('vimeo.com/');
    if (parts[1]) {
      const id = parts[1].split(/[?&]/)[0];
      embed = `https://player.vimeo.com/video/${id}`;
    }
    return (
      <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-gray-300/70 dark:border-gray-700/70 shadow-sm">
        <iframe src={embed} title="Vimeo Player" className="w-full h-full" allowFullScreen />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center w-full bg-blue-600 text-white text-sm font-semibold py-3 px-4 rounded-full hover:bg-blue-700 transition shadow-sm"
    >
      Open Link
    </a>
  );
}

function ProductRailRow({ title, subtitle, items }) {
  if (!items?.length) return null;

  return (
    <section className="container mx-auto px-4 pb-10">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <div className="text-sm opacity-70">{subtitle}</div>
          <h3 className="text-xl md:text-2xl font-bold">{title}</h3>
        </div>
      </div>

      {/* Netflix-ish rail */}
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
        {items.map((p) => {
          const art = pickProductArt(p);
          const div = norm(p.division || 'publishing');

          return (
            <Link
              key={p.id}
              href={`/${div}/${p.slug}`}
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
                    <span className="text-[11px] px-2 py-1 rounded-full bg-white/90 text-black font-semibold">
                      {formatDivision(p.division)}
                    </span>
                    {p.price && (
                      <span className="text-[11px] px-2 py-1 rounded-full bg-amber-200 text-amber-900 font-semibold">
                        ${p.price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-white/70">
                    {formatDate(p.created_at)}
                  </div>
                </div>

                {/* Title */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="text-[11px] tracking-[0.26em] uppercase text-white/70">
                    Product
                  </div>
                  <div className="text-xl font-bold text-white leading-tight">
                    {p.name}
                  </div>
                </div>
              </div>

              <div className="p-5">
                <p className="text-sm opacity-80 line-clamp-3">
                  {getProductBlurb(p)}
                </p>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold underline">
                    View →
                  </span>
                  <span className="text-xs opacity-60">
                    {p.productType || 'Book'}
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

export default function PublishingProduct() {
  const router = useRouter();
  const { slug } = router.query;
  const dispatch = useDispatch();

  const [product, setProduct] = useState(null);
  const [linkedMedia, setLinkedMedia] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    if (!slug) return;

    (async () => {
      setLoading(true);
      setProduct(null);
      setLinkedMedia(null);
      setRelatedProducts([]);

      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .or(`id.eq.${slug},slug.eq.${slug}`)
          .eq('division', 'publishing')
          .single();

        if (error || !data) throw new Error(error?.message || 'Product not found');

        const m0 = safeMeta(data?.metadata);
        const u0 = bestUrl(m0, data || {});
        const hasDirectMedia = !!asStr(u0.audio_url).trim() || !!asStr(u0.media_url).trim();

        setProduct(data);

        if (!hasDirectMedia) {
          try {
            const { data: mediaData, error: mediaError } = await supabase
              .from('products')
              .select('*')
              .eq('division', 'media')
              .or(`id.eq.${slug},slug.eq.${slug}`)
              .limit(1)
              .single();

            if (!mediaError && mediaData) setLinkedMedia(mediaData);
          } catch (e2) {
            console.warn('Media lookup failed:', e2);
          }
        }

        // Fetch related products from same universe/IP
        const meta = safeMeta(data?.metadata);
        const ip = pickIp(meta);
        if (ip) {
          const { data: related, error: relatedError } = await supabase
            .from('products')
            .select('*')
            .or(`metadata->>book.eq.${ip},metadata->>series.eq.${ip},metadata->>universe.eq.${ip},metadata->>ip.eq.${ip},metadata->>franchise.eq.${ip}`)
            .neq('id', data.id)
            .neq('slug', slug);

          if (relatedError) {
            console.error('Related products fetch error:', relatedError);
          } else {
            setRelatedProducts(related || []);
          }
        }
      } catch (e) {
        console.error('Publishing product fetch error:', e);
        setProduct({
          id: 'fallback-book',
          name: 'Sample Book',
          slug: 'fallback-book',
          description: 'Fallback publishing product.',
          created_at: '2025-09-01T00:00:00Z',
          thumbnail_url: PLACEHOLDER_IMAGE,
          division: 'publishing',
          metadata: { book: 'Sample', year: 2025 },
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const mediaSource = linkedMedia || product;

  const meta = useMemo(() => safeMeta(mediaSource?.metadata), [mediaSource?.metadata]);
  const urls = useMemo(() => bestUrl(meta, mediaSource || {}), [meta, mediaSource]);

  const audio_url = urls.audio_url;
  const media_url = urls.media_url;
  const hasMedia = !!asStr(audio_url).trim() || !!asStr(media_url).trim();

  const platform = useMemo(
    () => asStr(meta?.platform).trim() || inferPlatform(media_url || audio_url),
    [meta, media_url, audio_url]
  );

  const ip = useMemo(() => pickIp(meta), [meta]);
  const mediaType = useMemo(() => prettyType(meta?.media_type || ''), [meta]);

  const showMediaPanel =
    hasMedia || asStr(product?.division).toLowerCase() === 'media' || !!linkedMedia;

  const metaLineParts = useMemo(() => {
    if (!product) return [];
    return [
      formatDate(product.created_at),
      product.division ? formatDivision(product.division) : null,
      getReadingTime(product.description || ''),
    ].filter(Boolean);
  }, [product]);

  const duration = asStr(meta?.duration).trim();
  const mood = asStr(meta?.mood).trim();
  const scene = asStr(meta?.scene).trim();

  const downloadUrl = asStr(meta?.download_url).trim();
  const licenseUrl = asStr(meta?.license_url).trim();
  const rightsNote = asStr(meta?.rights_note).trim(); // optional

  const mediaSlug = asStr(linkedMedia?.slug || product?.slug).trim();

  const handleAddToCart = () => {
    if (!product) return;
    dispatch(addToCart({ ...product, productType: 'book' }));
  };

  const handleStripeCheckout = async () => {
    try {
      const pid = product?.id;
      if (!pid) {
        alert('Missing product id.');
        return;
      }

      const stripePriceId = product?.metadata?.stripe_price_id;
      if (!stripePriceId) {
        alert('This book is not configured for Stripe checkout yet.');
        return;
      }

      setCheckoutLoading(true);

      const res = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: pid,
          quantity: 1,
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
      setCheckoutLoading(false);
    }
  };

  const relatedDesigns = useMemo(() => relatedProducts.filter((p) => norm(p.division) === 'designs'), [relatedProducts]);
  const relatedBooks = useMemo(() => relatedProducts.filter((p) => norm(p.division) === 'publishing'), [relatedProducts]);
  const relatedMediaItems = useMemo(() => relatedProducts.filter((p) => norm(p.division) === 'media'), [relatedProducts]);

  if (loading) {
    return <div className="container mx-auto px-4 py-16 text-center">Loading product…</div>;
  }
  if (!product) {
    return <div className="container mx-auto px-4 py-16 text-center">Product not found.</div>;
  }

  const buyUrl =
    meta.amazon_url ||
    meta.kindle_url ||
    meta.paperback_url ||
    meta.store_url ||
    null;

  const stripePriceId = meta.stripe_price_id || null;

  const alsoLinks = [
    meta.kindle_url ? { label: 'Kindle', url: meta.kindle_url } : null,
    meta.paperback_url ? { label: 'Paperback', url: meta.paperback_url } : null,
  ].filter(Boolean);

  return (
    <>
      <Head>
        <title>{product.name} — Manyagi Publishing</title>
        <meta name="description" content={product.description || 'Book from the Manyagi Universe.'} />
      </Head>

      {/* Premium background wash */}
      <div className="relative">
        <div className="absolute inset-0 -z-10">
          <div className="h-[520px] bg-gradient-to-b from-amber-200/60 via-amber-100/30 to-transparent dark:from-amber-900/20 dark:via-amber-900/10" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.14),transparent_55%)]" />
        </div>

        <SectionIntro
          id="product-header"
          kicker="Manyagi Publishing"
          title={product.name}
          lead={product.description || 'A story from the Manyagi Universe.'}
          tone="neutral"
          align="center"
          maxWidth="max-w-4xl"
        >
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {metaLineParts.length > 0 && <Chip>{metaLineParts.join(' • ')}</Chip>}
            {mediaType && <Chip tone="amber">{mediaType}</Chip>}
            {platform && <Chip tone="blue">{platform}</Chip>}
            {duration && <Chip tone="purple">{duration}</Chip>}
          </div>
        </SectionIntro>

        <article className="container mx-auto px-4 pb-16">
          <div className="max-w-5xl mx-auto">
            {/* Sticky top bar for navigation */}
            <div className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-3 bg-white/80 dark:bg-gray-950/80 backdrop-blur py-2 px-4 rounded-full shadow-md">
              <Link
                href="/publishing"
                className="inline-flex items-center text-xs text-gray-600 hover:text-blue-600 dark:text-gray-300"
              >
                ← Back to Publishing
              </Link>

              <div className="flex gap-2 flex-wrap justify-end">
              </div>
            </div>

            {/* MAIN CARD - Polished like featured banner */}
            <div className="rounded-[28px] overflow-hidden border border-gray-200/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-[0_10px_50px_-20px_rgba(0,0,0,0.35)]">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="p-7 md:p-10">
                  <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">
                    Featured Book
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold mt-2 leading-tight">
                    {product.name}
                  </h2>
                  <p className="mt-3 opacity-80 max-w-xl">
                    {product.description || 'A story from the Manyagi Universe.'}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {metaLineParts.length > 0 && <Chip>{metaLineParts.join(' • ')}</Chip>}
                    {ip && <Chip tone="amber">{ip}</Chip>}
                    {mediaType && <Chip>{mediaType}</Chip>}
                    {platform && <Chip tone="blue">{platform}</Chip>}
                  </div>

                  <div className="mt-7 flex gap-3 flex-wrap">
                    {buyUrl && (
                      <a
                        href={buyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-2 rounded-xl bg-blue-600 text-white dark:bg-blue-600 dark:text-white"
                      >
                        Get Your Copy Now
                      </a>
                    )}
                    {!buyUrl && stripePriceId && (
                      <button
                        disabled={checkoutLoading}
                        onClick={handleStripeCheckout}
                        className="px-5 py-2 rounded-xl bg-blue-600 text-white dark:bg-blue-600 dark:text-white disabled:bg-gray-400"
                      >
                        {checkoutLoading ? 'Redirecting...' : 'Buy Digital Edition'}
                      </button>
                    )}
                    <button
                      onClick={handleAddToCart}
                      className="px-5 py-2 rounded-xl bg-black text-white dark:bg-white dark:text-black"
                    >
                      Add to Cart {product.price ? `- $${product.price.toFixed(2)}` : ''}
                    </button>
                  </div>

                  {alsoLinks.length > 0 && (
                    <div className="text-xs opacity-60 mt-4">
                      Also available:{' '}
                      {alsoLinks.map((l, i) => (
                        <a
                          key={l.label}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {l.label}
                          {i < alsoLinks.length - 1 ? ', ' : ''}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative min-h-[320px]">
                  <img
                    src={pickProductArt(product)}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* Media panel: premium look with hover animation */}
              {showMediaPanel && hasMedia && (
                <div className="p-6 md:p-8 border-t border-gray-200/70 dark:border-gray-800 transition-all hover:shadow-lg">
                  <div className="relative rounded-[22px] overflow-hidden">
                    {/* gradient border */}
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-200/60 via-blue-200/40 to-purple-200/50 dark:from-amber-900/30 dark:via-blue-900/20 dark:to-purple-900/25" />
                    <div className="relative m-[1px] rounded-[21px] bg-white/75 dark:bg-gray-950/65 backdrop-blur p-5 md:p-6 border border-white/40 dark:border-gray-800/60">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold tracking-[0.26em] uppercase text-gray-700/70 dark:text-gray-200/70">
                            Preview
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {ip && <Chip tone="amber">{ip}</Chip>}
                            {mediaType && <Chip>{mediaType}</Chip>}
                            {platform && <Chip tone="blue">{platform}</Chip>}
                            {duration && <Chip tone="purple">{duration}</Chip>}
                          </div>

                          {linkedMedia && (
                            <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                              Linked to a Media drop with the same slug.
                            </p>
                          )}

                          {scene && (
                            <p className="mt-3 text-sm text-gray-800 dark:text-gray-100 leading-relaxed">
                              <span className="font-semibold">Scene intent:</span> {scene}
                            </p>
                          )}

                          {mood && (
                            <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                              <span className="font-semibold">Mood:</span> {mood}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2 flex-wrap md:justify-end">
                          {licenseUrl && (
                            <a
                              href={licenseUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 rounded-full text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm hover:scale-105"
                            >
                              License →
                            </a>
                          )}
                          {downloadUrl && (
                            <a
                              href={downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-black transition shadow-sm hover:scale-105"
                            >
                              Download →
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Player */}
                      <div className="mt-5">
                        <MediaEmbed mediaUrl={media_url} audioUrl={audio_url} />
                      </div>

                      {/* Rights row */}
                      <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <Chip>Commercial-ready</Chip>
                          <Chip tone="blue">Fast review</Chip>
                          <Chip tone="amber">Option / Sync</Chip>
                          {!!rightsNote && <Chip>{rightsNote}</Chip>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="px-6 md:px-8 py-6 md:py-8 border-t border-gray-200/70 dark:border-gray-800">
                <div className="prose max-w-none prose-sm md:prose-base dark:prose-invert">
                  {renderContentBlocks(product.description)}
                </div>

                {/* Metadata Grid */}
                <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {product.price && (
                    <div className="p-4 bg-gray-100/50 dark:bg-gray-800/50 rounded-lg">
                      <p className="text-sm font-semibold">Price</p>
                      <p className="text-lg">${product.price.toFixed(2)}</p>
                    </div>
                  )}
                  {meta.year && (
                    <div className="p-4 bg-gray-100/50 dark:bg-gray-800/50 rounded-lg">
                      <p className="text-sm font-semibold">Year</p>
                      <p className="text-lg">{meta.year}</p>
                    </div>
                  )}
                  {/* Add more meta fields as needed */}
                </div>
              </div>
            </div>

            {/* Related Products Rails */}
            {relatedBooks.length > 0 && (
              <div className="mt-12">
                <h2 className="text-2xl font-bold text-center mb-6">Related Products</h2>
                <ProductRailRow
                  title="Related Designs"
                  subtitle="More merch from this universe"
                  items={relatedDesigns}
                />
                <ProductRailRow
                  title="Related Books"
                  subtitle="Books from this universe"
                  items={relatedBooks}
                />
                <ProductRailRow
                  title="Related Media"
                  subtitle="Media from this universe"
                  items={relatedMediaItems}
                />
                {!relatedDesigns.length && !relatedBooks.length && !relatedMediaItems.length && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow">Item 1</div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow">Item 2</div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg shadow">Item 3</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </article>

        <section id="subscribe" className="container mx-auto px-4 pt-0 pb-16">
          <div className="max-w-4xl mx-auto">
            <SubscriptionForm
              formId="8427848"
              uid="637df68a01"
              title="Subscribe to Publishing Updates"
              description="Get launch dates, exclusive previews, and behind-the-scenes notes from the Manyagi Universe."
            />
          </div>
        </section>

        <Recommender />
      </div>
    </>
  );
}