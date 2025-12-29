import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function StudioCheckoutSuccess() {
  const router = useRouter();
  const session_id = useMemo(() => String(router.query?.session_id || ""), [router.query]);
  const next = useMemo(() => String(router.query?.next || "/studios"), [router.query]);

  const [countdown, setCountdown] = useState(4);
  const [status, setStatus] = useState("Finalizing your access…");

  useEffect(() => {
    if (!router.isReady) return;

    // Optional: try a quick session refresh (helps when coming back from Stripe)
    supabase.auth.getSession().catch(() => {});

    // Give webhook time to write entitlement, then send user back.
    const t1 = setTimeout(() => setStatus("Almost done… redirecting you back to Studios."), 1200);

    const interval = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);

    const t2 = setTimeout(() => {
      router.replace(next || "/studios");
    }, 4200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(interval);
    };
  }, [router.isReady, next, router]);

  return (
    <>
      <Head>
        <title>Studio Access Unlocked — Manyagi</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <section className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm p-8 text-center">
          <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Payment Success</div>
          <h1 className="text-3xl font-bold mt-2">Studio access unlocked</h1>

          <p className="opacity-80 mt-3">{status}</p>

          {session_id ? (
            <div className="text-xs opacity-60 mt-3 break-all">
              session_id: {session_id}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => router.replace(next || "/studios")}
              className="px-6 py-3 rounded-2xl bg-black text-white dark:bg-white dark:text-black font-semibold"
            >
              Continue ({countdown || 0})
            </button>

            <Link
              href="/studios"
              className="px-6 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40"
            >
              Studios Library
            </Link>
          </div>

          <div className="text-xs opacity-60 mt-6">
            If you still see locked content after redirect, refresh once — the entitlement is applied by Stripe webhook.
          </div>
        </div>
      </section>
    </>
  );
}
