// components/admin/LoreTab.js
import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import SectionCard from '@/components/admin/SectionCard';
import { toArrayTags, safeJSON } from '@/lib/adminUtils';

function stripMarkdown(text) {
  if (!text) return '';
  let cleaned = text
    // Headers
    .replace(/^#+\s+/gm, '')
    // Bold/italic
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Links
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // Images
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '')
    // Code
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // Lists
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    // Blockquotes
    .replace(/^\s*>\s+/gm, '')
    // HR
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    // Extra newlines
    .replace(/\n\s*\n/g, '\n\n');
  return cleaned.trim();
}

export default function LoreTab({ posts, refreshAll }) {
  const [loreForm, setLoreForm] = useState({
    id: null,
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    featured_image: '',
    status: 'published',
    lore_id: 'L00-',
    category: 'Logic', // Logic, Dossier, Chronicle, Compendium
    signal_color: '#32CD32', 
    universe_id: '',
    related_products: '', // Comma separated slugs
    related_media: '', // Comma separated slugs
    related_books: '', // NEW: comma separated book slugs
  });

  const [universes, setUniverses] = useState([]);
  const [products, setProducts] = useState([]);
  const [books, setBooks] = useState([]); // NEW: publishing books
  const [mediaItems, setMediaItems] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      const [
        { data: uniData },
        { data: prodData },
        { data: bookData }, // NEW
        { data: mediaData }
      ] = await Promise.all([
        supabase.from('universes').select('id, title, slug').order('title', { ascending: true }),
        supabase.from('products').select('id, name, slug, metadata').order('name', { ascending: true }),
        supabase.from('products').select('id, name, slug, metadata').eq('division', 'publishing').order('name', { ascending: true }), // NEW: books
        supabase.from('posts').select('id, title, slug, metadata').eq('division', 'media').order('title', { ascending: true }),
      ]);
      setUniverses(uniData || []);
      setProducts(prodData || []);
      setBooks(bookData || []);
      setMediaItems(mediaData || []);
    };
    fetchData();
  }, []);

  const filteredProducts = useMemo(() => {
    if (!loreForm.universe_id) return products;
    return products.filter(p => p.metadata?.universe_id === loreForm.universe_id);
  }, [products, loreForm.universe_id]);

  const filteredBooks = useMemo(() => {
    if (!loreForm.universe_id) return books;
    return books.filter(b => b.metadata?.universe_id === loreForm.universe_id);
  }, [books, loreForm.universe_id]);

  const filteredMedia = useMemo(() => {
    if (!loreForm.universe_id) return mediaItems;
    return mediaItems.filter(m => m.metadata?.universe_id === loreForm.universe_id);
  }, [mediaItems, loreForm.universe_id]);

  const addProductSlug = (slug) => {
    if (!slug) return;
    const current = loreForm.related_products.split(',').map(s => s.trim()).filter(Boolean);
    if (!current.includes(slug)) {
      setLoreForm({...loreForm, related_products: [...current, slug].join(', ')});
    }
  };

  const addBookSlug = (slug) => { // NEW
    if (!slug) return;
    const current = loreForm.related_books.split(',').map(s => s.trim()).filter(Boolean);
    if (!current.includes(slug)) {
      setLoreForm({...loreForm, related_books: [...current, slug].join(', ')});
    }
  };

  const addMediaSlug = (slug) => {
    if (!slug) return;
    const current = loreForm.related_media.split(',').map(s => s.trim()).filter(Boolean);
    if (!current.includes(slug)) {
      setLoreForm({...loreForm, related_media: [...current, slug].join(', ')});
    }
  };

  const loreEntries = useMemo(() => 
    posts.filter(p => p.division === 'lore').sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
  , [posts]);

  const saveLore = async (e) => {
    e.preventDefault();
    const cleanedContent = stripMarkdown(loreForm.content); // NEW: strip Markdown before saving
    const payload = {
      title: loreForm.title.trim(),
      slug: loreForm.slug || loreForm.title.toLowerCase().replace(/ /g, '-').replace(/[^a-z0-9-]/g, ''), // IMPROVED: clean invalid chars
      excerpt: loreForm.excerpt,
      content: cleanedContent,
      featured_image: loreForm.featured_image,
      status: loreForm.status,
      division: 'lore',
      metadata: {
        lore_id: loreForm.lore_id,
        category: loreForm.category,
        signal_color: loreForm.signal_color,
        universe_id: loreForm.universe_id,
        related_products: toArrayTags(loreForm.related_products),
        related_media: toArrayTags(loreForm.related_media),
        related_books: toArrayTags(loreForm.related_books) // NEW
      }
    };

    const { error } = loreForm.id 
      ? await supabase.from('posts').update(payload).eq('id', loreForm.id)
      : await supabase.from('posts').insert([payload]);

    if (error) alert(error.message);
    else {
      alert('Resonance Codex Updated');
      refreshAll();
      // Reset form after save
      setLoreForm({
        id: null,
        title: '',
        slug: '',
        excerpt: '',
        content: '',
        featured_image: '',
        status: 'published',
        lore_id: 'L00-',
        category: 'Logic',
        signal_color: '#32CD32',
        universe_id: '',
        related_products: '',
        related_media: '',
        related_books: '', // NEW
      });
    }
  };

  const deleteLore = async (id) => {
    if (!confirm('Delete this lore entry?')) return;
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) alert(error.message);
    else {
      alert('Entry deleted');
      refreshAll();
    }
  };

  const editLore = (entry) => {
    setLoreForm({
      ...entry,
      ...entry.metadata,
      related_products: entry.metadata?.related_products?.join(', ') || '',
      related_media: entry.metadata?.related_media?.join(', ') || '',
      related_books: entry.metadata?.related_books?.join(', ') || '', // NEW
    });
  };

  return (
    <SectionCard title="Manyagi Resonance Codex (Lore Vault)">
      <form onSubmit={saveLore} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-6 rounded-3xl dark:bg-gray-800 mb-8 border border-gray-200 dark:border-gray-700">
        <input placeholder="Title (e.g. Dimension Theory)" value={loreForm.title} onChange={e => setLoreForm({...loreForm, title: e.target.value})} className="p-3 rounded-xl border" />
        <input placeholder="Slug (auto-generated if blank)" value={loreForm.slug} onChange={e => setLoreForm({...loreForm, slug: e.target.value})} className="p-3 rounded-xl border" />
        <input placeholder="Lore ID (e.g. L00-1)" value={loreForm.lore_id} onChange={e => setLoreForm({...loreForm, lore_id: e.target.value})} className="p-3 rounded-xl border font-mono" />
        <select value={loreForm.category} onChange={e => setLoreForm({...loreForm, category: e.target.value})} className="p-3 rounded-xl border">
          <option value="Logic">Logic</option>
          <option value="Dossier">Dossier</option>
          <option value="Chronicle">Chronicle</option>
          <option value="Compendium">Compendium</option>
        </select>
        <input placeholder="Signal Color (Hex)" value={loreForm.signal_color} onChange={e => setLoreForm({...loreForm, signal_color: e.target.value})} className="p-3 rounded-xl border" />
        <select value={loreForm.universe_id} onChange={e => setLoreForm({...loreForm, universe_id: e.target.value})} className="p-3 rounded-xl border">
          <option value="">Select Universe</option>
          {universes.map(u => (
            <option key={u.id} value={u.id}>{u.title} ({u.slug})</option>
          ))}
        </select>
        <textarea placeholder="Excerpt (short summary)" value={loreForm.excerpt} onChange={e => setLoreForm({...loreForm, excerpt: e.target.value})} className="col-span-2 h-32 p-3 rounded-xl border text-sm" />
        <textarea placeholder="Content (Paste Eternal Lore Blocks)" value={loreForm.content} onChange={e => setLoreForm({...loreForm, content: e.target.value})} className="col-span-2 h-64 p-3 rounded-xl border font-mono text-sm" />
        <input placeholder="Featured Image URL" value={loreForm.featured_image} onChange={e => setLoreForm({...loreForm, featured_image: e.target.value})} className="p-3 rounded-xl border" />
        <div className="col-span-2 md:col-span-1">
          <input placeholder="Related Product Slugs (comma separated)" value={loreForm.related_products} onChange={e => setLoreForm({...loreForm, related_products: e.target.value})} className="w-full p-3 rounded-xl border" />
          <select onChange={e => addProductSlug(e.target.value)} className="w-full mt-2 p-3 rounded-xl border">
            <option value="">Add Product (filtered by universe)</option>
            {filteredProducts.map(p => (
              <option key={p.id} value={p.slug}>{p.name} ({p.slug})</option>
            ))}
          </select>
        </div>
        <div className="col-span-2 md:col-span-1">
          <input placeholder="Related Media Slugs (comma separated)" value={loreForm.related_media} onChange={e => setLoreForm({...loreForm, related_media: e.target.value})} className="w-full p-3 rounded-xl border" />
          <select onChange={e => addMediaSlug(e.target.value)} className="w-full mt-2 p-3 rounded-xl border">
            <option value="">Add Media (filtered by universe)</option>
            {filteredMedia.map(m => (
              <option key={m.id} value={m.slug}>{m.title} ({m.slug})</option>
            ))}
          </select>
        </div>
        <div className="col-span-2 md:col-span-1"> {/* NEW: related books section */}
          <input placeholder="Related Book Slugs (comma separated)" value={loreForm.related_books} onChange={e => setLoreForm({...loreForm, related_books: e.target.value})} className="w-full p-3 rounded-xl border" />
          <select onChange={e => addBookSlug(e.target.value)} className="w-full mt-2 p-3 rounded-xl border">
            <option value="">Add Book (filtered by universe)</option>
            {filteredBooks.map(b => (
              <option key={b.id} value={b.slug}>{b.name} ({b.slug})</option>
            ))}
          </select>
        </div>
        <button className="col-span-2 bg-black text-white p-4 rounded-2xl hover:opacity-80 transition font-bold">{loreForm.id ? 'UPDATE ENTRY' : 'COMMIT TO VAULT'}</button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left border-b opacity-50"><th>ID</th><th>Title</th><th>Category</th><th>Universe ID</th><th>Actions</th></tr></thead>
          <tbody>
            {loreEntries.map(entry => (
              <tr key={entry.id} className="border-b dark:border-gray-800">
                <td className="py-3 font-mono">{entry.metadata?.lore_id}</td>
                <td className="py-3 font-bold">{entry.title}</td>
                <td className="py-3">{entry.metadata?.category}</td>
                <td className="py-3 font-mono">{entry.metadata?.universe_id}</td>
                <td className="py-3">
                  <button onClick={() => editLore(entry)} className="text-blue-500 hover:underline mr-2">Edit</button>
                  <button onClick={() => deleteLore(entry.id)} className="text-red-500 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}