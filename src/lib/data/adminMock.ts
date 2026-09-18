/**
 * Phase 5 Admin mock data — globalThis-persisted for dev server.
 * Mirrors Supabase schema; swapping for real queries is a drop-in change.
 */
import type { Profile, Category, UserRole } from "@/types";

// ---------------------------------------------------------------------------
// Site Settings (single-row)
// ---------------------------------------------------------------------------

export interface SiteSettings {
  id: number;
  site_name: string;
  site_tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  social_links: Record<string, string>;
  seo_defaults: Record<string, string>;
  analytics_id: string | null;
  maintenance_mode: boolean;
  updated_at: string;
}

const defaultSettings: SiteSettings = {
  id: 1,
  site_name: "DUTIMZ",
  site_tagline: "সংবাদ, বিশ্লেষণ, প্রতিদিন",
  logo_url: null,
  favicon_url: null,
  primary_color: "#5f2367",
  secondary_color: "#a370a0",
  accent_color: "#fbbc04",
  social_links: {
    facebook: "https://facebook.com/dutimz",
    twitter: "https://twitter.com/dutimz",
    youtube: "https://youtube.com/@dutimz",
  },
  seo_defaults: {
    meta_title: "DUTIMZ — ঢাকা ইউনিভার্সিটি টাইম্‌জ",
    meta_description:
      "Dutimz — আধুনিক দ্বিভাষিক (বাংলা/ইংরেজি) সংবাদ পোর্টাল",
  },
  analytics_id: null,
  maintenance_mode: false,
  updated_at: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Mock Users
// ---------------------------------------------------------------------------

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString();
}

const MOCK_USERS: Profile[] = [
  { id: "u1", username: "admin-dutimz", display_name: "Admin User", email: "admin@dutimz.com", avatar_url: null, role: "admin", bio: "Site administrator", is_verified: true, preferences: {}, created_at: iso(120), updated_at: iso(1) },
  { id: "u2", username: "mod-nasrin", display_name: "নাসরিন আক্তার", email: "nasrin@dutimz.com", avatar_url: null, role: "moderator", bio: null, is_verified: true, preferences: {}, created_at: iso(100), updated_at: iso(5) },
  { id: "u3", username: "reporter-kamal", display_name: "কামাল হোসেন", email: "kamal@dutimz.com", avatar_url: null, role: "reporter", bio: "Campus reporter", is_verified: true, preferences: {}, created_at: iso(90), updated_at: iso(10) },
  { id: "u4", username: "reporter-fatema", display_name: "ফাতেমা বেগম", email: "fatema@dutimz.com", avatar_url: null, role: "reporter", bio: null, is_verified: false, preferences: {}, created_at: iso(80), updated_at: iso(15) },
  { id: "u5", username: "reader-sakib", display_name: "সাকিব রহমান", email: "sakib@gmail.com", avatar_url: null, role: "visitor", bio: null, is_verified: false, preferences: {}, created_at: iso(60), updated_at: iso(60) },
  { id: "u6", username: "reader-nusrat", display_name: "নুসরাত জাহান", email: "nusrat@gmail.com", avatar_url: null, role: "visitor", bio: null, is_verified: false, preferences: {}, created_at: iso(55), updated_at: iso(55) },
  { id: "u7", username: "reporter-tanvir", display_name: "তানভীর আহমেদ", email: "tanvir@dutimz.com", avatar_url: null, role: "reporter", bio: "Sports desk", is_verified: true, preferences: {}, created_at: iso(50), updated_at: iso(3) },
  { id: "u8", username: "mod-rahul", display_name: "রাহুল দাস", email: "rahul@dutimz.com", avatar_url: null, role: "moderator", bio: null, is_verified: true, preferences: {}, created_at: iso(45), updated_at: iso(2) },
  { id: "u9", username: "reader-sumaiya", display_name: "সুমাইয়া ইসলাম", email: "sumaiya@yahoo.com", avatar_url: null, role: "visitor", bio: null, is_verified: false, preferences: {}, created_at: iso(40), updated_at: iso(40) },
  { id: "u10", username: "reporter-imran", display_name: "ইমরান শাহ", email: "imran@dutimz.com", avatar_url: null, role: "reporter", bio: "Economy beat", is_verified: true, preferences: {}, created_at: iso(35), updated_at: iso(7) },
  { id: "u11", username: "visitor-jesmin", display_name: "জেসমিন আরা", email: "jesmin@gmail.com", avatar_url: null, role: "visitor", bio: null, is_verified: false, preferences: {}, created_at: iso(30), updated_at: iso(30) },
  { id: "u12", username: "reporter-arif", display_name: "আরিফুল ইসলাম", email: "arif@dutimz.com", avatar_url: null, role: "reporter", bio: "Technology desk", is_verified: true, preferences: {}, created_at: iso(25), updated_at: iso(4) },
];

