// pages/admin.js
import React, { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';

import OverviewTab from '@/components/admin/OverviewTab';
import PublishingTab from '@/components/admin/PublishingTab';
import DesignsTab from '@/components/admin/DesignsTab';
import CapitalTab from '@/components/admin/CapitalTab';
import TechTab from '@/components/admin/TechTab';
import MediaTab from '@/components/admin/MediaTab';
import RealtyTab from '@/components/admin/RealtyTab';
import AssetsTab from '@/components/admin/AssetsTab';
import BlogTab from '@/components/admin/BlogTab';
import AffiliatesTab from '@/components/admin/AffiliatesTab';
import BundlesTab from '@/components/admin/BundlesTab';
import UsersTab from '@/components/admin/UsersTab';
import AnalyticsTab from '@/components/admin/AnalyticsTab';
import EventsTab from '@/components/admin/EventsTab';

// NEW
import UniversesTab from '@/components/admin/UniversesTab';

// arrivals / upcoming stays dashboard
import UpcomingStaysPanel from '@/components/admin/UpcomingStaysPanel';

// little pill button for the tab nav
const TabButton = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 rounded text-sm font-medium transition ${
      active
        ? 'bg-blue-500 text-white'
        : 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
    }`}
  >
    {children}
  </button>
);

export default function Admin() {
  const router = useRouter();

  // auth state
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // dashboard data
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [assets, setAssets] = useState([]);
  const [siteConfig, setSiteConfig] = useState({});
  const [users, setUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [events, setEvents] = useState([]);
  const [posts, setPosts] = useState([]);

  // reservations from realty_reservations for revenue/ops/affiliates
  const [reservations, setReservations] = useState([]);

  // leads from realty_leads (buy/sell/manage inquiries)
  const [realtyLeads, setRealtyLeads] = useState([]);

  // ui state
  const [loading, setLoading] = useState(true);

  // default active tab
  const [activeTab, setActiveTab] = useState('overview');

  // fetch everything for dashboard
  const refreshAll = useCallback(async () => {
    const [
      p,
      o,
      s,
      a,
      c,
      b,
      u,
      prop,
      aff,
      bund,
      ev,
      rr,   // realty_reservations
      leads // realty_leads
    ] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('assets')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase.from('site_config').select('*'),

      supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('properties')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('affiliates')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('bundles')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false }),

      // grab reservations so we can display arrivals/revenue and feed affiliates
      supabase
        .from('realty_reservations')
        .select('*')
        .order('created_at', { ascending: false }),

      // grab brokerage / mgmt / seller / buyer leads
      supabase
        .from('realty_leads')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);

    setProducts(p.data || []);
    setOrders(o.data || []);
    setSubscriptions(s.data || []);
    setAssets(a.data || []);
    setSiteConfig(
      (c.data || []).reduce(
        (acc, item) => ({ ...acc, [item.key]: item.value }),
        {}
      )
    );
    setPosts(b.data || []);
    setUsers(u.data || []);
    setProperties(prop.data || []);
    setAffiliates(aff.data || []);
    setBundles(bund.data || []);
    setEvents(ev.data || []);

    setReservations(rr.data || []);
    setRealtyLeads(leads.data || []);
  }, []);

  // bootstrap auth + data
  useEffect(() => {
    (async () => {
      // check session
      const {
        data: { user: supaUser },
      } = await supabase.auth.getUser();

      if (!supaUser) {
        router.push('/login');
        return;
      }

      setUser(supaUser);

      // verify admin role
      const { data: userRow, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', supaUser.id)
        .maybeSingle();

      if (error) {
        console.error('role check error:', error);
      }

      if (userRow?.role !== 'admin') {
        router.push('/dashboard');
        return;
      }

      setIsAdmin(true);

      // load dashboard data
      await refreshAll();
      setLoading(false);
    })();
  }, [router, refreshAll]);

  if (loading) {
    return <p className="p-6">Loading admin dashboard…</p>;
  }

  if (!isAdmin) {
    return <p className="p-6">Not authorized.</p>;
  }

  // tab labels
  const tabs = [
    'overview',
    'universes', // NEW
    'publishing',
    'designs',
    'capital',
    'tech',
    'media',
    'realty',
    'upcoming', // stays dashboard for realty arrivals
    'assets',
    'blog',
    'affiliates',
    'bundles',
    'users',
    'analytics',
    'events',
  ];

  return (
    <>
      <Head>
        <title>Manyagi Admin Dashboard</title>
      </Head>

      <div className="container mx-auto px-4 py-8 space-y-12 gradient-bg dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        {/* tab nav */}
        <nav className="flex gap-2 mb-6 flex-wrap">
          {tabs.map((tab) => (
            <TabButton
              key={tab}
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </TabButton>
          ))}
        </nav>

        {/* tab bodies */}
        {activeTab === 'overview' && (
          <OverviewTab
            orders={orders}
            subscriptions={subscriptions}
            users={users}
          />
        )}

        {activeTab === 'universes' && (
          <UniversesTab />
        )}

        {activeTab === 'publishing' && (
          <PublishingTab products={products} refreshAll={refreshAll} />
        )}

        {activeTab === 'designs' && (
          <DesignsTab
            products={products}
            assets={assets}
            refreshAll={refreshAll}
          />
        )}

        {activeTab === 'capital' && (
          <CapitalTab products={products} refreshAll={refreshAll} />
        )}

        {activeTab === 'tech' && (
          <TechTab posts={posts} refreshAll={refreshAll} />
        )}

        {activeTab === 'media' && (
          <MediaTab posts={posts} refreshAll={refreshAll} />
        )}

        {activeTab === 'realty' && (
          <RealtyTab
            properties={properties}
            assets={assets}
            leads={realtyLeads}
            refreshAll={refreshAll}
          />
        )}

        {activeTab === 'upcoming' && (
          <section className="space-y-6">
            <UpcomingStaysPanel />
          </section>
        )}

        {activeTab === 'assets' && (
          <AssetsTab assets={assets} refreshAll={refreshAll} />
        )}

        {activeTab === 'blog' && (
          <BlogTab posts={posts} refreshAll={refreshAll} user={user} />
        )}

        {activeTab === 'affiliates' && (
          <AffiliatesTab
            affiliates={affiliates}
            orders={orders}
            reservations={reservations}
            refreshAll={refreshAll}
          />
        )}

        {activeTab === 'bundles' && (
          <BundlesTab
            bundles={bundles}
            products={products}
            refreshAll={refreshAll}
          />
        )}

        {activeTab === 'users' && (
          <UsersTab users={users} refreshAll={refreshAll} />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsTab users={users} orders={orders} />
        )}

        {activeTab === 'events' && (
          <EventsTab events={events} refreshAll={refreshAll} />
        )}
      </div>
    </>
  );
}
