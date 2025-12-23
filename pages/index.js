// pages/index.js
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import { addToCart } from '../lib/cartSlice';

import Hero from '../components/Hero';
import SubscriptionForm from '../components/SubscriptionForm';
import Recommender from '../components/Recommender';
import Card from '../components/Card';
import SectionIntro from '../components/SectionIntro';

// ---------- Shared helpers ----------

function getCfgImg(val, fallback) {
  // site_config values might be a plain string URL or { file_url }
  if (!val) return fallback;
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val.file_url) return val.file_url;
  return fallback;
}

function productKey(p) {
  return p?.id || p?.slug || p?.name || '';
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Picks up to `count` items from `list` while respecting usedIds
function pickFrom(list, count, usedIds) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const picked = [];
  const pool = shuffle(list);

  for (const item of pool) {
    const key = productKey(item);
    if (!key || usedIds.has(key)) continue;
    picked.push(item);
    usedIds.add(key);
    if (picked.length >= count) break;
  }
  return picked;
}

// ---------- Tech helpers (mirrors /pages/tech.js) ----------

const asList = (v) => {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.items)) return v.items;
  return [];
};

const parseList = (v) => {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  if (typeof v === 'string') {
    return v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

const pickTechImage = (p) =>
  p?.featured_image ||
  p?.metadata?.screenshot ||
  'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/app-placeholder.webp';

// ---------- Media helpers (mirrors /pages/media.js logic) ----------

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

function pickCardImage(post, meta) {
  return (
    meta?.thumbnail_url ||
    post.thumbnail_url ||
    post.featured_image ||
    meta?.cover_url ||
    meta?.image_url ||
    '/placeholder.png'
  );
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

function normalizeApiList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.posts)) return json.posts;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.rows)) return json.rows;
  if (json && Array.isArray(json.items)) return json.items;
  return [];
}