// ---------------------------------------------------------------------------
// Mock Categories (extended with more)
// ---------------------------------------------------------------------------

const MOCK_CATEGORIES: Category[] = [
  { id: "c1", slug: "politics", name_bn: "রাজনীতি", name_en: "Politics", description: "Political news and analysis", parent_id: null, sort_order: 1, is_active: true, created_at: iso(90) },
  { id: "c2", slug: "sports", name_bn: "খেলাধুলা", name_en: "Sports", description: "Sports coverage", parent_id: null, sort_order: 2, is_active: true, created_at: iso(90) },
  { id: "c3", slug: "technology", name_bn: "প্রযুক্তি", name_en: "Technology", description: "Tech news and reviews", parent_id: null, sort_order: 3, is_active: true, created_at: iso(90) },
  { id: "c4", slug: "economy", name_bn: "অর্থনীতি", name_en: "Economy", description: "Economic affairs", parent_id: null, sort_order: 4, is_active: true, created_at: iso(90) },
  { id: "c5", slug: "culture", name_bn: "সংস্কৃতি", name_en: "Culture", description: "Arts and culture", parent_id: null, sort_order: 5, is_active: true, created_at: iso(90) },
  { id: "c6", slug: "campus", name_bn: "ক্যাম্পাস", name_en: "Campus", description: "Campus news", parent_id: null, sort_order: 6, is_active: true, created_at: iso(80) },
  { id: "c7", slug: "opinion", name_bn: "মতামত", name_en: "Opinion", description: "Opinion pieces", parent_id: null, sort_order: 7, is_active: false, created_at: iso(70) },
];

// ---------------------------------------------------------------------------
// Mock Tags
// ---------------------------------------------------------------------------

export interface MockTag {
  id: string;
  slug: string;
  name_bn: string;
  name_en: string;
  usage_count: number;
  created_at: string;
}

const MOCK_TAGS: MockTag[] = [
  { id: "t1", slug: "bangladesh", name_bn: "বাংলাদেশ", name_en: "Bangladesh", usage_count: 45, created_at: iso(90) },
  { id: "t2", slug: "dhaka", name_bn: "ঢাকা", name_en: "Dhaka", usage_count: 38, created_at: iso(85) },
  { id: "t3", slug: "university", name_bn: "বিশ্ববিদ্যালয়", name_en: "University", usage_count: 22, created_at: iso(80) },
  { id: "t4", slug: "ai", name_bn: "এআই", name_en: "AI", usage_count: 15, created_at: iso(40) },
  { id: "t5", slug: "election", name_bn: "নির্বাচন", name_en: "Election", usage_count: 12, created_at: iso(60) },
  { id: "t6", slug: "climate", name_bn: "জলবায়ু", name_en: "Climate", usage_count: 8, created_at: iso(50) },
];

// ---------------------------------------------------------------------------
// Mock Ads
// ---------------------------------------------------------------------------

