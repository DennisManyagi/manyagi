import Link from "next/link";
import { useRouter } from "next/router";
import {
  FaInstagram,
  FaTiktok,
  FaYoutube,
  FaTwitter,
  FaLinkedin,
  FaPinterest,
  FaFacebook,
  FaEnvelope,
} from "react-icons/fa";

// ===== Social handles (parent + divisions) =====
const SOCIAL_HANDLES = {
  parent: {
    label: "Manyagi",
    instagram: "manyagiofficial",
    twitter: "manyagiofficial",
    youtube: "@manyagiofficial",
    pinterest: "manyagiofficial",
    linkedin: "manyagiofficial",
    facebook: "manyagiofficial",
    tiktok: "manyagiofficial",
  },
  publishing: {
    label: "Manyagi Publishing",
    instagram: "manyagipublishing",
    twitter: "manyagipublish",
    pinterest: "manyagipublishing",
    linkedin: "manyagipublishing",
    facebook: "manyagipublishing",
    tiktok: "manyagipublishing",
  },
  designs: {
    label: "Manyagi Designs",
    instagram: "manyagidesigns",
    twitter: "manyagidesigns",
    pinterest: "manyagidesigns",
    linkedin: "manyagidesigns",
    facebook: "manyagidesigns",
    tiktok: "manyagidesigns",
  },
  media: {
    label: "Manyagi Media",
    instagram: "manyagimedia",
    twitter: "manyagimedia",
    youtube: "@manyagimedia",
    pinterest: "manyagimedia",
    linkedin: "manyagimedia",
    facebook: "manyagimedia",
    tiktok: "manyagimedia",
  },

  // NEW
  studios: {
    label: "Manyagi Studios",
    instagram: "manyagistudios",
    twitter: "manyagistudios",
    youtube: "@manyagistudios",
    pinterest: "manyagistudios",
    linkedin: "manyagistudios",
    facebook: "manyagistudios",
    tiktok: "manyagistudios",
  },

  capital: {
    label: "Manyagi Capital",
    instagram: "manyagicapital",
    twitter: "manyagicapital",
    linkedin: "manyagicapital",
    facebook: "manyagicapital",
    tiktok: "manyagicapital",
  },
  tech: {
    label: "Manyagi Tech",
    instagram: "manyagitech",
    twitter: "manyagitech",
    youtube: "@manyagitech",
    linkedin: "manyagitech",
    tiktok: "manyagitech",
  },
  realty: {
    label: "Manyagi Realty",
    instagram: "manyagirealty",
    twitter: "manyagirealty",
    linkedin: "manyagirealty",
    facebook: "manyagirealty",
    tiktok: "manyagirealty1",
  },
};

// ===== Public email per division =====
const DIVISION_EMAIL = {
  parent: "info@manyagi.net",
  publishing: "publishing@manyagi.net",
  designs: "designs@manyagi.net",
  media: "media@manyagi.net",

  // NEW
  studios: "studios@manyagi.net",

  capital: "capital@manyagi.net",
  tech: "tech@manyagi.net",
  realty: "realty@manyagi.net",
};

const DIVISION_BLURB = {
  parent:
    "Manyagi is a modern creative & capital group building IP, media, brands, and systems across publishing, designs, media, tech, capital, and realty.",
  publishing:
    "Manyagi Publishing develops original fiction, poetry, and story universes engineered for long-term readership and cross-media adaptation.",
  designs:
    "Manyagi Designs turns worlds and symbols into apparel, posters, collectibles, and visual identities that feel premium and timeless.",
  media:
    "Manyagi Media documents the build, grows the audience, and distributes our IP through series, shorts, documentaries, and digital storytelling.",
  studios:
    "Manyagi Studios is the IP vault: trailers, decks, world lore, and Hollywood-facing presentation per universe.",
  capital:
    "Manyagi Capital focuses on disciplined frameworks for wealth, income, and allocation — treating creators like asset classes, not side projects.",
  tech:
    "Manyagi Tech ships the infrastructure: sites, apps, tools, and automations powering the Manyagi ecosystem and future platforms.",
  realty:
    "Manyagi Realty explores real estate and physical spaces that extend the brand into the real world through stays, sets, and experiences.",
};