function MediaEmbed({ mediaUrl, audioUrl }) {
  const url = (audioUrl || mediaUrl || '').trim();
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
      <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-gray-300 dark:border-gray-700">
        <iframe src={embed} title="Media Preview" className="w-full h-full" allowFullScreen />
      </div>
    );
  }

  if (isSpotify) {
    const embed = url.replace('open.spotify.com/', 'open.spotify.com/embed/');
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
    const parts = url.split('vimeo.com/');
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

export default function Home() {
  const dispatch = useDispatch();

  const [siteConfig, setSiteConfig] = useState({});
  const [products, setProducts] = useState([]);

  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [bookProducts, setBookProducts] = useState([]);
  const [merchProducts, setMerchProducts] = useState([]);

  const [techApps, setTechApps] = useState([]); // from /api/posts?division=tech
  const [blogPosts, setBlogPosts] = useState([]);

  // ✅ NEW: media items for home page "Listen Now"
  const [mediaItems, setMediaItems] = useState([]);

  // --- Fetch site config + products (books/merch/featured) ---
  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetch('/api/site-config')
          .then((r) => r.json())
          .catch(() => ({}));
        setSiteConfig(cfg || {});

        const res = await fetch('/api/products?limit=48');
        const json = await res.json().catch(() => []);
        const items = Array.isArray(json)
          ? json
          : Array.isArray(json.items)
          ? json.items
          : [];

        const normalized = items.map((p) => ({
          ...p,
          image_url:
            p.image_url ||
            p.thumbnail_url ||
            p.image ||
            p.imageUrl ||
            p.display_image ||
            '',
        }));

        setProducts(normalized);

        // Build sections without overlap (books, merch, featured)
        const usedIds = new Set();

        const publishing = normalized.filter(
          (p) => (p.division || '').toLowerCase() === 'publishing'
        );
        const designs = normalized.filter(
          (p) => (p.division || '').toLowerCase() === 'designs'
        );

        const books = pickFrom(publishing, 3, usedIds);
        const merch = pickFrom(designs, 3, usedIds);

        // Featured can be from any division, but must not reuse usedIds
        const featuredPool = normalized;
        const featured = pickFrom(featuredPool, 3, usedIds);

        setBookProducts(books);
        setMerchProducts(merch);
        setFeaturedProducts(
          featured.length ? featured : normalized.slice(0, 3)
        );
      } catch (e) {
        console.error('Home fetch error:', e);
        setProducts([]);
        setFeaturedProducts([]);
      }
    })();
  }, []);

  // --- Fetch Tech apps (same source as /pages/tech.js) ---
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/posts?division=tech');
        const json = await res.json().catch(() => ({}));

        const list = asList(json);
        const normalized = list.map((p) => {
          const meta = p.metadata || {};
          return {
            id: p.id,
            slug: p.slug,
            name: p.title,
            tagline: meta.tagline || '',
            description: p.content || p.excerpt || '',
            excerpt: p.excerpt || '',
            image: pickTechImage(p),
            domain: meta.app_url || '',
            appCategory: meta.app_category || 'flagship',
            appType: meta.app_type || 'app',
            status: meta.status || 'Live',
            platforms: parseList(meta.platforms),
            labels: parseList(meta.labels),
          };
        });

        setTechApps(normalized);
      } catch (e) {
        console.error('Home tech fetch error:', e);
        setTechApps([]);
      }
    })();
  }, []);

  // ✅ NEW: Fetch Media items (same source style as /pages/media.js)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/posts?division=media&limit=12');
        const json = await res.json().catch(() => ({}));
        const raw = normalizeApiList(json);

        const list = (raw || [])
          .map((p) => {
            const m = safeMeta(p.metadata);
            const media_type = normalizeType(m.media_type || '');
            const urls = bestUrl(m, p);
            const audio_url = urls.audio_url;
            const media_url = urls.media_url;

            const duration = asStr(m.duration || '').trim();
            const platform = asStr(m.platform || '').trim() || inferPlatform(media_url || audio_url);
            const ip = pickIp(m);
            const card_img = pickCardImage(p, m);

            return {
              id: p.id,
              slug: p.slug,
              title: p.title,
              excerpt: p.excerpt || '',
              content: p.content || '',
              created_at: p.created_at || m.created_at || null,
              metadata: m,
              media_type,
              audio_url,
              media_url,
              duration,
              platform,
              ip,
              card_img,
              scene: asStr(m.scene || '').trim(),
              mood: asStr(m.mood || '').trim(),
            };
          })
          .filter((it) => !!asStr(it.audio_url).trim() || !!asStr(it.media_url).trim())
          .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        setMediaItems(list.slice(0, 6)); // show 6 on home
      } catch (e) {
        console.error('Home media fetch error:', e);
        setMediaItems([]);
      }
    })();
  }, []);

  // --- Fetch latest blog posts for the home page ---
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/posts?limit=6');
        const json = await res.json().catch(() => []);
        const posts = Array.isArray(json)
          ? json
          : Array.isArray(json.items)
          ? json.items
          : [];

        const sorted = posts
          .slice()
          .sort(
            (a, b) =>
              new Date(b.created_at || 0).getTime() -
              new Date(a.created_at || 0).getTime()
          );

        setBlogPosts(sorted.slice(0, 3));
      } catch (e) {
        console.error('Home blog fetch error:', e);
        setBlogPosts([]);
      }
    })();
  }, []);

  const carouselImages = siteConfig.carousel_images || [
    '/images/home-carousel-1.webp',
    '/images/home-carousel-2.webp',
    '/images/home-carousel-3.webp',
  ];

  const heroImage = getCfgImg(siteConfig.hero, '/videos/hero-bg.mp4');

  // Division card images with safe fallbacks
  const publishingImg = getCfgImg(
    siteConfig.publishing_hero,
    '/images/legacy-chapter-1.webp'
  );
  const designsImg = getCfgImg(
    siteConfig.designs_hero,
    '/images/mock-tee-1.webp'
  );
  const capitalImg = getCfgImg(
    siteConfig.capital_hero,
    '/images/chart-hero.webp'
  );
  const techImg = getCfgImg(
    siteConfig.tech_hero,
    '/images/daito-screenshot.webp'
  );
  const mediaImg = getCfgImg(
    siteConfig.media_hero,
    '/images/og-media.webp'
  );
  const realtyImg = getCfgImg(
    siteConfig.realty_hero,
    'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/realty-hero.webp'
  );

  const BLOG_PLACEHOLDER =
    'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/og-blog.webp';

  // Compute Tech showcase: random flagship apps (non-"upcoming")
  const flagshipApps = techApps.filter(
    (app) => (app.appCategory || '').toLowerCase() !== 'upcoming'
  );
  const techShowcase =
    flagshipApps.length > 0 ? shuffle(flagshipApps).slice(0, 3) : [];

  // --- Card render helpers (products) ---

  const renderPublishingCard = (product) => {
    const m = product.metadata || {};
    const buyUrl =
      m.amazon_url ||
      m.kindle_url ||
      m.paperback_url ||
      m.store_url ||
      null;

    const alsoLinks = [
      m.kindle_url ? { label: 'Kindle', url: m.kindle_url } : null,
      m.paperback_url ? { label: 'Paperback', url: m.paperback_url } : null,
    ].filter(Boolean);

    const chips = [
      m.format ? String(m.format).toUpperCase() : null,
      m.year ? `Y${m.year}` : null,
    ].filter(Boolean);

    return (
      <Card
        key={productKey(product)}
        title={product.name}
        description={product.description}
        image={product.image_url}
        category={product.division}
        tags={Array.isArray(product.tags) ? product.tags : []}
      >
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mb-2">
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

        <div className="flex flex-wrap gap-3 mt-2 justify-center">
          {buyUrl && (
            <a
              href={buyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition text-xs font-semibold"
            >
              Get Your Copy
            </a>
          )}
          {m.pdf_url && (
            <a
              href={m.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn bg-gray-900 text-white py-2 px-4 rounded hover:bg-black transition text-xs font-semibold"
            >
              Read Chapter 1
            </a>
          )}
        </div>

        {alsoLinks.length > 0 && (
          <p className="mt-3 text-[11px] text-gray-600">
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
          </p>
        )}
      </Card>
    );
  };

  const renderProductCard = (product) => {
    if (!product) return null;

    if ((product.division || '').toLowerCase() === 'publishing') {
      return renderPublishingCard(product);
    }

    return (
      <Card
        key={productKey(product)}
        title={product.name}
        description={product.description}
        image={product.image_url}
        category={product.division}
        buyButton={product}
        onBuy={() =>
          dispatch(
            addToCart({
              ...product,
              productType:
                (product.division || '').toLowerCase() === 'designs'
                  ? 'merch'
                  : (product.division || '').toLowerCase() === 'capital'
                  ? 'download'
                  : 'product',
            })
          )
        }
      />
    );
  };

  // ✅ NEW: Media card with inline player
  const renderMediaCard = (item) => {
    const chips = [
      item.media_type ? item.media_type : null,
      item.platform ? item.platform : null,
      item.duration ? item.duration : null,
      item.ip ? item.ip : null,
    ].filter(Boolean);

    const desc = item.scene || item.excerpt || 'New media drop from the Manyagi Universe.';

    return (
      <Card
        key={item.slug || item.id}
        title={item.title}
        description={desc}
        image={item.card_img}
        category="media"
      >
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center mb-3">
            {chips.slice(0, 4).map((c) => (
              <span
                key={c}
                className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2">
          <MediaEmbed mediaUrl={item.media_url} audioUrl={item.audio_url} />
        </div>

        <div className="pt-3 flex justify-center gap-3 flex-wrap">
          <Link
            href={`/media/${item.slug}`}
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            Listen / View →{/* keeps it general for video/audio */}
          </Link>
          <Link
            href="/media"
            className="text-sm font-semibold text-gray-700 dark:text-gray-200 hover:underline"
          >
            Full Media Library →
          </Link>
        </div>
      </Card>
    );
  };

  // Micro-nav rails under hero
  const rails = [
    { label: 'Read', href: '#books' },
    { label: 'Wear', href: '#merch' },
    { label: 'Trade', href: '#featured' },
    { label: 'Build', href: '#tech' },
    { label: 'Listen', href: '#listen' }, // ✅ NEW
    { label: 'Watch', href: '#blog' },
    { label: 'Live', href: '#divisions' },
  ];

  return (
    <>
      <Head>
        <title>Manyagi — Creativity Meets Innovation</title>
        <meta
          name="description"
          content="Manyagi is a story-first studio and product lab building books, designs, tools, apps, and experiences that live in one connected universe."
        />
        {getCfgImg(siteConfig.favicon, null) && (
          <link rel="icon" href={getCfgImg(siteConfig.favicon)} />
        )}
      </Head>

      {/* HERO */}
      <Hero
        kicker="The Manyagi Universe"
        title="One Brand. Many Worlds."
        lead="Stories, products, and platforms built to talk to each other — from novels and merch to trading tools and apps. Creativity meets innovation under one roof."
        carouselImages={carouselImages}
        videoSrc={heroImage}
        height="h-[600px]"
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="#featured"
            className="btn bg-blue-600 text-white py-2 px-4 rounded hover:scale-105 transition text-sm font-semibold"
          >
            Enter the Universe
          </Link>
          <Link
            href="#divisions"
            className="btn bg-white/90 text-gray-900 border border-gray-300 py-2 px-4 rounded hover:bg-gray-50 transition text-sm font-semibold"
          >
            Explore the Divisions
          </Link>
        </div>
      </Hero>

      {/* MICRO NAV RAILS */}
      <section className="border-b border-black/5 dark:border-white/10 bg-white/70 dark:bg-gray-950/70 backdrop-blur">
        <div className="container mx-auto px-4 py-3">
          <div className="flex gap-3 overflow-x-auto text-[11px] font-semibold tracking-[0.25em] uppercase">
            {rails.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="inline-flex items-center rounded-full px-3 py-1.5 bg-white dark:bg-gray-900 shadow-sm border border-gray-200/70 dark:border-gray-700/70 hover:shadow-md hover:-translate-y-[1px] transition text-gray-800 dark:text-gray-100 whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* DIVISIONS OVERVIEW */}
      <SectionIntro
        id="divisions"
        kicker="A Manyagi Company"
        title="Six Divisions, One Connected Ecosystem"
        lead="Publishing, Designs, Capital, Tech, Media, and Realty — each with its own focus, all serving the same long-term universe."
        tone="neutral"
        align="center"
      />

      <section className="container mx-auto px-4 pb-16 grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card
          title="Publishing"
          description="Novels, poetry, and written worlds designed to travel beyond the page."
          image={publishingImg}
          link="/publishing"
          category="publishing"
        />
        <Card
          title="Designs"
          description="Apparel, posters, and collectibles that let you wear the worlds you love."
          image={designsImg}
          link="/designs"
          category="designs"
        />
        <Card
          title="Capital"
          description="Signals, strategies, and tools focused on practical, steady growth."
          image={capitalImg}
          link="/capital"
          category="capital"
        />
        <Card
          title="Tech"
          description="Apps and platforms for commerce, community, and creators."
          image={techImg}
          link="/tech"
          category="tech"
        />
        <Card
          title="Media"
          description="Audio, video, and social storytelling built for the modern feed."
          image={mediaImg}
          link="/media"
          category="media"
        />
        <Card
          title="Realty"
          description="Future-facing real estate concepts to anchor the digital worlds."
          image={realtyImg}
          link="/realty"
          category="realty"
        />
      </section>

      {/* FEATURED PRODUCTS & DROPS */}
      <SectionIntro
        id="featured"
        kicker="Spotlight"
        title="Featured Products & Drops"
        lead="A rotating showcase from across the universe — books, designs, tools, and apps that capture where Manyagi is right now."
        tone="card"
        align="center"
      />

      <section className="container mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(featuredProducts.length ? featuredProducts : products.slice(0, 3)).map(
            (product) => renderProductCard(product)
          )}
        </div>
      </section>

      {/* BOOKS SECTION */}
      <SectionIntro
        id="books"
        kicker="Manyagi Publishing"
        title="Books From the Universe"
        lead="Story-first IP — novels and poetry that seed the rest of the ecosystem, from merch and media to future adaptations."
        tone="neutral"
        align="center"
      >
        <Link
          href="/publishing"
          className="inline-flex items-center text-xs font-semibold text-blue-700 hover:underline"
        >
          Visit Publishing →
        </Link>
      </SectionIntro>

      <section className="container mx-auto px-4 pb-16">
        {bookProducts.length === 0 ? (
          <p className="text-center text-sm opacity-70">
            New titles are being prepared behind the scenes.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {bookProducts.map((product) => renderPublishingCard(product))}
          </div>
        )}
      </section>

      {/* MERCH & NFTS SECTION */}
      <SectionIntro
        id="merch"
        kicker="Designs & Collectibles"
        title="Merch, Art & Future NFTs"
        lead="Wear the worlds, frame the scenes, and collect moments from the stories — built through Designs and future digital drops."
        tone="neutral"
        align="center"
      >
        <Link
          href="/designs"
          className="inline-flex items-center text-xs font-semibold text-blue-700 hover:underline"
        >
          Explore Designs →
        </Link>
      </SectionIntro>

      <section className="container mx-auto px-4 pb-16">
        {merchProducts.length === 0 ? (
          <p className="text-center text-sm opacity-70">
            New drops are being staged. Check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {merchProducts.map((product) => renderProductCard(product))}
          </div>
        )}
      </section>

      {/* TECH SECTION — pulls from /api/posts?division=tech */}
      <SectionIntro
        id="tech"
        kicker="Manyagi Tech"
        title="Platforms, Apps & Tools"
        lead="Digital infrastructure for the universe — from commerce and community to productivity and trading."
        tone="neutral"
        align="center"
      >
        <Link
          href="/tech"
          className="inline-flex items-center text-xs font-semibold text-blue-700 hover:underline"
        >
          Visit Tech →
        </Link>
      </SectionIntro>

      <section className="container mx-auto px-4 pb-16">
        {techShowcase.length === 0 ? (
          <p className="text-center text-sm opacity-70">
            New builds are in development — launches will appear here first.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {techShowcase.map((app) => (
              <Card
                key={app.id}
                title={app.name}
                description={app.description || app.excerpt}
                image={app.image}
                category="tech"
              >
                {app.tagline && (
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {app.tagline}
                    </p>
                  </div>
                )}

                {app.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {app.labels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-[11px] font-medium text-gray-700 dark:text-gray-200"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}

                {app.platforms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {app.platforms.map((plat) => (
                      <span
                        key={plat}
                        className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-700 px-2.5 py-0.5 text-[11px] text-gray-700 dark:text-gray-200"
                      >
                        {plat}
                      </span>
                    ))}
                  </div>
                )}

                {app.domain ? (
                  <a
                    href={app.domain}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition"
                  >
                    Open Site / Download
                  </a>
                ) : (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Coming soon
                  </span>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ✅ NEW: LISTEN NOW (Media player section on Home) */}
      <SectionIntro
        id="listen"
        kicker="Manyagi Media"
        title="Listen Now"
        lead="Fresh soundtracks and audio drops — playable right here. Built for fans and Hollywood scanning the vibe in seconds."
        tone="card"
        align="center"
      >
        <Link
          href="/media"
          className="inline-flex items-center text-xs font-semibold text-blue-700 hover:underline"
        >
          Open the Media Library →
        </Link>
      </SectionIntro>

      <section className="container mx-auto px-4 pb-16">
        {mediaItems.length === 0 ? (
          <p className="text-center text-sm opacity-70">
            No media drops yet. Upload a track in Admin → Media (it will appear here automatically).
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {mediaItems.map((item) => renderMediaCard(item))}
          </div>
        )}
      </section>

      {/* BLOG SECTION */}
      <SectionIntro
        id="blog"
        kicker="Manyagi Blog"
        title="Notes From the Build"
        lead="Strategy, behind-the-scenes logs, and creative process entries as the universe grows in public."
        tone="card"
        align="center"
      >
        <Link
          href="/blog"
          className="inline-flex items-center text-xs font-semibold text-blue-700 hover:underline"
        >
          Read all posts →
        </Link>
      </SectionIntro>

      <section className="container mx-auto px-4 pb-16">
        {blogPosts.length === 0 ? (
          <p className="text-center text-sm opacity-70">
            First entries are coming soon.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {blogPosts.map((post) => (
              <Card
                key={post.slug || post.id}
                title={post.title}
                description={
                  post.excerpt ||
                  'A new dispatch from the Manyagi universe — strategy, systems, and story-first building.'
                }
                image={post.featured_image || BLOG_PLACEHOLDER}
                category={post.division || 'Manyagi Blog'}
              >
                <div className="pt-2 flex justify-center">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Read story →
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* EMAIL CAPTURE / NEWSLETTER */}
      <SectionIntro
        id="subscribe"
        kicker="Stay Ahead"
        title="Get Chapter 1, New Drops & Early Access"
        lead="Short, focused updates from across the universe — books, merch, tools, apps, and more. No spam, just signal."
        tone="neutral"
        align="center"
      />

      <section className="container mx-auto px-4 pt-4 pb-16">
        <SubscriptionForm
          formId="8427635"
          uid="db12290300"
          title="Join the Manyagi List"
          description="Be first in line for new releases, beta invites, and behind-the-scenes notes."
        />
      </section>

      {/* CROSS-DIVISION RECOMMENDER */}
      <Recommender />
    </>
  );
}