export interface MockAd {
  id: string;
  name: string;
  placement: string;
  image_url: string | null;
  link_url: string | null;
  html_content: string | null;
  start_date: string | null;
  end_date: string | null;
  impression_count: number;
  click_count: number;
  is_active: boolean;
  created_at: string;
}

const MOCK_ADS: MockAd[] = [
  { id: "ad1", name: "University banner", placement: "header", image_url: "https://via.placeholder.com/728x90/5f2367/ffffff?text=DUTIMZ", link_url: "https://dutimz.com", html_content: null, start_date: iso(30), end_date: null, impression_count: 12400, click_count: 340, is_active: true, created_at: iso(30) },
  { id: "ad2", name: "Book fair promo", placement: "sidebar", image_url: "https://via.placeholder.com/300x250/a370a0/ffffff?text=Book+Fair", link_url: null, html_content: null, start_date: iso(14), end_date: iso(-7), impression_count: 5600, click_count: 120, is_active: false, created_at: iso(14) },
  { id: "ad3", name: "Newsletter CTA inline", placement: "inline", image_url: null, link_url: null, html_content: "<div style='padding:16px;background:#f5dff7;border-radius:8px;text-align:center'>Subscribe to DUTIMZ Newsletter</div>", start_date: null, end_date: null, impression_count: 8900, click_count: 210, is_active: true, created_at: iso(60) },
];

// ---------------------------------------------------------------------------
// Mock Polls (extended)
// ---------------------------------------------------------------------------

export interface MockPoll {
  id: string;
  question_bn: string;
  question_en: string;
  options: { id: string; label_bn: string; label_en: string; votes: number }[];
  totalVotes: number;
  is_active: boolean;
  ends_at: string | null;
  created_at: string;
}

const MOCK_POLLS: MockPoll[] = [
  {
    id: "poll-1",
    question_bn: "ঢাকা মেট্রোরেলের নতুন সময়সূচি সম্পর্কে আপনার মতামত কী?",
    question_en: "What do you think about the new Metro Rail timetable?",
    options: [
      { id: "opt-1a", label_bn: "খুব ভালো", label_en: "Very good", votes: 142 },
      { id: "opt-1b", label_bn: "ভালো", label_en: "Good", votes: 89 },
      { id: "opt-1c", label_bn: "গড়", label_en: "Average", votes: 34 },
      { id: "opt-1d", label_bn: "খারাপ", label_en: "Poor", votes: 12 },
    ],
    totalVotes: 277,
    is_active: true,
    ends_at: null,
    created_at: iso(3),
  },
  {
    id: "poll-2",
    question_bn: "বাংলা নিউজরুমে AI ব্যবহার করা উচিত কি?",
    question_en: "Should AI be used in Bangla newsrooms?",
    options: [
      { id: "opt-2a", label_bn: "হ্যাঁ, সম্পূর্ণ", label_en: "Yes, fully", votes: 56 },
      { id: "opt-2b", label_bn: "আংশিকভাবে", label_en: "Partially", votes: 98 },
      { id: "opt-2c", label_bn: "না, কখনোই না", label_en: "No, never", votes: 23 },
    ],
    totalVotes: 177,
    is_active: false,
    ends_at: iso(-2),
    created_at: iso(10),
  },
];

// ---------------------------------------------------------------------------
// Mock Newsletter Subscribers
// ---------------------------------------------------------------------------

export interface MockSubscriber {
  id: string;
  email: string;
  locale: string;
  is_active: boolean;
  created_at: string;
  unsubscribed_at: string | null;
}

