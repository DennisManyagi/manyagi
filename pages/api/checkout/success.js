import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

export default function CheckoutSuccess() {
  const router = useRouter();
  const next = useMemo(() => String(router.query?.next || "/"), [router.query]);
  const session_id = useMemo(() => String(router.query?.session_id || ""), [router.query]);
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    if (!router.isReady) return;
    const interval = setInterval(() => setCountdown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    const t = setTimeout(() => router.replace(next || "/"), 4200);
    return () => {
      clearInterval(interval);
      clearTimeout(t);
    };
  }, [router.isReady, next, router]);

  return (
    <>
      <Head>
        <title>Success — Manyagi</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <section className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm p-8 text-center">
          <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Payment Success</div>
          <h1 className="text-3xl font-bold mt-2">Purchase complete</h1>
          <p className="opacity-80 mt-3">Redirecting…</p>

          {session_id ? <div className="text-xs opacity-60 mt-3 break-all">session_id: {session_id}</div> : null}

          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => router.replace(next || "/")}
              className="px-6 py-3 rounded-2xl bg-black text-white dark:bg-white dark:text-black font-semibold"
            >
              Continue ({countdown || 0})
            </button>
            <Link
              href="/"
              className="px-6 py-3 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-gray-950/40"
            >
              Home
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
