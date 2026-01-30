// pages/designs/[slug].js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToCart } from '../../lib/cartSlice';
import SubscriptionForm from '../../components/SubscriptionForm';
import Recommender from '../../components/Recommender';
import SectionIntro from '../../components/SectionIntro';

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
  if (!div) return 'Designs';
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

export default function DesignProduct() {
  const router = useRouter();
  const { slug } = router.query;
  const dispatch = useDispatch();

  const [product, setProduct] = useState(null);
  const [linkedMedia, setLinkedMedia] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    (async () => {
      setLoading(true);
      setProduct(null);
      setLinkedMedia(null);

      try {
        const res = await fetch(`/api/products/${slug}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) throw new Error(data?.error || 'Product not found');

        const m0 = safeMeta(data?.metadata);
        const u0 = bestUrl(m0, data || {});
        const hasDirectMedia = !!asStr(u0.audio_url).trim() || !!asStr(u0.media_url).trim();

        setProduct(data);

        if (!hasDirectMedia) {
          try {
            const res2 = await fetch(`/api/products?division=media&limit=50`);
            const json2 = await res2.json().catch(() => ({}));
            const raw = Array.isArray(json2?.items) ? json2.items : Array.isArray(json2) ? json2 : [];
            const match = raw.find((p) => asStr(p?.slug) === asStr(slug));
            if (match) setLinkedMedia(match);
          } catch (e2) {
            console.warn('Media lookup failed:', e2);
          }
        }
      } catch (e) {
        console.error('Design product fetch error:', e);
        setProduct({
          id: 'fallback-tee',
          name: 'Sample T-Shirt',
          slug: 'fallback-tee',
          description: 'Fallback design merchandise. Made with 100% cotton for comfort.',
          created_at: '2025-09-01T00:00:00Z',
          featured_image: PLACEHOLDER_IMAGE,
          division: 'designs',
          price: 29.99,
          printful_product_id: 'fallback-tee-id',
          productType: 'merch',
          metadata: { book: 'Sample', prompt: 1 },
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
  const contactEmail = asStr(meta?.contact_email).trim() || 'studios@manyagi.net';

  const mediaSlug = asStr(linkedMedia?.slug || product?.slug).trim();

  const handleAddToCart = () => {
    if (!product) return;
    dispatch(
      addToCart({
        ...product,
        productType: 'merch',
        printful_product_id: product.printful_product_id,
        metadata: product.metadata || {},
      })
    );
  };

  if (loading) {
    return <div className="container mx-auto px-4 py-16 text-center">Loading product…</div>;
  }
  if (!product) {
    return <div className="container mx-auto px-4 py-16 text-center">Product not found.</div>;
  }

  return (
    <>
      <Head>
        <title>{product.name} — Manyagi Designs</title>
        <meta name="description" content={product.description || 'Merch from the Manyagi Universe.'} />
      </Head>

      {/* Premium background wash */}
      <div className="relative">
        <div className="absolute inset-0 -z-10">
          <div className="h-[520px] bg-gradient-to-b from-amber-200/60 via-amber-100/30 to-transparent dark:from-amber-900/20 dark:via-amber-900/10" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.14),transparent_55%)]" />
        </div>

        <SectionIntro
          id="product-header"
          kicker="Manyagi Designs"
          title={product.name}
          lead={product.description || 'A premium design from the Manyagi Universe.'}
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
            {/* Back row */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <Link
                href="/designs"
                className="inline-flex items-center text-xs text-gray-600 hover:text-blue-600 dark:text-gray-300"
              >
                ← Back to Designs
              </Link>

              {/* Executive quick actions (always visible) */}
              <div className="flex gap-2 flex-wrap justify-end">
                <Link
                  href="/designs"
                  className="px-4 py-2 rounded-full text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60 hover:bg-white dark:hover:bg-gray-900 transition shadow-sm"
                >
                  Designs Library →
                </Link>
                {mediaSlug && (
                  <Link
                    href={`/media/${mediaSlug}`}
                    className="px-4 py-2 rounded-full text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm"
                  >
                    Media Detail →
                  </Link>
                )}
                <a
                  href={`mailto:${contactEmail}?subject=${encodeURIComponent(
                    `Inquiry — ${product.name}`
                  )}`}
                  className="px-4 py-2 rounded-full text-xs font-semibold border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/30 transition shadow-sm"
                >
                  Contact
                </a>
              </div>
            </div>

            {/* MAIN CARD */}
            <div className="rounded-[28px] border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-950/60 backdrop-blur shadow-[0_10px_50px_-20px_rgba(0,0,0,0.35)] overflow-hidden">
              {/* Media panel: premium look */}
              {showMediaPanel && hasMedia && (
                <div className="p-6 md:p-8 border-b border-gray-200/70 dark:border-gray-800">
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
                              className="px-4 py-2 rounded-full text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-sm"
                            >
                              License →
                            </a>
                          )}
                          {downloadUrl && (
                            <a
                              href={downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-black transition shadow-sm"
                            >
                              Download →
                            </a>
                          )}
                          <a
                            href={`mailto:${contactEmail}?subject=${encodeURIComponent(
                              `Inquiry — ${product.name}`
                            )}`}
                            className="px-4 py-2 rounded-full text-sm font-semibold border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/60 hover:bg-gray-50 dark:hover:bg-gray-900 transition shadow-sm"
                          >
                            Inquire →
                          </a>
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

                        <div className="text-xs text-gray-600 dark:text-gray-300">
                          For inquiries: <span className="font-semibold">{contactEmail}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Featured image */}
              {product.featured_image && (
                <div className="px-6 md:px-8 pt-6 md:pt-8">
                  <div className="overflow-hidden rounded-2xl bg-black/5 border border-gray-200/60 dark:border-gray-800">
                    <img
                      src={product.featured_image || PLACEHOLDER_IMAGE}
                      alt={product.name}
                      className="w-full h-64 md:h-80 object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="px-6 md:px-8 py-6 md:py-8">
                <div className="prose max-w-none prose-sm md:prose-base dark:prose-invert">
                  {renderContentBlocks(product.description)}
                </div>
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={handleAddToCart}
                    className="px-6 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition shadow-sm"
                  >
                    Add to Cart - ${product.price?.toFixed(2)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </article>

        <section id="subscribe" className="container mx-auto px-4 pt-0 pb-16">
          <div className="max-w-4xl mx-auto">
            <SubscriptionForm
              formId="8432506"
              uid="a194031db7"
              title="Subscribe to Designs Updates"
              description="Get notified about new drops, limited runs, NFT releases, and exclusive offers from Manyagi Designs."
            />
          </div>
        </section>

        <Recommender />
      </div>
    </>
  );
}