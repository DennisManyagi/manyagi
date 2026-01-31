// pages/codex/[slug].js
import Head from 'next/head';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function CodexEntry({ entry, products, media, books, relatedLore }) {
  if (!entry) return <div className="p-20 text-center">Archive Entry Not Found.</div>;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 selection:bg-lime-400 selection:text-black">
      <Head>
        <title>{entry.title} | Resonance Codex</title>
      </Head>

      <div className="container mx-auto px-4 py-16 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Metadata Sidebar */}
        <div className="lg:col-span-3 space-y-6">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 backdrop-blur p-6">
            <div className="space-y-5">

              <div>
                <div className="text-[10px] tracking-[0.3em] uppercase opacity-60">
                  Status
                </div>
                <div className="text-sm font-semibold">
                  Eternal Canon
                </div>
              </div>

              <div>
                <div className="text-[10px] tracking-[0.3em] uppercase opacity-60">
                  Classification
                </div>
                <div className="text-sm font-semibold uppercase">
                  {entry.metadata.category}
                </div>
              </div>

              <div>
                <div className="text-[10px] tracking-[0.3em] uppercase opacity-60">
                  Archive Reference
                </div>
                <div className="font-mono text-sm">
                  {entry.metadata.lore_id}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Center: The Core Logic Content */}
        <div className="lg:col-span-6">
          <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 backdrop-blur p-8 md:p-12 space-y-8">
            <div className="text-xs uppercase tracking-[0.3em] text-gray-500">
              Resonance Codex · Eternal Archive
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight font-serif">
              {entry.title}
            </h1>

            <div className="h-px bg-gray-200 dark:bg-gray-800" />

            <div className="prose dark:prose-invert max-w-none text-lg leading-relaxed whitespace-pre-line opacity-90">
              {entry.content} {/* Now plain text after stripping on save */}
            </div>

          </div>
        </div>

        {/* Right: The Ecosystem Sync (Merch, Books, Media, Related Lore) */}
        <div className="lg:col-span-3 space-y-6">

          {/* Related Media - Enhanced embeds */}
          {media.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 backdrop-blur p-5">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-4 opacity-60">Sonic / Visual Frequency</h4>
              {media.map(track => {
                const meta = track.metadata || {};
                const url = meta.media_url || meta.audio_url || '';
                if (!url) return null;
                let embed = null;
                if (url.match(/\.(mp3|wav|m4a|ogg)$/i)) {
                  embed = <audio controls className="w-full h-8"><source src={url} /></audio>;
                } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
                  const id = url.split('v=')[1]?.split('&')[0] || url.split('youtu.be/')[1];
                  embed = <iframe width="100%" height="200" src={`https://www.youtube.com/embed/${id}`} allowFullScreen className="rounded-xl" />;
                } else if (url.includes('spotify.com')) {
                  const embedUrl = url.replace('open.spotify.com/', 'open.spotify.com/embed/').replace('/track/', '/embed/track/');
                  embed = <iframe src={embedUrl} width="100%" height="152" allow="encrypted-media" className="rounded-xl" />;
                }
                return (
                  <div key={track.id} className="mt-4">
                    <div className="text-xs font-bold mb-2">{track.title}</div>
                    {embed || <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-xs hover:underline">Open Media</a>}
                    <Link href={`/blog/${track.slug}`} className="block text-[10px] opacity-70 mt-1 hover:underline">Details →</Link>
                  </div>
                );
              })}
            </div>
          )}

          {/* Related Books */}
          {books.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 backdrop-blur p-5">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-4 opacity-60">Related Tomes</h4>
              {books.map(book => (
                <Link key={book.id} href={`/publishing/${book.slug}`} className="block group mt-4">
                  <img 
                    src={book.thumbnail_url || book.display_image || '/placeholder.png'} 
                    alt={book.name} 
                    className="w-full h-32 object-cover rounded-xl mb-2 group-hover:opacity-90 transition" 
                  />
                  <div className="text-xs font-bold">{book.name}</div>
                  <div className="text-[10px] opacity-70">Read →</div>
                </Link>
              ))}
            </div>
          )}

          {/* Related Merch */}
          {products.length > 0 && (
            <div className="space-y-6">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-60">Physical Artifacts</h4>
              {products.map(prod => (
                <Link key={prod.id} href={`/designs/${prod.slug}`} className="block group">
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 hover:shadow-md transition">
                    <img 
                      src={prod.thumbnail_url || '/placeholder.png'} 
                      alt={prod.name} 
                      className="w-full h-40 object-cover group-hover:scale-105 transition" 
                    />
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 text-white text-xs font-bold">
                      EQUIP {prod.name.toUpperCase()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Related Lore (universe fallback suggestions) */}
          {relatedLore.length > 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 backdrop-blur p-5">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] mb-4 opacity-60">Related Codex Entries</h4>
              {relatedLore.map(lore => (
                <Link key={lore.id} href={`/codex/${lore.slug}`} className="block mt-3 text-xs hover:underline">
                  {lore.title} <span className="opacity-60">({lore.metadata?.lore_id})</span>
                </Link>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps({ params }) {
  const { data: entry } = await supabase.from('posts').select('*').eq('slug', params.slug).single();
  if (!entry) return { props: { entry: null } };

  const prodSlugs = entry.metadata?.related_products || [];
  const mediaSlugs = entry.metadata?.related_media || [];
  const bookSlugs = entry.metadata?.related_books || []; // NEW
  const universeId = entry.metadata?.universe_id;

  const [
    { data: products },
    { data: media },
    { data: books }, // NEW
    { data: relatedLore }
  ] = await Promise.all([
    supabase.from('products').select('*').in('slug', prodSlugs),
    supabase.from('posts').select('*').in('slug', mediaSlugs),
    supabase.from('products').select('*').in('slug', bookSlugs), // NEW
    supabase.from('posts').select('*').eq('division', 'lore').eq('metadata->>universe_id', universeId).neq('id', entry.id).limit(5),
  ]);

  return { props: { 
    entry, 
    products: products || [], 
    media: media || [], 
    books: books || [], 
    relatedLore: relatedLore || [] 
  }};
}