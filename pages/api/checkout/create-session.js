// pages/api/checkout/create-session.js
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

// -------------------------------
// small helpers
// -------------------------------
function asStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function safeJSON(v) {
  if (!v) return {};
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeStudioTier(t) {
  const v = asStr(t).trim().toLowerCase();
  if (v === "priority" || v === "producer" || v === "packaging") return v;
  return "";
}

async function getAuthedUserIdFromBearer(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { userId: null, token: null };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return { userId: null, token: null };

  return { userId: data.user.id, token };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      // Shared
      success_url,
      cancel_url,

      // SUBSCRIPTION path
      mode, // 'subscription' => create subscription checkout
      price_id, // optional override; falls back to env
      email, // optional prefill for subscription
      telegramId, // from Signals form

      // ONE-TIME path
      product_id, // required for one-time purchase (Supabase products.id)
      quantity = 1,
      user_id = null,

      // track who referred this customer
      affiliate_code = null,
    } = req.body || {};

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    // -------------------------
    // 1) SUBSCRIPTION CHECKOUT
    // -------------------------
    if (mode === "subscription") {
      const activePrice = price_id || process.env.NEXT_PUBLIC_STRIPE_PRICE_ID;
      if (!activePrice) {
        return res.status(400).json({
          error: "Missing price_id. Set NEXT_PUBLIC_STRIPE_PRICE_ID or pass price_id in body.",
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: activePrice, quantity: 1 }],
        allow_promotion_codes: true,
        customer_email: email || undefined,
        success_url: success_url || `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancel_url || `${baseUrl}/checkout/cancelled`,
        customer_creation: "always", // ensures we have a Customer to store metadata on

        // put telegramId everywhere we might read it later
        metadata: {
          telegramId: telegramId ? String(telegramId) : "",
          plan: "Basic Signals",
          division: "capital",
          affiliate_code: affiliate_code || "",
        },
        subscription_data: {
          metadata: {
            telegramId: telegramId ? String(telegramId) : "",
            plan: "Basic Signals",
            division: "capital",
            affiliate_code: affiliate_code || "",
          },
        },
      });

      return res.status(200).json({
        ok: true,
        id: session.id,
        url: session.url,
      });
    }

    // --------------------------------
    // 2) ONE-TIME (PRODUCT) CHECKOUT
    // --------------------------------
    if (!product_id) {
      return res.status(400).json({
        error: 'product_id is required for one-time checkout (or set mode: "subscription")',
      });
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    // Load product from Supabase
    const { data: product, error: pErr } = await supabaseAdmin
      .from("products")
      .select("*")
      .eq("id", product_id)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!product) return res.status(404).json({ error: "Product not found" });

    const meta = safeJSON(product.metadata);
    const stripePriceId = meta.stripe_price_id;

    if (!stripePriceId) {
      return res.status(400).json({ error: "Missing metadata.stripe_price_id on this product" });
    }

    // Decide if we must collect shipping (for merch/physical items)
    const needsShipping =
      !!meta.printful_sync_variant_id || meta.fulfill_with_printful === true;

    // ✅ FIX: Studio Access detection must include offer_type OR kind
    // This prevents subtle mismatches where products use metadata.offer_type = "studio_access"
    const offerType = asStr(meta.offer_type || meta.kind).trim().toLowerCase();
    const isStudioAccess = offerType === "studio_access";

    // Determine user_id:
    // - for normal products: keep your existing behavior (use body user_id if provided)
    // - for studio_access: require Supabase login (Bearer token)
    let resolvedUserId = user_id;

    if (isStudioAccess) {
      const { userId } = await getAuthedUserIdFromBearer(req);
      if (!userId) {
        return res.status(401).json({
          error: "Studio access requires login. Missing or invalid Authorization Bearer token.",
        });
      }
      resolvedUserId = userId;
    }

    // Studio metadata validation (only for studio_access)
    let studioUniverseId = null;
    let studioTier = "";
    let studioUniverseSlug = "";
    if (isStudioAccess) {
      studioUniverseId = asStr(meta.universe_id).trim();
      studioTier = normalizeStudioTier(meta.tier);
      studioUniverseSlug = asStr(meta.universe_slug).trim();

      if (!studioUniverseId) {
        return res.status(400).json({
          error: "Studio access product is missing metadata.universe_id",
        });
      }
      if (!studioTier) {
        return res.status(400).json({
          error: "Studio access product has invalid metadata.tier (must be priority|producer|packaging)",
        });
      }
    }

    // ✅ safer studio cancel URL (won't create weird empty /studios/)
    const studioCancelUrl = studioUniverseSlug
      ? `${baseUrl}/studios/${studioUniverseSlug}`
      : `${baseUrl}/studios`;

    // build Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: stripePriceId, quantity: isStudioAccess ? 1 : qty }],
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },

      // ✅ Shipping ONLY for physical merch
      shipping_address_collection: needsShipping
        ? {
            allowed_countries: ["US", "CA", "GB", "AU", "NZ", "DE", "FR", "ES", "IT", "NL", "SE"],
          }
        : undefined,
      phone_number_collection: needsShipping ? { enabled: true } : undefined,

      // ✅ Studio: use studio-success by default (you can override by passing success_url)
      success_url:
        success_url ||
        (isStudioAccess
          ? `${baseUrl}/checkout/studio-success?session_id={CHECKOUT_SESSION_ID}`
          : `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`),

      cancel_url:
        cancel_url ||
        (isStudioAccess ? studioCancelUrl : `${baseUrl}/checkout/cancelled`),

      metadata: {
        // existing fields
        product_id: String(product.id),
        division: String(product.division || "site"),
        quantity: String(isStudioAccess ? 1 : qty),
        product_name: String(product.name || ""),
        affiliate_code: affiliate_code || "",

        // ✅ FIX: webhook routing should be deterministic
        // - studio access must be "studio_access"
        // - non-studio should be "product_order" (not blank)
        type: isStudioAccess ? "studio_access" : "product_order",

        // ✅ studio entitlement fields (only populated when studio_access)
        universe_id: isStudioAccess ? String(studioUniverseId) : "",
        tier: isStudioAccess ? String(studioTier) : "",
        user_id: isStudioAccess ? String(resolvedUserId || "") : "",

        // ✅ include universe_slug for better webhook emails / links
        universe_slug: isStudioAccess ? String(studioUniverseSlug || "") : "",
      },
    });

    // Record a pending order for your webhook to finalize
    const estimatedTotal = Number(product.price || 0) * (isStudioAccess ? 1 : qty);

    await supabaseAdmin.from("orders").insert({
      user_id: resolvedUserId,
      product_id: product.id,
      division: product.division || "site",
      status: "pending",
      quantity: isStudioAccess ? 1 : qty,
      total_amount: estimatedTotal,
      stripe_session_id: session.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      affiliate_code: affiliate_code || null,
      product_snapshot: {
        name: product.name,
        price: product.price,
        thumbnail_url: product.thumbnail_url || null,
        metadata: meta || {},

        // ✅ extra trace info for studio purchases
        kind: isStudioAccess ? "studio_access" : offerType || null,
        universe_id: isStudioAccess ? studioUniverseId : null,
        tier: isStudioAccess ? studioTier : null,
      },
    });

    return res.status(200).json({
      ok: true,
      id: session.id,
      url: session.url,
    });
  } catch (err) {
    console.error("create-session error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}
