import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";

export default function CheckoutCancel() {
  const router = useRouter();
  const next = useMemo(() => String(router.query?.next || "/"), [router.query]);

  return (
    <>
      <Head>
        <title>Cancelled — Manyagi</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <section className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto rounded-3xl border border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 shadow-sm p-8 text-center">
          <div className="text-[11px] tracking-[0.28em] uppercase opacity-70">Checkout Cancelled</div>
          <h1 className="text-3xl font-bold mt-2">Payment not completed</h1>
          <p className="opacity-80 mt-3">You can retry anytime.</p>

          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button
              onClick={() => router.replace(next || "/")}
              className="px-6 py-3 rounded-2xl bg-black text-white dark:bg-white dark:text-black font-semibold"
            >
              Go back
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
