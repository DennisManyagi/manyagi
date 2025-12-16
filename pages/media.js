import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Hero from "@/components/Hero";
import Recommender from "@/components/Recommender";
import SectionIntro from "@/components/SectionIntro";
import SubscriptionForm from "@/components/SubscriptionForm";

function groupBy(arr, key) {
  return (arr || []).reduce((acc, item) => {
    const k = String(item?.[key] || "other").toLowerCase();
    acc[k] = acc[k] || [];
    acc[k].push(item);
    return acc;
  }, {});
}

function pickCardImage(post) {
  return post.thumbnail_url || post.featured_image || post?.metadata?.cover_url || "/placeholder.png";
}

function inferPlatform(mediaUrl) {
  if (!mediaUrl) return "";
  const url = mediaUrl.toLowerCase();
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("spotify.com")) return "Spotify";
  if (url.includes("soundcloud.com")) return "SoundCloud";
  if (url.includes("vimeo.com")) return "Vimeo";
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("instagram.com")) return "Instagram";
  return "";
}

function primaryCtaLabel(mediaType) {
  switch ((mediaType || "").toLowerCase()) {
    case "podcast":
      return "Open Episode";
    case "playlist":
      return "View Playlist";
    case "reel":
    case "short":
      return "Open Reel";
    case "audiobook":
      return "Open Audiobook";
    default:
      return "View Details";
  }
}

function MediaEmbed({ mediaUrl }) {
  if (!mediaUrl) return null;
  const url = mediaUrl.trim();

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
  const isSpotify = url.includes("open.spotify.com");
  const isSoundCloud = url.includes("soundcloud.com");
  const isVimeo = url.includes("vimeo.com");

  if (isYouTube) {
    let embed = url;
    if (url.includes("watch?v=")) {
      const id = url.split("watch?v=")[1].split("&")[0];
      embed = `https://www.youtube.com/embed/${id}`;
    } else if (url.includes("youtu.be/")) {
      const id = url.split("youtu.be/")[1].split(/[?&]/)[0];
      embed = `https://www.youtube.com/embed/${id}`;
    }
    return (
      <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden border border-gray-300 dark:border-gray-700">
        <iframe src={embed} title="Media Preview" className="w-full h-full" allowFullScreen />
      </div>
    );
  }

  if (isSpotify) {
    // Convert open.spotify.com/<type>/<id> -> open.spotify.com/embed/<type>/<id>
    const embed = url.replace("open.spotify.com/", "open.spotify.com/embed/");
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
    const parts = url.split("vimeo.com/");
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
      className="inline-block bg-blue-600 text-white text-sm font-semibold py-2 px-3 rounded-full hover:bg-blue-700 transition"
    >
      View Media
    </a>
  );
}