function platformUrl(platform, handle) {
  if (!handle) return null;
  switch (platform) {
    case "instagram": return `https://instagram.com/${handle}`;
    case "twitter":   return `https://x.com/${handle.replace(/^@/, "")}`;
    case "youtube":   return `https://youtube.com/${handle.startsWith("@") ? handle : `@${handle}`}`;
    case "pinterest": return `https://pinterest.com/${handle}`;
    case "linkedin":  return `https://linkedin.com/company/${handle}`;
    case "facebook":  return `https://facebook.com/${handle}`;
    case "tiktok":    return `https://tiktok.com/@${handle.replace(/^@/, "")}`;
    default:          return null;
  }
}

function Icon({ name }) {
  switch (name) {
    case "instagram": return <FaInstagram />;
    case "tiktok":    return <FaTiktok />;
    case "youtube":   return <FaYoutube />;
    case "twitter":   return <FaTwitter />;
    case "linkedin":  return <FaLinkedin />;
    case "pinterest": return <FaPinterest />;
    case "facebook":  return <FaFacebook />;
    default:          return null;
  }
}

export default function Footer({ division: override }) {
  const router = useRouter();

  const division = override || (() => {
    const p = router.pathname || "";
    if (p.startsWith("/publishing")) return "publishing";
    if (p.startsWith("/designs"))    return "designs";
    if (p.startsWith("/media"))      return "media";
    if (p.startsWith("/studios"))    return "studios"; // NEW
    if (p.startsWith("/capital"))    return "capital";
    if (p.startsWith("/tech"))       return "tech";
    if (p.startsWith("/realty"))     return "realty";
    return "parent";
  })();

  const cfg   = SOCIAL_HANDLES[division] || SOCIAL_HANDLES.parent;
  const email = DIVISION_EMAIL[division] || DIVISION_EMAIL.parent;
  const blurb = DIVISION_BLURB[division] || DIVISION_BLURB.parent;

  const ORDER = ["instagram", "tiktok", "youtube", "twitter", "linkedin", "pinterest", "facebook"];
  let links = ORDER.map((p) => {
    const url = platformUrl(p, cfg[p]);
    return url ? { p, url } : null;
  }).filter(Boolean);

  // Always add Manyagi Media YouTube on division pages (not homepage)
  if (division !== "parent" && !links.some(l => l.url.includes("@manyagimedia"))) {
    links.push({ p: "youtube", url: "https://youtube.com/@manyagimedia" });
  }

  return (
    <footer className="bg-white text-black border-t border-gray-200">
      <div className="container mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h4 className="text-xl font-bold mb-2">
            {division === "parent" ? "Manyagi" : cfg.label}
          </h4>
          <p className="text-sm text-gray-700">{blurb}</p>
        </div>

        <div className="text-sm">
          <h5 className="font-semibold mb-2">Explore</h5>
          <ul className="space-y-1">
            <li><Link href="/publishing" className="hover:text-yellow-600">Publishing</Link></li>
            <li><Link href="/designs"    className="hover:text-yellow-600">Designs</Link></li>
            <li><Link href="/media"      className="hover:text-yellow-600">Media</Link></li>
            <li><Link href="/studios"    className="hover:text-yellow-600">Studios</Link></li> {/* NEW */}
            <li><Link href="/capital"    className="hover:text-yellow-600">Capital</Link></li>
            <li><Link href="/tech"       className="hover:text-yellow-600">Tech</Link></li>
            <li><Link href="/realty"     className="hover:text-yellow-600">Realty</Link></li>
            <li><Link href="/blog"       className="hover:text-yellow-600">Blog</Link></li>
          </ul>
        </div>

        <div className="text-sm">
          <h5 className="font-semibold mb-2 flex items-center gap-2">
            <FaEnvelope /> Contact
          </h5>
          <a
            href={`mailto:${email}`}
            className="underline hover:text-yellow-600 break-all"
          >
            {email}
          </a>
          <div className="mt-4 flex flex-wrap gap-3 text-xl">
            {links.map(({ p, url }) => (
              <a
                key={`${p}-${url}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-yellow-600 transition-colors"
                title={p}
              >
                <Icon name={p} />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200">
        <div className="container mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-gray-700">
          <div>© {new Date().getFullYear()} {cfg.label}. All rights reserved.</div>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-yellow-600">Privacy</Link>
            <Link href="/terms"   className="hover:text-yellow-600">Terms</Link>
            <Link href="/about"   className="hover:text-yellow-600">About</Link>
          </div>
          <div className="text-gray-600">Creativity Meets Innovation</div>
        </div>
      </div>
    </footer>
  );
}