const MOCK_SUBSCRIBERS: MockSubscriber[] = [
  { id: "ns1", email: "rahim@gmail.com", locale: "bn", is_active: true, created_at: iso(60), unsubscribed_at: null },
  { id: "ns2", email: "karim@yahoo.com", locale: "en", is_active: true, created_at: iso(50), unsubscribed_at: null },
  { id: "ns3", email: "fatima@outlook.com", locale: "bn", is_active: true, created_at: iso(45), unsubscribed_at: null },
  { id: "ns4", email: "john@proton.me", locale: "en", is_active: false, created_at: iso(40), unsubscribed_at: iso(20) },
  { id: "ns5", email: "nadia@gmail.com", locale: "bn", is_active: true, created_at: iso(30), unsubscribed_at: null },
  { id: "ns6", email: "samir@hotmail.com", locale: "bn", is_active: true, created_at: iso(25), unsubscribed_at: null },
  { id: "ns7", email: "lisa@company.com", locale: "en", is_active: true, created_at: iso(15), unsubscribed_at: null },
  { id: "ns8", email: "tanvir@gmail.com", locale: "bn", is_active: false, created_at: iso(10), unsubscribed_at: iso(5) },
];

// ---------------------------------------------------------------------------
// GlobalThis store
// ---------------------------------------------------------------------------

interface AdminStore {
  settings: SiteSettings;
  users: Profile[];
  categories: Category[];
  tags: MockTag[];
  ads: MockAd[];
  polls: MockPoll[];
  subscribers: MockSubscriber[];
  nextTagId: number;
  nextAdId: number;
  nextPollId: number;
  nextSubId: number;
}

const g = globalThis as Record<string, unknown>;
if (!g.__dutimz_admin_store) {
  g.__dutimz_admin_store = {
    settings: { ...defaultSettings },
    users: [...MOCK_USERS],
    categories: [...MOCK_CATEGORIES],
    tags: [...MOCK_TAGS],
    ads: [...MOCK_ADS],
    polls: [...MOCK_POLLS],
    subscribers: [...MOCK_SUBSCRIBERS],
    nextTagId: 7,
    nextAdId: 4,
    nextPollId: 3,
    nextSubId: 9,
  } as AdminStore;
}
const store = g.__dutimz_admin_store as AdminStore;

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export function getSettings(): SiteSettings {
  return store.settings;
}

export function updateSettings(patch: Partial<SiteSettings>): SiteSettings {
  Object.assign(store.settings, patch, { updated_at: new Date().toISOString() });
  return store.settings;
}

// ---------------------------------------------------------------------------
// Users helpers
// ---------------------------------------------------------------------------

export function listUsers(filters?: {
  search?: string;
  role?: string;
  page?: number;
  pageSize?: number;
}): { users: Profile[]; total: number } {
  let result = [...store.users];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q),
    );
  }

  if (filters?.role) {
    result = result.filter((u) => u.role === filters.role);
  }

  const total = result.length;
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  result = result.slice(start, start + pageSize);

  return { users: result, total };
}

export function updateUser(
  id: string,
  patch: Partial<Pick<Profile, "role" | "is_verified">>,
): Profile | undefined {
  const user = store.users.find((u) => u.id === id);
  if (!user) return undefined;
  if (patch.role !== undefined) user.role = patch.role;
  if (patch.is_verified !== undefined) user.is_verified = patch.is_verified;
  user.updated_at = new Date().toISOString();
  return user;
}

// ---------------------------------------------------------------------------
// Categories helpers
// ---------------------------------------------------------------------------

export function listCategories(): Category[] {
  return [...store.categories].sort((a, b) => a.sort_order - b.sort_order);
}

export function createCategory(
  input: Omit<Category, "id" | "created_at">,
): Category {
  const cat: Category = {
    ...input,
    id: `c-${Date.now().toString(36)}`,
    created_at: new Date().toISOString(),
  };
  store.categories.push(cat);
  return cat;
}

export function updateCategory(
  id: string,
  patch: Partial<Category>,
): Category | undefined {
  const cat = store.categories.find((c) => c.id === id);
  if (!cat) return undefined;
  Object.assign(cat, patch);
  return cat;
}

export function deleteCategory(id: string): boolean {
  const idx = store.categories.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.categories.splice(idx, 1);
  return true;
}