export default function MediaPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/posts?division=media");
        const json = await res.json();
        const list = Array.isArray(json)
          ? json.map((p) => {
              const metadata = p.metadata || {};
              const media_url = metadata.media_url || "";
              const media_type = metadata.media_type || "";
              const duration = metadata.duration || "";
              const platform = metadata.platform || inferPlatform(media_url);
              const primaryBook = metadata.book || metadata.series || "";

              return {
                ...p,
                card_img: pickCardImage(p),
                media_type,
                media_url,
                duration,
                platform,
                primaryBook,
              };
            })
          : [];
        setItems(list);
      } catch (err) {
        console.error("media fetch error:", err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const carouselImages = [
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-1.webp",
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-2.webp",
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-3.webp",
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-4.webp",
    "https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/video-carousel-5.webp",
  ];

  const byType = useMemo(() => groupBy(items, "media_type"), [items]);

  if (loading) {
    return <div className="container mx-auto px-4 py-16 text-center">Loading media...</div>;
  }

  return (
    <>
      <Head>
        <title>Manyagi Media — Stories in Motion</title>
        <meta name="description" content="Playlists, podcasts, reels, and audiobooks from the Manyagi universe." />
      </Head>

      <Hero
        kicker="Manyagi Media"
        title="Stories in Motion"
        lead="Playlists, trailers, podcasts, and reels that bring the Manyagi Universe to life."
        carouselImages={carouselImages}
        height="h-[600px]"
      >
        <Link href="#media" className="btn bg-blue-600 text-white py-3 px-5 rounded hover:scale-105 transition">
          Browse Media
        </Link>
      </Hero>

      <section className="container mx-auto px-4 -mt-8 mb-10">
        <div className="flex gap-2 overflow-x-auto no-scrollbar justify-center text-xs md:text-[13px]">
          {[
            { href: "#trailers", label: "Trailers" },
            { href: "#playlists", label: "Playlists" },
            { href: "#podcasts", label: "Podcasts" },
            { href: "#reels", label: "Reels" },
            { href: "#subscribe", label: "Updates" },
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

      <SectionIntro
        kicker="Manyagi Media"
        title="Audio-Visual Extensions of the Universe"
        lead="From cinematic trailers to thematic playlists, our media brings the stories to life in new ways."
        tone="warm"
      />

      <section id="media" className="container mx-auto px-4 py-10">
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex flex-col items-center gap-2 px-4 py-3 rounded-2xl bg-white/80 border border-amber-200/70 shadow-sm text-sm text-gray-700 text-center dark:bg-gray-900/70 dark:border-amber-800/60 dark:text-gray-100">
            <span className="text-[11px] font-semibold tracking-[0.26em] uppercase text-amber-700/80 dark:text-amber-300/80">
              Media Library
            </span>
            <span>
              Showing <span className="font-semibold">{items.length}</span> items.
            </span>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg">No media items yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {items.map((item) => (
              <div key={item.id} className="rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                <div className="relative h-48">
                  <img src={item.card_img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-tr from-black/55 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="text-[11px] tracking-[0.28em] uppercase text-white/80">{item.media_type || "Media"}</div>
                    <div className="text-xl font-bold text-white">{item.title}</div>
                  </div>
                </div>

                <div className="p-5">
                  <p className="text-sm opacity-80 line-clamp-3">{item.excerpt || "Explore this media item."}</p>

                  <div className="mt-4 flex gap-2 flex-wrap">
                    {item.platform && (
                      <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs dark:bg-gray-800 dark:text-gray-200">
                        {item.platform}
                      </span>
                    )}
                    {item.duration && (
                      <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs dark:bg-gray-800 dark:text-gray-200">
                        {item.duration}
                      </span>
                    )}
                    {item.primaryBook && (
                      <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-200">
                        From {item.primaryBook}
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <MediaEmbed mediaUrl={item.media_url} />
                  </div>

                  <div className="mt-4 text-sm font-semibold underline">
                    <Link href={`/media/${item.slug}`}>{primaryCtaLabel(item.media_type)} →</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* TYPE SECTIONS */}
      {Object.keys(byType).map((type) => {
        const sectionItems = byType[type] || [];
        if (!sectionItems.length) return null;

        return (
          <section key={type} id={type} className="container mx-auto px-4 py-10">
            <SectionIntro
              kicker={type.toUpperCase()}
              title={`${type.charAt(0).toUpperCase() + type.slice(1)} from Manyagi`}
              lead={`Discover our latest ${type}s tied to the universe.`}
              tone="neutral"
              align="center"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 -mt-6">
              {sectionItems.map((item) => (
                <div key={item.id} className="rounded-3xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
                  <div className="relative h-48">
                    <img src={item.card_img} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  </div>
                  <div className="p-5">
                    <div className="text-xl font-bold">{item.title}</div>
                    <p className="text-sm opacity-80 mt-2 line-clamp-2">{item.excerpt}</p>
                    <div className="mt-4">
                      <Link href={`/media/${item.slug}`} className="text-sm font-semibold underline">
                        View {type} →
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section id="subscribe" className="container mx-auto px-4 pb-16">
        <SubscriptionForm
          formId="8427848"
          uid="637df68a01"
          title="Get Media Updates"
          description="New tracks, trailers, and music drops per IP."
        />
      </section>

      <Recommender />
    </>
  );
}
