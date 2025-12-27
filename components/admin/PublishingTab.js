// components/admin/PublishingTab.js
import React, { useMemo, useState } from 'react';
import PublishingProductForm from '@/components/admin/PublishingProductForm';
import SectionCard from '@/components/admin/SectionCard';
import {
  toArrayTags,
  safeJSON,
  updateProduct,
  deleteProduct,
} from '@/lib/adminUtils';

const extractMetaFields = (m = {}) => ({
  // ✅ Added (requested)
  universe_id: m.universe_id || '',
  stripe_price_id: m.stripe_price_id || '',

  // existing
  amazon_url:    m.amazon_url || '',
  kindle_url:    m.kindle_url || '',
  paperback_url: m.paperback_url || '',
  store_url:     m.store_url || '',
  pdf_url:       m.pdf_url || '',
  format:        m.format || '',
  year:          m.year ?? '',
});

export default function PublishingTab({ products: allProducts, refreshAll }) {
  const [edits, setEdits] = useState({});
  const publishingProducts = useMemo(
    () => allProducts.filter((p) => p.division === 'publishing'),
    [allProducts]
  );

  const buildPayload = (row, p) => {
    const payload = {
      ...(row.display_image !== undefined
        ? { display_image: row.display_image, thumbnail_url: row.display_image }
        : {}),
      ...(row.price !== undefined ? { price: parseFloat(row.price || 0) } : {}),
      ...(row.description !== undefined ? { description: row.description } : {}),
      ...(row.tagsStr !== undefined ? { tags: toArrayTags(row.tagsStr) } : {}),
    };

    // Merge metadata from quick fields + raw JSON (if user edited it)
    const currentMeta = p.metadata || {};
    const quick = row.metaQuick || {};

    // ✅ Guardrail: prevent accidental bleed from offers into books
    // (Offers use tier/access_tier/required_tier; Publishing should not.)
    const quickSanitized = { ...quick };
    if (quickSanitized?.tier !== undefined) delete quickSanitized.tier;
    if (quickSanitized?.access_tier !== undefined) delete quickSanitized.access_tier;
    if (quickSanitized?.required_tier !== undefined) delete quickSanitized.required_tier;

    // ✅ Validate Stripe price id format (optional but smart)
    if (
      quickSanitized?.stripe_price_id &&
      !String(quickSanitized.stripe_price_id).startsWith('price_')
    ) {
      throw new Error('stripe_price_id should start with "price_"');
    }

    const mergedQuick = {
      ...currentMeta,
      ...quickSanitized,
      // normalize simple fields
      ...(quickSanitized.year !== undefined && quickSanitized.year !== ''
        ? { year: Number(quickSanitized.year) }
        : {}),
      ...(quickSanitized.format !== undefined ? { format: quickSanitized.format } : {}),
    };

    // If user typed JSON manually, it wins. Otherwise use mergedQuick.
    if (row.metadataStr !== undefined) {
      payload.metadata = safeJSON(row.metadataStr, mergedQuick);
    } else if (Object.keys(quickSanitized).length) {
      payload.metadata = mergedQuick;
    }

    return payload;
  };

  const save = async (p) => {
    try {
      const row = edits[p.id] || {};
      if (!Object.keys(row).length) return;
      const payload = buildPayload(row, p);
      await updateProduct(p.id, payload);
      setEdits((prev) => ({ ...prev, [p.id]: {} }));
      refreshAll?.();
      alert('Saved.');
    } catch (e) {
      alert(`Save failed: ${e.message}`);
    }
  };

  return (
    <SectionCard title="Publishing Division">
      <PublishingProductForm onCreated={refreshAll} />

      <div className="mt-6">
        <h3 className="font-semibold mb-3">Books</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-2">Cover</th>
                <th>Title</th>
                <th>Display Image</th>
                <th>Price</th>
                <th>Tags</th>
                <th>Description</th>
                <th>Quick Metadata</th>
                <th>Raw Metadata JSON</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {publishingProducts.map((p) => {
                const row = edits[p.id] || {};
                const prettyMeta = JSON.stringify(p.metadata || {}, null, 2);
                const quickDefaults = extractMetaFields(p.metadata || {});
                const quick = { ...quickDefaults, ...(row.metaQuick || {}) };

                return (
                  <tr key={p.id} className="border-b dark:border-gray-800 align-top">
                    <td className="py-2">
                      {p.thumbnail_url || p.display_image ? (
                        <img
                          src={p.thumbnail_url || p.display_image}
                          className="w-14 h-14 object-cover rounded"
                          alt=""
                        />
                      ) : '—'}
                    </td>

                    <td className="py-2 min-w-[160px]">{p.name}</td>

                    <td className="py-2 min-w-[220px]">
                      <input
                        className="w-full dark:bg-gray-800"
                        placeholder="display_image / thumbnail_url"
                        value={row.display_image ?? p.display_image ?? p.thumbnail_url ?? ''}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [p.id]: { ...row, display_image: e.target.value },
                          }))
                        }
                      />
                    </td>

                    <td className="py-2 min-w-[100px]">
                      <input
                        type="number"
                        className="w-full dark:bg-gray-800"
                        placeholder={String(p.price ?? '')}
                        value={row.price ?? (p.price ?? '')}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [p.id]: { ...row, price: e.target.value },
                          }))
                        }
                      />
                    </td>

                    <td className="py-2 min-w-[200px]">
                      <input
                        className="w-full dark:bg-gray-800"
                        placeholder="comma,separated,tags"
                        value={row.tagsStr ?? (Array.isArray(p.tags) ? p.tags.join(', ') : '')}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [p.id]: { ...row, tagsStr: e.target.value },
                          }))
                        }
                      />
                    </td>

                    <td className="py-2 min-w-[260px]">
                      <textarea
                        className="w-full h-24 dark:bg-gray-800"
                        value={row.description ?? p.description ?? ''}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [p.id]: { ...row, description: e.target.value },
                          }))
                        }
                      />
                    </td>

                    {/* Quick Metadata fields */}
                    <td className="py-2 min-w-[320px]">
                      <div className="grid grid-cols-1 gap-2">
                        {/* ✅ Added */}
                        <input
                          className="w-full dark:bg-gray-800"
                          placeholder="universe_id (optional, UUID)"
                          value={quick.universe_id}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...row,
                                metaQuick: { ...quick, universe_id: e.target.value },
                              },
                            }))
                          }
                        />

                        {/* ✅ Added */}
                        <input
                          className="w-full dark:bg-gray-800"
                          placeholder="stripe_price_id (optional) e.g. price_123..."
                          value={quick.stripe_price_id}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...row,
                                metaQuick: { ...quick, stripe_price_id: e.target.value },
                              },
                            }))
                          }
                        />

                        <input
                          className="w-full dark:bg-gray-800"
                          placeholder="amazon_url"
                          value={quick.amazon_url}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...row,
                                metaQuick: { ...quick, amazon_url: e.target.value },
                              },
                            }))
                          }
                        />
                        <input
                          className="w-full dark:bg-gray-800"
                          placeholder="kindle_url"
                          value={quick.kindle_url}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...row,
                                metaQuick: { ...quick, kindle_url: e.target.value },
                              },
                            }))
                          }
                        />
                        <input
                          className="w-full dark:bg-gray-800"
                          placeholder="paperback_url"
                          value={quick.paperback_url}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...row,
                                metaQuick: { ...quick, paperback_url: e.target.value },
                              },
                            }))
                          }
                        />
                        <input
                          className="w-full dark:bg-gray-800"
                          placeholder="pdf_url (chapter preview)"
                          value={quick.pdf_url}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...row,
                                metaQuick: { ...quick, pdf_url: e.target.value },
                              },
                            }))
                          }
                        />
                        <input
                          className="w-full dark:bg-gray-800"
                          placeholder="store_url (optional)"
                          value={quick.store_url}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              [p.id]: {
                                ...row,
                                metaQuick: { ...quick, store_url: e.target.value },
                              },
                            }))
                          }
                        />
                        <div className="flex gap-2">
                          <input
                            className="w-1/2 dark:bg-gray-800"
                            placeholder="format (ebook/paperback/…)"
                            value={quick.format}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...row,
                                  metaQuick: { ...quick, format: e.target.value },
                                },
                              }))
                            }
                          />
                          <input
                            className="w-1/2 dark:bg-gray-800"
                            placeholder="year"
                            value={quick.year}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [p.id]: {
                                  ...row,
                                  metaQuick: { ...quick, year: e.target.value },
                                },
                              }))
                            }
                          />
                        </div>
                        <div className="text-[11px] opacity-60">
                          Tip: Paste your PDF URL here (from Assets → Copy URL) to show a “Preview Chapter 1” button on the Publishing page.
                        </div>
                      </div>
                    </td>

                    {/* Raw JSON (optional) */}
                    <td className="py-2 min-w-[360px]">
                      <textarea
                        className="w-full h-36 dark:bg-gray-800"
                        placeholder='{"amazon_url":"…","paperback_url":"…","pdf_url":"…"}'
                        value={row.metadataStr ?? prettyMeta}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [p.id]: { ...row, metadataStr: e.target.value },
                          }))
                        }
                      />
                    </td>

                    <td className="py-2 space-x-2">
                      <button
                        className="px-3 py-1 bg-blue-600 text-white rounded"
                        onClick={() => save(p)}
                      >
                        Save
                      </button>

                      <button
                        className="px-3 py-1 bg-red-600 text-white rounded"
                        onClick={() => deleteProduct(p.id, refreshAll)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}

              {publishingProducts.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 opacity-70">
                    No books yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}