export function reorderCategories(orderedIds: string[]): Category[] {
  orderedIds.forEach((id, i) => {
    const cat = store.categories.find((c) => c.id === id);
    if (cat) cat.sort_order = i + 1;
  });
  return listCategories();
}

// ---------------------------------------------------------------------------
// Tags helpers
// ---------------------------------------------------------------------------

export function listTags(search?: string): MockTag[] {
  let result = [...store.tags];
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (t) =>
        t.name_bn.toLowerCase().includes(q) ||
        t.name_en.toLowerCase().includes(q) ||
        t.slug.includes(q),
    );
  }
  return result;
}

export function createTag(
  input: Omit<MockTag, "id" | "usage_count" | "created_at">,
): MockTag {
  const tag: MockTag = {
    ...input,
    id: `t-${store.nextTagId++}`,
    usage_count: 0,
    created_at: new Date().toISOString(),
  };
  store.tags.push(tag);
  return tag;
}

export function updateTag(
  id: string,
  patch: Partial<MockTag>,
): MockTag | undefined {
  const tag = store.tags.find((t) => t.id === id);
  if (!tag) return undefined;
  Object.assign(tag, patch);
  return tag;
}

export function deleteTag(id: string): boolean {
  const idx = store.tags.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  store.tags.splice(idx, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Ads helpers
// ---------------------------------------------------------------------------

export function listAds(): MockAd[] {
  return [...store.ads];
}

export function createAd(
  input: Omit<MockAd, "id" | "impression_count" | "click_count" | "created_at">,
): MockAd {
  const ad: MockAd = {
    ...input,
    id: `ad-${store.nextAdId++}`,
    impression_count: 0,
    click_count: 0,
    created_at: new Date().toISOString(),
  };
  store.ads.push(ad);
  return ad;
}

export function updateAd(
  id: string,
  patch: Partial<MockAd>,
): MockAd | undefined {
  const ad = store.ads.find((a) => a.id === id);
  if (!ad) return undefined;
  Object.assign(ad, patch);
  return ad;
}

export function deleteAd(id: string): boolean {
  const idx = store.ads.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  store.ads.splice(idx, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Polls helpers
// ---------------------------------------------------------------------------

export function listPolls(): MockPoll[] {
  return [...store.polls];
}

export function createPoll(
  input: Omit<MockPoll, "id" | "totalVotes" | "created_at">,
): MockPoll {
  const poll: MockPoll = {
    ...input,
    id: `poll-${store.nextPollId++}`,
    totalVotes: input.options.reduce((sum, o) => sum + o.votes, 0),
    created_at: new Date().toISOString(),
  };
  store.polls.push(poll);
  return poll;
}

export function updatePoll(
  id: string,
  patch: Partial<MockPoll>,
): MockPoll | undefined {
  const poll = store.polls.find((p) => p.id === id);
  if (!poll) return undefined;
  Object.assign(poll, patch);
  if (patch.options) {
    poll.totalVotes = patch.options.reduce((sum, o) => sum + o.votes, 0);
  }
  return poll;
}

export function deletePoll(id: string): boolean {
  const idx = store.polls.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  store.polls.splice(idx, 1);
  return true;
}

// ---------------------------------------------------------------------------
// Newsletter helpers
// ---------------------------------------------------------------------------

export function listSubscribers(filters?: {
  search?: string;
  page?: number;
  pageSize?: number;
}): { subscribers: MockSubscriber[]; total: number; activeCount: number } {
  let result = [...store.subscribers];

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((s) => s.email.toLowerCase().includes(q));
  }

  const total = result.length;
  const activeCount = store.subscribers.filter((s) => s.is_active).length;
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  result = result.slice(start, start + pageSize);

  return { subscribers: result, total, activeCount };
}

export function unsubscribeSubscriber(id: string): MockSubscriber | undefined {
  const sub = store.subscribers.find((s) => s.id === id);
  if (!sub) return undefined;
  sub.is_active = false;
  sub.unsubscribed_at = new Date().toISOString();
  return sub;
}
