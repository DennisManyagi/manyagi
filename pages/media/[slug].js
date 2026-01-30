// pages/media/[slug].js
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
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
  if (!div) return 'Media';
  return div.charAt(0).toUpperCase() + div.slice(1);
}

/* -------------------------------
   Media helpers (shared across site)
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
  // Prefer metadata first (like list page), then fall back to root-level fields (common on single-item endpoints)
  const audio =
    asStr(meta?.audio_url).trim() ||
    asStr(post?.audio_url).trim() ||
    '';

  const media =
    asStr(meta?.media_url).trim() ||
    asStr(post?.media_url).trim() ||
    '';

  return {
    audio_url: audio,
    media_url: media,
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

function normalizeApiList(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.posts)) return json.posts;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && Array.isArray(json.rows)) return json.rows;
  if (json && Array.isArray(json.items)) return json.items;
  return [];
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
    const embed = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&show_teaser=true`;
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

      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
        {items.map((p) => {
          const art = pickProductArt(p);
          const urls = bestUrl(safeMeta(p.metadata), p);
          const hasMedia = !!asStr(urls.audio_url).trim() || !!asStr(urls.media_url).trim();

          return (
            <Link
              key={p.id}
              href={`/blog/${p.slug}`}
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

                {/* Play icon overlay if media */}
                {hasMedia && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                      <svg className="w-8 h-8 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7L8 5z" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Top chips */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-[11px] px-2 py-1 rounded-full bg-white/90 text-black font-semibold">
                      {formatDivision(p.division)}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/70">
                    {formatDate(p.created_at)}
                  </div>
                </div>

                {/* Title */}
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="text-[11px] tracking-[0.26em] uppercase text-white/70">
                    Media
                  </div>
                  <div className="text-xl font-bold text-white leading-tight">
                    {p.title || p.name}
                  </div>
                </div>
              </div>

              <div className="p-5">
                <p className="text-sm opacity-80 line-clamp-3">
                  {p.excerpt || p.description || 'Media from the Manyagi Universe.'}
                </p>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-semibold underline">
                    Play →
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

export default function MediaDetail() {
  const router = useRouter();
  const { slug } = router.query;

  const [post, setPost] = useState(null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [linkedMedia, setLinkedMedia] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    (async () => {
      setLoading(true);
      setPost(null);
      setLinkedMedia(null);
      setRelatedPosts([]);

      try {
        // Fetch current post
        const res = await fetch(`/api/posts/${slug}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) throw new Error(data?.error || 'Post not found');

        setPost(data);

        const m0 = safeMeta(data?.metadata);
        const u0 = bestUrl(m0, data || {});
        const hasDirectMedia = !!asStr(u0.audio_url).trim() || !!asStr(u0.media_url).trim();

        if (!hasDirectMedia) {
          try {
            const res2 = await fetch(`/api/posts?division=site&limit=50`);
            const json2 = await res2.json().catch(() => ({}));
            const raw = normalizeApiList(json2);
            const match = (raw || []).find((p) => asStr(p?.slug) === asStr(slug));
            if (match) setLinkedMedia(match);
          } catch (e2) {
            console.warn('Blog lookup failed:', e2);
          }
        }

        // Extract IP/universe for related
        const meta = safeMeta(data?.metadata);
        const ip = pickIp(meta);
        if (ip) {
          const relatedRes = await fetch(`/api/posts?division=media&limit=50`);
          const relatedJson = await relatedRes.json().catch(() => ({}));
          const allMedia = Array.isArray(relatedJson) ? relatedJson : (relatedJson.posts || relatedJson.data || []);
          const filtered = allMedia.filter(p => 
            p.slug !== slug &&
            pickIp(safeMeta(p.metadata)) === ip
          );
          setRelatedPosts(filtered);
        }
      } catch (e) {
        console.error('Media detail fetch error:', e);
        setPost({
          id: 'fallback-track',
          title: 'Sample Track',
          slug: 'fallback-track',
          excerpt: 'A sample media entry.',
          created_at: '2025-09-01T00:00:00Z',
          featured_image: PLACEHOLDER_IMAGE,
          division: 'media',
          metadata: { media_url: '' },
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const mediaSource = linkedMedia || post;

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

  const duration = asStr(meta?.duration).trim();
  const mood = asStr(meta?.mood).trim();
  const scene = asStr(meta?.scene).trim();
  const downloadUrl = asStr(meta?.download_url).trim();
  const licenseUrl = asStr(meta?.license_url).trim();
  const rightsNote = asStr(meta?.rights_note).trim();
  const contactEmail = asStr(meta?.contact_email).trim() || 'studios@manyagi.net';

  const metaLineParts = useMemo(() => {
    if (!post) return [];
    return [
      formatDate(post.created_at),
      formatDivision(post.division),
    ].filter(Boolean);
  }, [post]);

  const relatedMedia = relatedPosts; // All related are media

  if (loading) {
    return <div className="container mx-auto px-4 py-16 text-center">Loading media…</div>;
  }
  if (!post) {
    return <div className="container mx-auto px-4 py-16 text-center">Media not found.</div>;
  }

  return (
    <>
      <Head>
        <title>{post.title} — Manyagi Media</title>
        <meta name="description" content={post.excerpt || 'Media from the Manyagi Universe.'} />
      </Head>

      <div className="relative">
        <div className="absolute inset-0 -z-10">
          <div className="h-[520px] bg-gradient-to-b from-amber-200/60 via-amber-100/30 to-transparent dark:from-amber-900/20 dark:via-amber-900/10" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.14),transparent_55%)]" />
        </div>

        <SectionIntro
          id="media-header"
          kicker="Manyagi Media"
          title={post.title}
          lead={post.excerpt || 'A sonic dispatch from the Manyagi Universe.'}
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
            {/* Back bar */}
            <div className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-3 bg-white/80 dark:bg-gray-950/80 backdrop-blur py-2 px-4 rounded-full shadow-md">
              <Link
                href="/media"
                className="inline-flex items-center text-xs text-gray-600 hover:text-blue-600 dark:text-gray-300"
              >
                ← Back to Media
              </Link>
            </div>

            {/* MAIN CARD */}
            <div className="rounded-[28px] overflow-hidden border border-gray-200/80 dark:border-gray-800 bg-white/70 dark:bg-gray-900/50 shadow-[0_10px_50px_-20px_rgba(0,0,0,0.35)]">
              <div className="grid grid-cols-1 lg:grid-cols-2">
                <div className="p-7 md:p-10">
                  <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">
                    Featured Media
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold mt-2 leading-tight">
                    {post.title}
                  </h2>
                  <p className="mt-3 opacity-80 max-w-xl">
                    {post.excerpt || 'A premium audio/visual piece from the Manyagi Universe.'}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {metaLineParts.length > 0 && <Chip>{metaLineParts.join(' • ')}</Chip>}
                    {ip && <Chip tone="amber">{ip}</Chip>}
                    {mediaType && <Chip>{mediaType}</Chip>}
                    {platform && <Chip tone="blue">{platform}</Chip>}
                  </div>

                  <div className="mt-7 flex gap-3 flex-wrap">
                    {licenseUrl && (
                      <a
                        href={licenseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        License Track →
                      </a>
                    )}
                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-2 rounded-xl bg-black text-white hover:bg-gray-800"
                      >
                        Download →
                      </a>
                    )}
                  </div>
                </div>

                <div className="relative min-h-[320px]">
                  <img
                    src={pickProductArt(post)}
                    alt={post.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>

              {/* Media Player Panel */}
              {hasMedia && (
                <div className="p-6 md:p-8 border-t border-gray-200/70 dark:border-gray-800">
                  <div className="relative rounded-[22px] overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-200/60 via-blue-200/40 to-purple-200/50 dark:from-amber-900/30 dark:via-blue-900/20 dark:to-purple-900/25" />
                    <div className="relative m-[1px] rounded-[21px] bg-white/75 dark:bg-gray-950/65 backdrop-blur p-5 md:p-6 border border-white/40 dark:border-gray-800/60">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
                        <div>
                          <div className="text-[11px] font-semibold tracking-[0.26em] uppercase text-gray-700/70 dark:text-gray-200/70">
                            Playback
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {ip && <Chip tone="amber">{ip}</Chip>}
                            {mediaType && <Chip>{mediaType}</Chip>}
                            {platform && <Chip tone="blue">{platform}</Chip>}
                            {duration && <Chip tone="purple">{duration}</Chip>}
                          </div>
                          {linkedMedia && (
                            <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
                              Linked to a Blog post with the same slug — built for fast review + licensing.
                            </p>
                          )}
                          {scene && (
                            <p className="mt-3 text-sm text-gray-800 dark:text-gray-100">
                              <span className="font-semibold">Scene:</span> {scene}
                            </p>
                          )}
                          {mood && (
                            <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">
                              <span className="font-semibold">Mood:</span> {mood}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-5">
                        <MediaEmbed mediaUrl={media_url} audioUrl={audio_url} />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Chip>Commercial-ready</Chip>
                        <Chip tone="blue">Fast review</Chip>
                        <Chip tone="amber">Option / Sync</Chip>
                        {!!rightsNote && <Chip>{rightsNote}</Chip>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Content */}
              {post.content && (
                <div className="px-6 md:px-8 py-6 md:py-8 border-t border-gray-200/70 dark:border-gray-800">
                  <div className="prose max-w-none prose-sm md:prose-base dark:prose-invert">
                    {post.content.split(/\n\s*\n/).map((block, i) => (
                      <p key={i} className="mb-4 leading-relaxed">{block.trim()}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Related Media */}
            {relatedMedia.length > 0 && (
              <div className="mt-12">
                <h2 className="text-2xl font-bold text-center mb-6">Related Media</h2>
                <ProductRailRow
                  title="More from this Universe"
                  subtitle="Other tracks and media in the same world"
                  items={relatedMedia}
                />
              </div>
            )}
          </div>
        </article>

        <section id="subscribe" className="container mx-auto px-4 pt-0 pb-16">
          <div className="max-w-4xl mx-auto">
            <SubscriptionForm
              formId="8432508"
              uid="c2f94e1f9b"
              title="Subscribe to Media Updates"
              description="Get new track drops, licensing alerts, and behind-the-scenes notes from Manyagi Media."
            />
          </div>
        </section>

        <Recommender />
      </div>
    </>
  );
}