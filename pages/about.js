import Head from 'next/head';
import Link from 'next/link';
import { useEffect } from 'react'; // ✅ ADDED
import SubscriptionForm from '../components/SubscriptionForm';
import Recommender from '../components/Recommender';
import Hero from '../components/Hero';
import SectionIntro from '../components/SectionIntro';
import Card from '../components/Card';
import { supabase } from '../lib/supabase'; // ✅ ADDED

export default function About() {
  const carouselImages = [
    'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/og-about.webp',
    'https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/team-photo.webp',
  ];

  // ✅ REWARD: first visit to About page
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (!userId) return;

        await fetch('/api/rewards/grant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            action: 'visit_about_first_time',
          }),
        });
      } catch (err) {
        console.error('[About] visit_about_first_time reward error', err);
      }
    })();
  }, []);

  return (
    <>
      <Head>
        <title>About Manyagi — A Modern Creative & Capital Group</title>
        <meta
          name="description"
          content="Manyagi LLC is a multi-division creative, media, capital, and technology group building stories, products, and platforms designed to scale globally."
        />
      </Head>

      {/* HERO */}
      <Hero
        kicker="About Manyagi"
        title="A Modern Creative & Capital Conglomerate."
        lead="Manyagi unites publishing, design, media, capital, tech, and realty into one connected ecosystem designed for long-term IP, cash flow, and global scale."
        carouselImages={carouselImages}
        height="h-[600px]"
      >
        <Link
          href="#divisions"
          className="btn bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition text-sm font-semibold"
        >
          Explore Our Divisions
        </Link>
      </Hero>

      {/* BRAND OVERVIEW */}
      <SectionIntro
        id="story"
        kicker="A Unified Vision"
        title="Who We Are"
        lead="Manyagi LLC is a creator-led, systems-driven company focused on turning ideas into durable intellectual property, products, and platforms."
        tone="neutral"
        align="center"
      >
        <p className="text-sm md:text-base mt-3 max-w-3xl mx-auto">
          We operate like a modern studio and holding company in one. Under the Manyagi umbrella, we build
          stories, brands, financial engines, and digital infrastructure that work together instead of
          competing for attention. From novels and apparel to media channels, software, and capital strategies,
          every division is designed to feed the rest of the ecosystem and compound over time.
        </p>
      </SectionIntro>

      {/* DIVISION OVERVIEW GRID */}
      <SectionIntro
        id="divisions"
        kicker="A Manyagi Company"
        title="Our Divisions"
        lead="Each division is a standalone brand with a shared backbone: world-class storytelling, clean design, smart systems, and disciplined capital."
        tone="card"
        align="center"
      />

      <section className="container mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

          <Card
            title="Publishing"
            description="Original IP across fiction, poetry, and worlds designed for adaptation into books, film, animation, games, and long-term franchises."
            image="https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/book-carousel-1.webp"
            category="publishing"
          >
            <p className="text-xs text-gray-500 font-mono">publishing@manyagi.net</p>
          </Card>

          <Card
            title="Designs"
            description="Apparel, posters, collectibles, and brand systems that let people wear the worlds, symbols, and stories that define the Manyagi Universe."
            image="https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/merch-carousel-1.webp"
            category="designs"
          >
            <p className="text-xs text-gray-500 font-mono">designs@manyagi.net</p>
          </Card>

          <Card
            title="Tech"
            description="Websites, apps, automation, and internal tools that power our brands, storefronts, communities, and future platforms."
            image="https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/app-carousel-1.webp"
            category="tech"
          >
            <p className="text-xs text-gray-500 font-mono">tech@manyagi.net</p>
          </Card>

          <Card
            title="Media"
            description="Faceless and branded channels, shorts, series, and documentaries that show the process, promote the IP, and build the audience in public."
            image="https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/merch-carousel-4.webp"
            category="media"
          >
            <p className="text-xs text-gray-500 font-mono">media@manyagi.net</p>
          </Card>

          <Card
            title="Capital"
            description="A disciplined capital desk focused on long-term investing, income streams, and frameworks for creators and builders to grow real wealth."
            image="https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/site/general/2025/11/6R5CJc-blackkungfu_stock_market_thumbnail_-v_7_fed2b20f-2a5b-451e-9c24-c790004e0a43_2.png"
            category="capital"
          >
            <p className="text-xs text-gray-500 font-mono">capital@manyagi.net</p>
          </Card>

          <Card
            title="Realty"
            description="Real estate concepts and future physical spaces that extend the Manyagi brand into the offline world through stays, sets, and experiences."
            image="https://dlbbjeohndiwtofitwec.supabase.co/storage/v1/object/public/assets/images/og-realty.webp"
            category="realty"
          >
            <p className="text-xs text-gray-500 font-mono">realty@manyagi.net</p>
          </Card>
        </div>
      </section>

      {/* BRAND VALUES */}
      <SectionIntro
        id="values"
        kicker="Our Operating System"
        title="What We Stand For"
        lead="These principles are baked into every story, product, partnership, and investment decision we make."
        tone="neutral"
        align="center"
      />

      <section className="container mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto text-sm md:text-base">
          <div className="rounded-3xl border bg-white/90 dark:bg-gray-950/90 p-5 shadow-sm text-center">
            <h3 className="font-semibold mb-2">Craft & Clarity</h3>
            <p>We obsess over the details but ship with intention, making things that feel sharp, timeless, and easy to understand.</p>
          </div>

          <div className="rounded-3xl border bg-white/90 dark:bg-gray-950/90 p-5 shadow-sm text-center">
            <h3 className="font-semibold mb-2">Systems & Scale</h3>
            <p>We design brands, products, and workflows to compound over years, not weeks — with automation and leverage built in.</p>
          </div>

          <div className="rounded-3xl border bg-white/90 dark:bg-gray-950/90 p-5 shadow-sm text-center">
            <h3 className="font-semibold mb-2">Ownership & Community</h3>
            <p>We believe creators should own their worlds, and audiences should feel like they’re part of something bigger than a single product.</p>
          </div>
        </div>
      </section>

      {/* CONTACT CTA */}
      <SectionIntro
        id="contact"
        kicker="Partnerships, Publishing & Beyond"
        title="Connect with the Manyagi Team"
        lead="Whether you’re a reader, investor, creator, or collaborator, we’d love to explore what we can build together."
        tone="card"
        align="center"
        maxWidth="max-w-2xl"
      >
        <p className="text-xs text-gray-500 font-mono">info@manyagi.net</p>
      </SectionIntro>

      {/* NEWSLETTER */}
      <section id="subscribe" className="container mx-auto px-4 pt-4 pb-16">
        <SubscriptionForm
          formId="8427853"
          uid="637df68a06"
          title="Stay Connected"
          description="Get launches, behind-the-scenes building, and cross-division updates from the Manyagi ecosystem."
        />
      </section>

      <Recommender />
    </>
  );
}
