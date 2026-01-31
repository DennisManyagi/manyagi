// components/Header.js
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useSelector } from 'react-redux';
import { FaShoppingCart } from 'react-icons/fa';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const Header = () => {
  const router = useRouter();
  const items = useSelector((state) => state.cart.items || []);
  const cartCount = items.length;
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const linkClass = (href) => {
    const active = router.pathname === href || router.pathname.startsWith(`${href}/`);
    return `hover:text-yellow-500 transition ${active ? 'text-yellow-600 font-semibold' : ''}`;
  };

  return (
    <header className="sticky top-0 bg-white z-50 border-b border-gray-300 text-black">
      <div className="container mx-auto flex items-center justify-between py-4 px-4 md:px-8 flex-col md:flex-row">
        {/* Logo */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center gap-3 font-bold uppercase tracking-widest">
            <Image
              src="/images/logo.svg"
              alt="Manyagi Logo"
              width={100}
              height={50}
              loading="lazy"
            />
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex flex-wrap gap-4 md:gap-6 items-center justify-center md:justify-end mt-4 md:mt-0">
          <Link href="/" className={linkClass('/')}>Home</Link>
          <Link href="/publishing" className={linkClass('/publishing')}>Publishing</Link>
          <Link href="/designs" className={linkClass('/designs')}>Designs</Link>
          <Link href="/media" className={linkClass('/media')}>Media</Link>
          <Link href="/codex" className={linkClass('/codex')}>Codex</Link>

          {/* NEW */}
          <Link href="/studios" className={linkClass('/studios')}>Studios</Link>

          <Link href="/capital" className={linkClass('/capital')}>Capital</Link>
          <Link href="/tech" className={linkClass('/tech')}>Tech</Link>
          <Link href="/realty" className={linkClass('/realty')}>Realty</Link>
          <Link href="/blog" className={linkClass('/blog')}>Blog</Link>
          <Link href="/about" className={linkClass('/about')}>About</Link>
          <Link href="/contact" className={linkClass('/contact')}>Contact</Link>
          <Link href="/links" className={linkClass('/links')}>Links</Link>

          <Link href="/admin" className="hover:text-yellow-500 transition bg-blue-100 px-2 py-1 rounded">
            Admin
          </Link>

          {/* Cart */}
          <Link href="/cart" className="relative hover:text-yellow-500 transition">
            <FaShoppingCart className="inline-block" />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                {cartCount}
              </span>
            )}
          </Link>

          {/* Theme Toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-black dark:text-white transition-colors"
            >
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;