import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type PublicConfig = { supabaseUrl: string; supabaseAnonKey: string; mediaUrl: string; demoMode: boolean };
type Role = 'reader' | 'reporter' | 'moderator' | 'admin';
type Tier = 'junior' | 'general' | 'executive' | null;
type Profile = { id: string; username: string; display_name: string; avatar_url: string | null; bio?: string };
type Article = { id: string; slug: string; title: string; excerpt: string; body: string; published_at: string | null; created_at: string; status: string; author_id: string; hero_media_key: string | null; category: { slug: string; title_bn: string } | { slug: string; title_bn: string }[]; profiles: { username: string; display_name: string; avatar_url: string | null } | { username: string; display_name: string; avatar_url: string | null }[] };

const digits = new Intl.NumberFormat('bn-BD', { maximumFractionDigits: 0 });
const money = (amount: number) => `৳${digits.format(amount)}`;
const strings = {
  login: 'এই সুবিধাটি ব্যবহার করতে গুগল দিয়ে প্রবেশ করুন।',
  required: 'সিদ্ধান্তের কারণ লিখুন (অন্তত ৩ অক্ষর)।',
  done: 'আপনার তথ্য সংরক্ষণ করা হয়েছে।',
};
let config: PublicConfig = { supabaseUrl: '', supabaseAnonKey: '', mediaUrl: '', demoMode: true };
let supabase: SupabaseClient | null = null;
let authUser: User | null = null;
let authProfile: Profile | null = null;
let authRole: Role = 'reader';
let reporterTier: Tier = null;
let currentArticles: Article[] = [];
let profileCompletion = 0;
let demoMode = true;
let profilePromptShown = false;
let searchAbort = 0;
let refreshBusy = false;

function toast(message: string, isError = false) {
  const region = document.querySelector<HTMLElement>('[data-toast-region]');
  if (!region) { console.info(`[DUTIMZ] ${message}`); return; }
  const item = document.createElement('div');
  item.className = `toast${isError ? ' is-error' : ''}`;
  item.textContent = message;
  region.appendChild(item);
  window.setTimeout(() => item.remove(), 4200);
}
function setMessage(target: HTMLElement | null, message: string, isError = true) {
  if (!target) return;
  target.hidden = !message;
  target.textContent = message;
  target.setAttribute('role', isError ? 'alert' : 'status');
}
function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
function attr(value: unknown) { return escapeHtml(value).replace(/`/g, '&#96;'); }
function single<T>(item: T | T[] | null | undefined): T | null { return Array.isArray(item) ? item[0] ?? null : item ?? null; }
function timestamp(value: string | null | undefined) { return value ? new Date(value).toLocaleDateString('bn-BD', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
function relativeTime(value: string | null | undefined) {
  if (!value) return 'সম্প্রতি';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return 'এইমাত্র';
  if (hours < 24) return `${digits.format(hours)} ঘণ্টা আগে`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${digits.format(days)} দিন আগে` : timestamp(value);
}
function publicName(profile: { display_name?: string | null; username?: string | null } | null | undefined) { return profile?.display_name?.trim() || `@${profile?.username || 'পাঠক'}`; }

async function loadConfig() {
  try {
    const response = await fetch('/api/config.json', { cache: 'no-store' });
    if (response.ok) config = { ...config, ...await response.json() as PublicConfig };
  } catch (error) { console.warn('DUTIMZ configuration is not available yet', error); }
  demoMode = document.body.dataset.demoMode === 'true' || (config.demoMode && !config.supabaseUrl);
  if (config.supabaseUrl && config.supabaseAnonKey) {
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { headers: { 'X-Client-Info': 'dutimz-web' } },
    });
  }
}
function menuButton() { return document.querySelector<HTMLButtonElement>('[data-account-toggle]'); }
function menuPanel() { return document.querySelector<HTMLElement>('[data-account-panel]'); }
function setMenuOpen(open: boolean) {
  const button = menuButton(); const panel = menuPanel();
  button?.setAttribute('aria-expanded', String(open));
  if (panel) panel.hidden = !open;
}
function setSelectorHidden(selector: string, hidden: boolean) { document.querySelectorAll<HTMLElement>(selector).forEach((element) => { element.hidden = hidden; }); }
function roleName() { return authRole === 'admin' ? 'অ্যাডমিন' : authRole === 'moderator' ? 'মডারেটর' : authRole === 'reporter' ? `${reporterTier === 'junior' ? 'জুনিয়র' : reporterTier === 'general' ? 'জেনারেল' : 'এক্সিকিউটিভ'} রিপোর্টার` : 'রিডার'; }
function renderAccountLinks() {
  const links = document.querySelector<HTMLElement>('[data-dynamic-account-links]');
  if (!links) return;
  if (!authUser) { links.innerHTML = ''; return; }
  const authorLinks = authRole === 'reporter' || authRole === 'moderator' || authRole === 'admin'
    ? `<a href="/account/write/"><span class="account-link-icon">✎</span><span>প্রতিবেদন লিখুন</span></a>`
    : `<a href="/account/write/"><span class="account-link-icon">✦</span><span>রিপোর্টার হিসেবে আবেদন</span></a>`;
  const editorialLinks = authRole === 'moderator' || authRole === 'admin'
    ? `<a href="/account/moderation/"><span class="account-link-icon">✓</span><span>মডারেশন ডেস্ক</span></a>`
    : '';
  const adminLinks = authRole === 'admin'
    ? `<a href="/account/admin/"><span class="account-link-icon">⚙</span><span>প্রশাসনিক নিয়ন্ত্রণ</span></a>`
    : '';
  links.innerHTML = `<a href="/account/"><span class="account-link-icon">◎</span><span>আমার ড্যাশবোর্ড</span></a><a href="/profile/me/"><span class="account-link-icon">○</span><span>আমার প্রোফাইল</span></a><a href="/account/balance/"><span class="account-link-icon">৳</span><span>আয় ও উত্তোলন</span></a><a href="/saved/"><span class="account-link-icon">▱</span><span>সংরক্ষিত প্রতিবেদন</span></a>${authorLinks}${editorialLinks}${adminLinks}`;
}
function paintAuthState() {
  const button = menuButton();
  const name = publicName(authProfile);
  const label = document.querySelector<HTMLElement>('[data-account-label]');
  const display = document.querySelector<HTMLElement>('[data-account-name]');
  const email = document.querySelector<HTMLElement>('[data-account-email]');
  if (label) label.textContent = authUser ? name : 'অ্যাকাউন্ট';
  if (display) display.textContent = authUser ? name : 'স্বাগতম';
  if (email) email.textContent = authUser ? `${roleName()} · @${authProfile?.username ?? ''}` : 'পাঠক হিসেবে পড়ুন';
  if (button) button.setAttribute('aria-label', authUser ? `${name} — অ্যাকাউন্ট মেনু` : 'অ্যাকাউন্ট মেনু খুলুন');
  setSelectorHidden('[data-signed-out-only]', Boolean(authUser));
  setSelectorHidden('[data-signed-in-only]', !authUser);
  setSelectorHidden('[data-reporter-only]', !authUser || (authRole !== 'reporter' && authRole !== 'moderator' && authRole !== 'admin'));
  setSelectorHidden('[data-moderator-only]', !authUser || (authRole !== 'moderator' && authRole !== 'admin'));
  setSelectorHidden('[data-admin-only]', !authUser || authRole !== 'admin');
  const avatarUrl = authProfile?.avatar_url ?? (typeof authUser?.user_metadata?.avatar_url === 'string' ? authUser.user_metadata.avatar_url : '');
  for (const selector of ['[data-account-avatar]', '[data-panel-avatar]', '[data-dashboard-avatar]', '[data-profile-page-avatar]']) {
    const container = document.querySelector<HTMLElement>(selector);
    if (!container) continue;
    if (avatarUrl) container.innerHTML = `<img src="${attr(avatarUrl)}" referrerpolicy="no-referrer" alt="" />`;
    else if (!container.querySelector('svg')) container.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>';
  }
  const signOut = document.querySelector<HTMLButtonElement>('[data-sign-out]');
  if (signOut) signOut.hidden = !authUser;
  renderAccountLinks();
}
function setCompletion(percent: number) {
  profileCompletion = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const accountPanel = document.querySelector<HTMLElement>('[data-account-panel]');
  if (accountPanel) accountPanel.setAttribute('aria-label', `প্রোফাইল সম্পূর্ণ ${digits.format(profileCompletion)} শতাংশ`);
  for (const selector of ['[data-profile-percent]', '[data-modal-percent]', '[data-dashboard-percent]']) {
    const element = document.querySelector<HTMLElement>(selector); if (element) element.textContent = `${digits.format(profileCompletion)}٪`;
  }
  for (const selector of ['[data-profile-progress]', '[data-modal-progress]']) {
    const bar = document.querySelector<HTMLElement>(selector); if (bar) bar.style.width = `${profileCompletion}%`;
  }
  const tip = document.querySelector<HTMLElement>('[data-dashboard-profile-tip]');
  if (tip) tip.textContent = profileCompletion === 100 ? 'প্রোফাইল সম্পূর্ণ—যোগ্য হলে আয়ের সুবিধা চালু আছে।' : 'তথ্য পূরণ করলে আপনার লেখার আয়ের সুবিধা চালু হবে।';
}
function formDataObject(form: HTMLFormElement) { return Object.fromEntries(new FormData(form).entries()); }

async function initOAuth() {
  document.querySelectorAll<HTMLElement>('[data-google-sign-in]').forEach((button) => button.addEventListener('click', async (event) => {
    event.preventDefault();
    if (!supabase) { toast('গুগল প্রবেশ চালু করতে Supabase URL ও publishable key কনফিগার করুন।', true); return; }
    const element = button as HTMLButtonElement; element.disabled = true;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback/`, queryParams: { prompt: 'select_account' } } });
    if (error) { element.disabled = false; setMessage(document.querySelector('[data-auth-error]'), error.message); toast(error.message, true); }
  }));
  const params = new URLSearchParams(window.location.search);
  if (params.has('error') || params.has('error_description')) setMessage(document.querySelector('[data-auth-error]'), params.get('error_description') || 'গুগল দিয়ে প্রবেশ করা যায়নি। আবার চেষ্টা করুন।');
  if (!supabase) return;
  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) { const status = document.querySelector<HTMLElement>('[data-callback-status]'); if (status) status.textContent = 'প্রবেশ সম্পন্ন হয়নি। আবার গুগল দিয়ে প্রবেশ করুন।'; toast(error.message, true); }
    else { const next = sessionStorage.getItem('dutimz-after-auth') || '/'; sessionStorage.removeItem('dutimz-after-auth'); window.history.replaceState({}, '', '/auth/callback/'); window.location.assign(next); }
    return;
  }
  if (document.querySelector('[data-callback-status]')) {
    const { data, error } = await supabase.auth.getSession(); const status = document.querySelector<HTMLElement>('[data-callback-status]');
    if (status) status.textContent = error || !data.session ? 'প্রবেশ সম্পন্ন হয়নি। আবার গুগল দিয়ে প্রবেশ করুন।' : 'প্রবেশ সফল। আপনাকে মূলপাতায় নেওয়া হচ্ছে…';
    if (data.session) window.location.replace('/');
  }
}
async function loadIdentity(user: User) {
  if (!supabase) return;
  const [profileResult, roleResult, completionResult, walletResult, detailsResult] = await Promise.all([
    supabase.from('profiles').select('id,username,display_name,avatar_url,bio').eq('id', user.id).maybeSingle(),
    supabase.from('user_roles').select('role,reporter_tier').eq('user_id', user.id).maybeSingle(),
    supabase.rpc('get_my_profile_completion'),
    supabase.rpc('get_my_wallet'),
    supabase.from('profile_details').select('department,session').eq('user_id', user.id).maybeSingle(),
  ]);
  if (profileResult.error) console.warn('Profile is not available', profileResult.error.message);
  authProfile = profileResult.data as Profile | null;
  authRole = (roleResult.data?.role as Role | undefined) ?? 'reader';
  reporterTier = (roleResult.data?.reporter_tier as Tier | undefined) ?? null;
  setCompletion(Number(completionResult.data ?? 0));
  const wallet = walletResult.data as { available?: number; held?: number; reserved?: number } | null;
  const balance = money(Number(wallet?.available ?? 0) + Number(wallet?.held ?? 0) + Number(wallet?.reserved ?? 0));
  for (const selector of ['[data-balance-value]', '[data-dashboard-balance]']) { const node = document.querySelector<HTMLElement>(selector); if (node) node.textContent = balance; }
  const setAmount = (selector: string, amount: unknown) => { const node = document.querySelector<HTMLElement>(selector); if (node) node.textContent = money(Number(amount ?? 0)); };
  setAmount('[data-wallet-available]', wallet?.available); setAmount('[data-wallet-held]', wallet?.held); setAmount('[data-wallet-reserved]', wallet?.reserved);
  const displayName = authProfile?.display_name || String(user.user_metadata?.full_name || user.user_metadata?.name || 'আপনার নাম');
  const username = authProfile?.username ?? '';
  for (const selector of ['[data-dashboard-name]', '[data-profile-page-name]']) { const node = document.querySelector<HTMLElement>(selector); if (node) node.textContent = displayName; }
  for (const selector of ['[data-dashboard-handle]', '[data-profile-page-handle]']) { const node = document.querySelector<HTMLElement>(selector); if (node) node.textContent = `@${username}`; }
  const publicLink = document.querySelector<HTMLAnchorElement>('[data-profile-public-link]'); if (publicLink) publicLink.href = `/u/${encodeURIComponent(username)}/`;
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-profile-field]').forEach((field) => {
    if (field.dataset.profileField === 'display_name') field.value = authProfile?.display_name ?? '';
    if (field.dataset.profileField === 'username') field.value = authProfile?.username ?? '';
    if (field.dataset.profileField === 'bio') field.value = authProfile?.bio ?? '';
    if (field.dataset.profileField === 'department') field.value = String(detailsResult.data?.department ?? '');
    if (field.dataset.profileField === 'session') field.value = String(detailsResult.data?.session ?? '');
  });
  const reporterAction = document.querySelector<HTMLElement>('[data-write-action-title]');
  if (reporterAction) reporterAction.textContent = authRole === 'reporter' || authRole === 'moderator' || authRole === 'admin' ? 'প্রতিবেদন লিখুন' : 'রিপোর্টার হিসেবে আবেদন';
  const reporterSubtitle = document.querySelector<HTMLElement>('[data-write-action-subtitle]');
  if (reporterSubtitle) reporterSubtitle.textContent = authRole === 'reporter' || authRole === 'moderator' || authRole === 'admin' ? 'প্রতিবেদন পাঠান ও আপনার লেখা পরিচালনা করুন' : 'নিজের লেখা ও প্রস্তাবনা পাঠান';
  setSelectorHidden('[data-dashboard-moderation]', authRole !== 'moderator' && authRole !== 'admin');
  setSelectorHidden('[data-dashboard-admin]', authRole !== 'admin');
  await loadWalletHistory(user.id); await loadSavedStories(user.id); await loadOwnArticles(); await maybeOpenProfilePrompt();
}
async function reloadRole() {
  if (!supabase || !authUser) return;
  const result = await supabase.from('user_roles').select('role,reporter_tier').eq('user_id', authUser.id).maybeSingle();
  if (!result.error) { authRole = (result.data?.role as Role | undefined) ?? 'reader'; reporterTier = (result.data?.reporter_tier as Tier | undefined) ?? null; }
}
function categoryInfo(article: Article) { return single(article.category) ?? { slug: 'campus', title_bn: 'ক্যাম্পাস' }; }
function authorInfo(article: Article) { return single(article.profiles) ?? { username: 'reader', display_name: 'পাঠক', avatar_url: null }; }
function storyImageClass(slug: string) { return slug.includes('culture') || slug.includes('opinion') ? 'art-culture' : slug.includes('university') ? 'art-library' : slug.includes('student') ? 'art-student' : 'art-campus'; }
function getFeaturedStory() { return currentArticles[0] ?? null; }
function updateFeatured(article: Article) {
  const root = document.querySelector<HTMLElement>('[data-featured-story]'); if (!root) return;
  root.dataset.storyId = article.id; const titleLink = root.querySelector<HTMLAnchorElement>('h1 a'); const category = categoryInfo(article);
  if (titleLink) { titleLink.href = `/news/${encodeURIComponent(article.slug)}/`; titleLink.textContent = article.title; }
  const body = root.querySelector<HTMLElement>('.lead-story__copy > p'); if (body) body.textContent = article.excerpt;
  const meta = root.querySelector<HTMLElement>('.lead-story__meta'); if (meta) meta.innerHTML = `<a href="/category/${attr(category.slug)}/">${escapeHtml(category.title_bn)}</a><span aria-hidden="true">·</span><time>${escapeHtml(relativeTime(article.published_at))}</time>`;
  const button = root.querySelector<HTMLAnchorElement>('.lead-story__copy > .read-button'); if (button) button.href = `/news/${encodeURIComponent(article.slug)}/`;
}
function renderStoryCard(article: Article, rank = 0, compact = false) {
  const category = categoryInfo(article); const author = authorInfo(article); const url = `/news/${encodeURIComponent(article.slug)}/`;
  return `<article class="story-card${compact ? ' story-card--compact' : ''}" data-story-card data-story-id="${attr(article.id)}">${rank ? `<span class="story-rank" aria-hidden="true">${digits.format(rank)}</span>` : ''}<a class="story-card__art story-art" href="${url}" aria-label="পড়ুন: ${attr(article.title)}"><span class="story-art__visual ${storyImageClass(category.slug)}" aria-hidden="true"><span class="story-art__halo"></span><span class="story-art__line story-art__line--one"></span><span class="story-art__line story-art__line--two"></span><span class="story-art__seal">ঢা<br><i>বি</i></span><span class="story-art__pill">ঢাকা বিশ্ববিদ্যালয়</span></span><span class="story-card__category">${escapeHtml(category.title_bn)}</span></a><div class="story-card__body"><div class="story-meta"><a href="/category/${attr(category.slug)}/">${escapeHtml(category.title_bn)}</a><span aria-hidden="true">·</span><time>${escapeHtml(relativeTime(article.published_at))}</time></div><h3><a href="${url}">${escapeHtml(article.title)}</a></h3>${compact ? '' : `<p>${escapeHtml(article.excerpt)}</p>`}<div class="story-card__footer"><a class="story-byline" href="/u/${encodeURIComponent(author.username)}/">${escapeHtml(publicName(author))}</a><a class="round-arrow" href="${url}" aria-label="পড়ুন: ${attr(article.title)}"><svg viewBox="0 0 24 24"><path d="M5 12h13M12 5l7 7-7 7"/></svg></a></div></div></article>`;
}
function renderSidebar(articles: Article[]) {
  const feature = document.querySelector<HTMLElement>('[data-recommended-feature]'); const list = document.querySelector<HTMLElement>('#recommended-list'); const empty = document.querySelector<HTMLElement>('[data-sidebar-empty]');
  if (!feature || !list) return;
  if (!articles.length) { feature.innerHTML = ''; list.replaceChildren(); if (empty) empty.hidden = false; return; }
  if (empty) empty.hidden = true;
  const first = articles[0]; const category = categoryInfo(first);
  feature.innerHTML = `<a class="recommended-feature__art story-art" href="/news/${encodeURIComponent(first.slug)}/" aria-label="পড়ুন: ${attr(first.title)}"><span class="story-art__visual ${storyImageClass(category.slug)}" aria-hidden="true"><span class="story-art__halo"></span><span class="story-art__seal">ঢা<br><i>বি</i></span><span class="recommended-feature__copy"><span>${escapeHtml(category.title_bn)} · ${escapeHtml(relativeTime(first.published_at))}</span><strong>${escapeHtml(first.title)}</strong></span></span></a>`;
  list.innerHTML = articles.slice(1, 7).map((article) => { const item = categoryInfo(article); return `<article class="recommended-item" data-story-id="${attr(article.id)}"><a href="/news/${encodeURIComponent(article.slug)}/" class="recommended-item__copy"><span class="story-meta"><span>${escapeHtml(item.title_bn)}</span><span>·</span><time>${escapeHtml(relativeTime(article.published_at))}</time></span><h3>${escapeHtml(article.title)}</h3></a><a class="recommended-thumb story-art__visual ${storyImageClass(item.slug)}" href="/news/${encodeURIComponent(article.slug)}/" aria-label="পড়ুন: ${attr(article.title)}"><span class="story-art__seal">ঢা</span></a></article>`; }).join('');
}
function renderSearch(article: Article) {
  const category = categoryInfo(article);
  return `<article class="search-result" data-story-id="${attr(article.id)}"><a class="search-result__art ${storyImageClass(category.slug)}" href="/news/${encodeURIComponent(article.slug)}/" aria-hidden="true"></a><div><div class="story-meta"><span>${escapeHtml(category.title_bn)}</span><span>·</span><time>${escapeHtml(relativeTime(article.published_at))}</time></div><h3><a href="/news/${encodeURIComponent(article.slug)}/">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(article.excerpt)}</p></div></article>`;
}
function renderSearchEmpty() { return '<div class="feed-empty"><span class="feed-empty__icon">⌕</span><strong>কোনো প্রতিবেদন পাওয়া যায়নি</strong><p>অন্য শব্দ লিখে আবার চেষ্টা করুন।</p></div>'; }
function initLiveSearch() {
  const globalResults = document.querySelector<HTMLElement>('[data-search-results]'); const globalList = document.querySelector<HTMLElement>('#search-results-list'); const globalHeading = document.querySelector<HTMLElement>('[data-search-heading]');
  const submitSearch = async (raw: string, onPage: boolean) => {
    const query = raw.trim(); const version = ++searchAbort;
    if (!query) { if (onPage) renderCurrentFeed(); else if (globalResults) globalResults.hidden = true; return; }
    if (onPage) history.replaceState({}, '', `/search/?q=${encodeURIComponent(query)}`);
    let found: Article[] = [];
    if (supabase && !demoMode) {
      const result = await supabase.rpc('search_public_articles', { p_query: query, p_limit: 30 });
      if (version !== searchAbort) return;
      if (result.error) { toast(result.error.message, true); return; }
      found = (result.data ?? []) as Article[];
    } else {
      const words = query.toLocaleLowerCase('bn-BD').split(/\s+/).filter(Boolean);
      found = currentArticles.filter((article) => words.some((word) => `${article.title} ${article.excerpt} ${categoryInfo(article).title_bn}`.toLocaleLowerCase('bn-BD').includes(word)));
    }
    if (version !== searchAbort) return;
    if (onPage) {
      const target = document.querySelector<HTMLElement>('#search-page-results'); if (target) target.innerHTML = found.map((item) => renderStoryCard(item)).join('');
      const empty = document.querySelector<HTMLElement>('[data-search-no-results]'); if (empty) empty.hidden = found.length > 0;
      const heading = document.querySelector<HTMLElement>('[data-search-heading]'); if (heading) heading.textContent = `“${query}” খোঁজার ফলাফল`;
      const count = document.querySelector<HTMLElement>('[data-search-count]'); if (count) count.textContent = `${digits.format(found.length)}টি প্রতিবেদন পাওয়া গেছে`;
    } else {
      if (globalResults) globalResults.hidden = false; if (globalHeading) globalHeading.textContent = `“${query}” খোঁজার ফলাফল`;
      if (globalList) globalList.innerHTML = found.length ? found.map(renderSearch).join('') : renderSearchEmpty();
      globalResults?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };
  document.querySelectorAll<HTMLFormElement>('[data-search-form]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); submitSearch(form.querySelector<HTMLInputElement>('input[name="q"]')?.value ?? '', false); }));
  document.querySelectorAll<HTMLInputElement>('[data-search-input]').forEach((input) => input.addEventListener('input', () => {
    window.clearTimeout(Number(input.dataset.searchTimer)); const timer = window.setTimeout(() => { if (input.value.trim().length >= 2) submitSearch(input.value, false); else if (!input.value.trim() && globalResults) globalResults.hidden = true; }, 220); input.dataset.searchTimer = String(timer);
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-sidebar-search]').forEach((button) => button.addEventListener('click', () => submitSearch(document.querySelector<HTMLInputElement>('#sidebar-search-input')?.value ?? '', false)));
  document.querySelectorAll<HTMLFormElement>('[data-search-page-form]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); submitSearch(form.querySelector<HTMLInputElement>('[data-page-search-input]')?.value ?? '', true); }));
  const query = new URLSearchParams(location.search).get('q');
  if (query) { const input = document.querySelector<HTMLInputElement>('[data-page-search-input]'); if (input) input.value = query; submitSearch(query, true); }
  document.querySelectorAll<HTMLElement>('[data-open-search]').forEach((button) => button.addEventListener('click', () => { const input = document.querySelector<HTMLInputElement>('#sidebar-search-input, #header-search-input'); input?.focus({ preventScroll: true }); input?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  document.querySelectorAll<HTMLElement>('[data-close-search]').forEach((button) => button.addEventListener('click', () => { if (globalResults) globalResults.hidden = true; }));
}
function renderCurrentFeed() {
  const pathParts = location.pathname.split('/').filter(Boolean); const categorySlug = pathParts[0] === 'category' ? pathParts[1] : '';
  const visible = categorySlug ? currentArticles.filter((article) => categoryInfo(article).slug === categorySlug) : currentArticles;
  const feed = document.querySelector<HTMLElement>('#story-feed');
  if (feed) feed.innerHTML = visible.slice(categorySlug ? 0 : 1, 7).map((article, index) => renderStoryCard(article, index + 1)).join('') || `<div class="feed-empty"><span class="feed-empty__icon">ঢা</span><strong>${categorySlug ? 'এই বিভাগে এখনো প্রতিবেদন নেই' : 'প্রথম প্রতিবেদনটি আসছে'}</strong><p>সম্পাদকীয় ডেস্কের যাচাই করা খবর এখানে দেখানো হবে।</p></div>`;
  renderSidebar(visible);
}
async function loadArticles() {
  const feed = document.querySelector<HTMLElement>('#story-feed');
  const articleSlug = document.querySelector<HTMLElement>('[data-article-root]')?.dataset.articleSlug;
  const publicProfile = location.pathname.split('/').filter(Boolean);
  const categorySlug = document.querySelector<HTMLElement>('[data-category-slug]')?.dataset.categorySlug;
  if (!supabase || demoMode) return;
  const select = 'id,slug,title,excerpt,body,published_at,created_at,status,author_id,hero_media_key,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)';
  let query = supabase.from('articles').select(select).eq('status', 'published').order('published_at', { ascending: false }).limit(40);
  if (articleSlug) query = supabase.from('articles').select(select).eq('status', 'published').eq('slug', articleSlug).limit(1);
  if (categorySlug) query = supabase.from('articles').select(select).eq('status', 'published').eq('category.slug', categorySlug).order('published_at', { ascending: false }).limit(40);
  const result = await query;
  if (result.error) { console.warn('Published articles are not available yet', result.error.message); if (feed && !currentArticles.length) feed.innerHTML = '<div class="feed-empty"><span class="feed-empty__icon">!</span><strong>সংবাদ আর্কাইভ আপাতত পাওয়া যাচ্ছে না</strong><p>ডেটাবেজ সংযোগ যাচাই করে আবার চেষ্টা করুন।</p></div>'; return; }
  currentArticles = (result.data ?? []) as unknown as Article[];
  if (articleSlug) { if (currentArticles[0]) await renderArticlePage(currentArticles[0]); else renderNotFound(); return; }
  if (feed || categorySlug) renderCurrentFeed();
  if (publicProfile[0] === 'u' && publicProfile[1]) await loadPublicProfile();
}
function renderNotFound() { const root = document.querySelector<HTMLElement>('[data-article-root]'); if (root) root.innerHTML = '<div class="article-not-found"><div class="feed-empty__icon">⌕</div><h1>প্রতিবেদনটি পাওয়া যায়নি</h1><p>লিংকটি ভুল হতে পারে বা প্রতিবেদনটি প্রকাশিত নেই।</p><a class="read-button" href="/"><span>মূলপাতায় ফিরুন</span><span>→</span></a></div>'; }
async function mediaUrlFor(key: string) { return config.mediaUrl ? `${config.mediaUrl.replace(/\/$/, '')}/media/${encodeURIComponent(key)}` : ''; }
async function renderArticlePage(article: Article) {
  const root = document.querySelector<HTMLElement>('[data-article-root]'); if (!root || !supabase) return;
  const category = categoryInfo(article); const author = authorInfo(article);
  const body = article.body.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`).join('');
  const hero = article.hero_media_key ? `<figure class="article-hero-art"><img src="${attr(await mediaUrlFor(article.hero_media_key))}" alt="" loading="eager"></figure>` : `<div class="article-hero-art"><span class="story-art__visual ${storyImageClass(category.slug)}"><span class="story-art__halo"></span><span class="story-art__seal">ঢা<br><i>বি</i></span></span></div>`;
  root.innerHTML = `<nav class="article-breadcrumbs" aria-label="অবস্থান"><a href="/">মূলপাতা</a><span>›</span><a href="/category/${attr(category.slug)}/">${escapeHtml(category.title_bn)}</a></nav><header class="article-header"><div class="story-meta"><a href="/category/${attr(category.slug)}/">${escapeHtml(category.title_bn)}</a><span>·</span><time datetime="${attr(article.published_at)}">${escapeHtml(timestamp(article.published_at))}</time></div><h1>${escapeHtml(article.title)}</h1><p class="article-excerpt">${escapeHtml(article.excerpt)}</p><div class="article-author-row"><span class="article-author-avatar">ঢা</span><div class="article-author-info"><a href="/u/${encodeURIComponent(author.username)}/"><strong>${escapeHtml(publicName(author))}</strong></a><time datetime="${attr(article.published_at)}">প্রকাশিত ${escapeHtml(timestamp(article.published_at))}</time></div></div></header>${hero}<article class="article-body">${body}</article><div class="article-actions"><div class="article-actions__group"><button class="action-pill" type="button" data-reaction-button><svg viewBox="0 0 24 24"><path d="M20.8 8.9c0 5.1-8.8 11.1-8.8 11.1S3.2 14 3.2 8.9a4.3 4.3 0 0 1 8.1-2 4.3 4.3 0 0 1 9.5 2Z"/></svg><span data-reaction-count>০</span><span>ভালো লেগেছে</span></button><button class="action-pill" type="button" data-bookmark-button><svg viewBox="0 0 24 24"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.8L6 21z"/></svg><span data-bookmark-label>সংরক্ষণ</span></button></div><div class="article-actions__group"><button class="action-pill" type="button" data-share-button>শেয়ার করুন ↗</button><a class="action-pill" href="mailto:corrections@dutimz.com?subject=${encodeURIComponent(`সংশোধন: ${article.title}`)}">সংশোধন জানান</a></div></div><section class="comments-section"><div class="feed-heading"><div><span class="section-kicker">পাঠকের আলোচনা</span><h2>মন্তব্য</h2></div><span data-comment-total>০টি</span></div><form class="comment-form" data-comment-form><label class="sr-only" for="comment-body">আপনার মন্তব্য</label><textarea id="comment-body" name="body" maxlength="2000" placeholder="শ্রদ্ধাশীল ভাষায় আপনার মতামত লিখুন…" required></textarea><button class="read-button" type="submit"><span>মন্তব্য করুন</span><span>→</span></button></form><p class="form-error" role="alert" data-comment-error hidden></p><div class="comment-list" data-comment-list></div></section>`;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]'); if (metaDescription) metaDescription.content = article.excerpt;
  const title = document.querySelector<HTMLTitleElement>('title'); if (title) title.textContent = `${article.title} | ডুটিমজ`;
  await initArticleActions(article); await loadComments(article.id);
}
function requireLogin() { sessionStorage.setItem('dutimz-after-auth', `${location.pathname}${location.search}`); toast(strings.login, true); window.setTimeout(() => window.location.assign('/auth/sign-in/'), 550); }
async function initArticleActions(article: Article) {
  if (!supabase) return;
  const [statsResult, reactionsResult] = await Promise.all([supabase.rpc('get_article_stats', { p_article_id: article.id }), authUser ? supabase.from('reactions').select('reaction').eq('article_id', article.id).eq('user_id', authUser.id) : Promise.resolve({ data: [], error: null })]);
  const stats = statsResult.data as { likes?: number; comments?: number } | null; const count = document.querySelector<HTMLElement>('[data-reaction-count]'); if (count) count.textContent = digits.format(Number(stats?.likes ?? 0));
  let reacted = Boolean(reactionsResult.data?.length);
  const reaction = document.querySelector<HTMLButtonElement>('[data-reaction-button]'); if (reaction) {
    reaction.classList.toggle('is-active', reacted);
    reaction.addEventListener('click', async () => { if (!authUser) return requireLogin(); reaction.disabled = true; const result = reacted ? await supabase!.from('reactions').delete().eq('article_id', article.id).eq('user_id', authUser!.id).eq('reaction', 'like') : await supabase!.from('reactions').insert({ article_id: article.id, user_id: authUser.id, reaction: 'like' }); reaction.disabled = false; if (result.error) return toast(result.error.message, true); reacted = !reacted; reaction.classList.toggle('is-active', reacted); if (count) count.textContent = digits.format(Math.max(0, Number(stats?.likes ?? 0) + (reacted ? 1 : -1))); });
  }
  let bookmarked = false;
  if (authUser) { const saved = await supabase.from('bookmarks').select('article_id').eq('article_id', article.id).eq('user_id', authUser.id).maybeSingle(); bookmarked = Boolean(saved.data); }
  const save = document.querySelector<HTMLButtonElement>('[data-bookmark-button]'); const saveLabel = document.querySelector<HTMLElement>('[data-bookmark-label]');
  if (saveLabel) saveLabel.textContent = bookmarked ? 'সংরক্ষিত' : 'সংরক্ষণ'; save?.classList.toggle('is-active', bookmarked);
  save?.addEventListener('click', async () => { if (!authUser) return requireLogin(); const result = bookmarked ? await supabase!.from('bookmarks').delete().eq('article_id', article.id).eq('user_id', authUser!.id) : await supabase!.from('bookmarks').insert({ article_id: article.id, user_id: authUser.id }); if (result.error) return toast(result.error.message, true); bookmarked = !bookmarked; if (saveLabel) saveLabel.textContent = bookmarked ? 'সংরক্ষিত' : 'সংরক্ষণ'; save?.classList.toggle('is-active', bookmarked); toast(bookmarked ? 'প্রতিবেদনটি সংরক্ষণ করা হয়েছে।' : 'সংরক্ষিত তালিকা থেকে সরানো হয়েছে।'); });
  document.querySelector<HTMLElement>('[data-share-button]')?.addEventListener('click', async () => { if (navigator.share) { try { await navigator.share({ title: article.title, url: location.href }); } catch {} } else { await navigator.clipboard?.writeText(location.href); toast('প্রতিবেদনের লিংক কপি করা হয়েছে।'); } });
  const form = document.querySelector<HTMLFormElement>('[data-comment-form]');
  form?.addEventListener('submit', async (event) => { event.preventDefault(); if (!authUser) return requireLogin(); const error = document.querySelector<HTMLElement>('[data-comment-error]'); const body = String(new FormData(form).get('body') ?? '').trim(); const button = form.querySelector<HTMLButtonElement>('button[type="submit"]'); if (button) button.disabled = true; const result = await supabase!.from('comments').insert({ article_id: article.id, author_id: authUser.id, body }); if (button) button.disabled = false; if (result.error) return setMessage(error, result.error.message); form.reset(); setMessage(error, '', false); toast('আপনার মন্তব্য প্রকাশ করা হয়েছে।'); await loadComments(article.id); });
}
async function loadComments(articleId: string) {
  if (!supabase) return;
  const result = await supabase.from('comments').select('id,body,created_at,profiles:profiles!comments_author_id_fkey(username,display_name)').eq('article_id', articleId).eq('status', 'visible').order('created_at', { ascending: false }).limit(100);
  const list = document.querySelector<HTMLElement>('[data-comment-list]'); if (!list) return;
  if (result.error) { list.innerHTML = '<p class="form-error">মন্তব্যগুলো এখন লোড করা যাচ্ছে না।</p>'; return; }
  const comments = result.data ?? []; const total = document.querySelector<HTMLElement>('[data-comment-total]'); if (total) total.textContent = `${digits.format(comments.length)}টি`;
  list.innerHTML = comments.length ? comments.map((comment) => { const author = single(comment.profiles) ?? { username: 'reader', display_name: 'পাঠক' }; return `<article class="comment-card"><div class="comment-card__meta"><strong><a href="/u/${encodeURIComponent(author.username)}/">${escapeHtml(publicName(author))}</a></strong><span>·</span><time>${escapeHtml(relativeTime(comment.created_at))}</time></div><p>${escapeHtml(comment.body)}</p></article>`; }).join('') : '<div class="feed-empty"><span class="feed-empty__icon">✦</span><strong>আলোচনা শুরু করুন</strong><p>শ্রদ্ধাশীল ভাষায় প্রথম মন্তব্যটি লিখুন।</p></div>';
}
async function loadWalletHistory(userId: string) {
  if (!supabase || !document.querySelector('[data-ledger-list]')) return;
  const result = await supabase.from('earnings_ledger').select('id,amount_tk,entry_type,reason,created_at,articles(title),withdrawals(method,status)').eq('user_id', userId).order('created_at', { ascending: false }).limit(60);
  const container = document.querySelector<HTMLElement>('[data-ledger-list]'); if (!container) return;
  if (result.error) { container.innerHTML = `<p class="form-error">${escapeHtml(result.error.message)}</p>`; return; }
  const entries = result.data ?? []; if (!entries.length) return;
  container.innerHTML = entries.map((entry) => { const title = single(entry.articles as { title: string } | { title: string }[] | null)?.title; const withdrawal = single(entry.withdrawals as { method: string; status: string } | { method: string; status: string }[] | null); const label = title ?? (entry.entry_type === 'withdrawal_reserve' ? `উত্তোলন অনুরোধ — ${withdrawal?.method === 'nagad' ? 'নগদ' : 'বিকাশ'}` : entry.reason ?? 'অ্যাকাউন্ট লেনদেন'); const amount = Number(entry.amount_tk); return `<article class="ledger-entry"><span class="ledger-entry__icon">${amount >= 0 ? '↗' : '↙'}</span><div class="ledger-entry__content"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(entry.reason ?? '')} · ${escapeHtml(timestamp(entry.created_at))}</span></div><span class="ledger-entry__amount${amount < 0 ? ' is-negative' : ''}">${amount > 0 ? '+' : ''}${money(amount)}</span></article>`; }).join('');
}
async function loadSavedStories(userId: string) {
  const list = document.querySelector<HTMLElement>('[data-saved-list]'); if (!list || !supabase) return;
  const empty = document.querySelector<HTMLElement>('[data-saved-empty]');
  const result = await supabase.from('bookmarks').select('articles:articles!bookmarks_article_id_fkey(id,slug,title,excerpt,body,published_at,created_at,status,author_id,hero_media_key,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url))').eq('user_id', userId).order('created_at', { ascending: false }).limit(60);
  const articles = (result.data ?? []).map((item) => single(item.articles as Article | Article[] | null)).filter((item): item is Article => item !== null && item.status === 'published');
  if (result.error) { if (empty) { empty.hidden = false; empty.innerHTML = `<strong>সংরক্ষিত প্রতিবেদন লোড করা যায়নি</strong><p>${escapeHtml(result.error.message)}</p>`; } return; }
  list.innerHTML = articles.map((article) => renderStoryCard(article)).join(''); if (empty) empty.hidden = articles.length > 0;
}
async function loadPublicProfile() {
  const path = location.pathname.split('/').filter(Boolean); if (path[0] !== 'u' || !path[1] || !supabase) return;
  const username = decodeURIComponent(path[1]); const result = await supabase.from('profiles').select('id,username,display_name,bio,avatar_url').eq('username', username).maybeSingle();
  const name = document.querySelector<HTMLElement>('[data-public-name]'); const bio = document.querySelector<HTMLElement>('[data-public-bio]'); const handle = document.querySelector<HTMLElement>('[data-public-handle]'); const list = document.querySelector<HTMLElement>('[data-public-stories]');
  if (result.error || !result.data) { if (name) name.textContent = 'এই প্রোফাইলটি পাওয়া যায়নি'; if (bio) bio.textContent = 'ইউজারনেমটি পরীক্ষা করে আবার চেষ্টা করুন।'; return; }
  const profile = result.data as Profile; document.title = `${publicName(profile)} | ডুটিমজ`; if (name) name.textContent = publicName(profile); if (bio) bio.textContent = profile.bio || 'ঢাকা বিশ্ববিদ্যালয়ের পাঠক ও লেখক।'; if (handle) handle.textContent = `@${profile.username}`;
  const stories = await supabase.from('articles').select('id,slug,title,excerpt,body,published_at,created_at,status,author_id,hero_media_key,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)').eq('author_id', profile.id).eq('status', 'published').order('published_at', { ascending: false }).limit(30);
  if (list) list.innerHTML = (stories.data as unknown as Article[] ?? []).map((article) => renderStoryCard(article)).join('') || '<div class="feed-empty"><strong>এখনো প্রকাশিত প্রতিবেদন নেই</strong></div>';
}

async function maybeOpenProfilePrompt() {
  if (!authUser || !supabase || demoMode || profilePromptShown || profileCompletion >= 70) return;
  if (sessionStorage.getItem(`dutimz-profile-prompt:${authUser.id}`) === 'shown') return;
  const result = await supabase.from('profile_details').select('*').eq('user_id', authUser.id).maybeSingle();
  if (result.error) return;
  const details = result.data as Record<string, unknown> | null;
  const form = document.querySelector<HTMLFormElement>('[data-profile-form]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-profile-modal]');
  if (!form || !dialog) return;
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) continue;
    if (element.name === 'display_name') element.value = authProfile?.display_name ?? '';
    else if (details && element.name in details) element.value = String(details[element.name] ?? '');
    if (element.type === 'checkbox' && details) element.checked = Boolean(details[element.name]);
  }
  const residency = form.elements.namedItem('residency_status') as HTMLSelectElement | null;
  const hallField = form.elements.namedItem('hall_name') as HTMLInputElement | null;
  const hallLabel = document.querySelector<HTMLElement>('[data-hall-field]');
  if (hallLabel) hallLabel.hidden = residency?.value === 'off_campus';
  if (hallField) hallField.required = false;
  const whatsapp = form.elements.namedItem('whatsapp_number') as HTMLInputElement | null;
  if (whatsapp) whatsapp.required = false;
  dialog.showModal();
  sessionStorage.setItem(`dutimz-profile-prompt:${authUser.id}`, 'shown');
  profilePromptShown = true;
}
function initProfileForm() {
  const form = document.querySelector<HTMLFormElement>('[data-profile-form]');
  const dialog = document.querySelector<HTMLDialogElement>('[data-profile-modal]');
  const close = () => { if (dialog?.open) dialog.close(); };
  document.querySelectorAll<HTMLElement>('[data-close-profile]').forEach((button) => button.addEventListener('click', close));
  document.querySelectorAll<HTMLElement>('[data-open-profile]').forEach((button) => button.addEventListener('click', () => dialog?.showModal()));
  dialog?.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  (form?.elements.namedItem('residency_status') as HTMLSelectElement | null)?.addEventListener('change', (event) => {
    const choice = (event.currentTarget as HTMLSelectElement).value;
    const hall = document.querySelector<HTMLElement>('[data-hall-field]');
    if (hall) hall.hidden = choice === 'off_campus';
    const input = form?.elements.namedItem('hall_name') as HTMLInputElement | null;
    if (input) input.required = false;
  });
  (form?.elements.namedItem('whatsapp_na') as HTMLInputElement | null)?.addEventListener('change', (event) => {
    const check = event.currentTarget as HTMLInputElement;
    const phone = form?.elements.namedItem('whatsapp_number') as HTMLInputElement | null;
    if (phone && check.checked) phone.value = '';
  });
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorNode = document.querySelector<HTMLElement>('[data-profile-error]');
    if (!authUser || !supabase) { setMessage(errorNode, strings.login); return; }
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    setMessage(errorNode, '');
    const fields = formDataObject(form);
    const displayName = String(fields.display_name ?? '').trim();
    if (displayName) {
      const profile = await supabase.from('profiles').update({ display_name: displayName }).eq('id', authUser.id);
      if (profile.error) { setMessage(errorNode, profile.error.message); if (submit) submit.disabled = false; return; }
    }
    const residencyStatus = String(fields.residency_status ?? '');
    const payload = {
      department: String(fields.department ?? '').trim() || null,
      session: String(fields.session ?? '').trim() || null,
      du_registration_number: String(fields.du_registration_number ?? '').trim() || null,
      residency_status: residencyStatus || null,
      hall_name: residencyStatus === 'hall_resident' ? String(fields.hall_name ?? '').trim() || null : null,
      whatsapp_number: Boolean(fields.whatsapp_na) ? null : String(fields.whatsapp_number ?? '').trim() || null,
      whatsapp_na: Boolean(fields.whatsapp_na),
      payout_method: String(fields.payout_method ?? '') || null,
      payout_number: String(fields.payout_number ?? '').trim() || null,
    };
    const saved = await supabase.from('profile_details').upsert({ user_id: authUser.id, ...payload }, { onConflict: 'user_id' });
    if (submit) submit.disabled = false;
    if (saved.error) { setMessage(errorNode, saved.error.message); return; }
    close();
    profilePromptShown = false;
    toast(strings.done);
    await loadIdentity(authUser);
  });
}
function initAccountMenu() {
  const button = menuButton();
  button?.addEventListener('click', () => setMenuOpen(button.getAttribute('aria-expanded') !== 'true'));
  document.querySelectorAll<HTMLElement>('[data-open-account]').forEach((control) => control.addEventListener('click', () => {
    if (authUser) setMenuOpen(true); else window.location.assign('/auth/sign-in/');
  }));
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node) || !document.querySelector('[data-account-menu]')?.contains(event.target)) setMenuOpen(false);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenuOpen(false); });
  document.querySelector<HTMLButtonElement>('[data-sign-out]')?.addEventListener('click', async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) toast(error.message, true); else window.location.assign('/');
  });
}
function initProfileEditor() {
  const button = document.querySelector<HTMLButtonElement>('[data-save-profile-page]');
  if (!button) return;
  button.addEventListener('click', async () => {
    const error = document.querySelector<HTMLElement>('[data-profile-page-error]');
    if (!authUser || !supabase) return requireLogin();
    const value = (name: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-profile-field="${name}"]`)?.value.trim() ?? '';
    const username = value('username');
    if (!/^[a-zA-Z][a-zA-Z0-9_]{2,23}$/.test(username)) return setMessage(error, 'ইউজারনেম ৩–২৪ অক্ষরের ইংরেজি অক্ষর, সংখ্যা বা আন্ডারস্কোর দিয়ে লিখুন।');
    button.disabled = true;
    const result = await supabase.from('profiles').update({ username, display_name: value('display_name'), bio: value('bio') }).eq('id', authUser.id);
    if (result.error) { button.disabled = false; return setMessage(error, result.error.code === '23505' ? 'এই ইউজারনেম অন্য কেউ ব্যবহার করছেন। আরেকটি বেছে নিন।' : result.error.message); }
    const details = await supabase.from('profile_details').upsert({ user_id: authUser.id, department: value('department') || null, session: value('session') || null }, { onConflict: 'user_id' });
    button.disabled = false;
    if (details.error) return setMessage(error, details.error.message);
    authProfile = { ...authProfile!, username, display_name: value('display_name'), bio: value('bio') };
    const link = document.querySelector<HTMLAnchorElement>('[data-profile-public-link]');
    if (link) link.href = `/u/${encodeURIComponent(username)}/`;
    paintAuthState(); toast('আপনার প্রোফাইল হালনাগাদ হয়েছে।'); setMessage(error, '', false);
    await loadIdentity(authUser);
  });
}
function initWithdrawals() {
  const form = document.querySelector<HTMLFormElement>('[data-withdrawal-form]');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector<HTMLElement>('[data-withdrawal-error]');
    if (!authUser || !supabase) return requireLogin();
    const values = formDataObject(form);
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    const result = await supabase.rpc('request_withdrawal', { p_amount_tk: Number(values.amount_tk), p_method: values.method, p_payout_number: String(values.payout_number).trim() });
    if (button) button.disabled = false;
    if (result.error) return setMessage(error, result.error.message);
    toast('আপনার উত্তোলনের অনুরোধ জমা ও সংরক্ষিত হয়েছে।'); form.reset(); setMessage(error, '', false); await loadIdentity(authUser);
  });
}
async function uploadEditorMedia(file: File) {
  if (!authUser || !supabase) throw new Error('ফাইল পাঠাতে আগে গুগল দিয়ে প্রবেশ করুন।');
  if (!config.mediaUrl) throw new Error('মিডিয়া সার্ভারের ঠিকানা সেট করা নেই।');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('আপনার প্রবেশ সেশন শেষ হয়েছে; আবার প্রবেশ করুন।');
  const response = await fetch(`${config.mediaUrl.replace(/\/$/, '')}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  const payload = await response.json() as { id?: string; error?: string };
  if (!response.ok || !payload.id) throw new Error(payload.error || 'ফাইল পাঠানো যায়নি।');
  return payload.id;
}
function initArticleEditor() {
  const form = document.querySelector<HTMLFormElement>('[data-article-form]');
  if (!form) return;
  const slug = form.elements.namedItem('slug') as HTMLInputElement | null;
  const title = form.elements.namedItem('title') as HTMLInputElement | null;
  const upload = form.elements.namedItem('hero_image') as HTMLInputElement | null;
  const status = document.querySelector<HTMLElement>('[data-editor-status]');
  let mediaId: string | null = null;
  title?.addEventListener('input', () => {
    if (!slug || slug.dataset.edited === 'true') return;
    const generated = title.value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110);
    if (generated) slug.value = generated;
  });
  slug?.addEventListener('input', () => { if (slug) slug.dataset.edited = 'true'; });
  upload?.addEventListener('change', async () => {
    const file = upload.files?.[0]; if (!file) { mediaId = null; return; }
    if (!file.type.startsWith('image/')) { upload.value = ''; toast('প্রচ্ছদের জন্য JPEG, PNG, WebP, GIF অথবা AVIF ছবি দিন।', true); return; }
    upload.disabled = true; if (status) status.textContent = 'ছবি নিরাপদে আপলোড হচ্ছে…';
    try { mediaId = await uploadEditorMedia(file); if (status) status.textContent = 'ছবি সংরক্ষিত। এখন প্রতিবেদন জমা দিন।'; }
    catch (error) { mediaId = null; upload.value = ''; if (status) status.textContent = 'ছবি আপলোড হয়নি।'; toast(error instanceof Error ? error.message : 'ছবি আপলোড হয়নি।', true); }
    finally { upload.disabled = false; }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const error = document.querySelector<HTMLElement>('[data-article-error]');
    if (!authUser || !supabase) return requireLogin();
    if (authRole === 'reader') return setMessage(error, 'রিপোর্টার অনুমতি ছাড়া প্রতিবেদন পাঠানো যাবে না।');
    if (upload?.files?.length && !mediaId) return setMessage(error, 'প্রচ্ছদের ছবি আপলোড সম্পন্ন হওয়া পর্যন্ত অপেক্ষা করুন।');
    const values = formDataObject(form);
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]'); if (button) button.disabled = true;
    const result = await supabase.rpc('submit_article', {
      p_category_slug: values.category_slug, p_slug: values.slug, p_title: values.title,
      p_excerpt: values.excerpt, p_body: values.body, p_hero_media_key: mediaId,
    });
    if (button) button.disabled = false;
    if (result.error) return setMessage(error, result.error.message);
    const state = document.querySelector<HTMLElement>('[data-writer-state]');
    if (state) { state.hidden = false; state.textContent = result.data?.status === 'pending' ? 'আপনার প্রতিবেদনটি অনুমোদনের অপেক্ষায় জমা হয়েছে।' : 'আপনার প্রতিবেদন প্রকাশিত হয়েছে।'; }
    form.reset(); mediaId = null; setMessage(error, '', false);
  });
}
function initRoleForms() {
  const application = document.querySelector<HTMLFormElement>('[data-application-form]');
  const section = document.querySelector<HTMLElement>('[data-application-section]');
  if (section) section.hidden = !authUser || authRole !== 'reader';
  if (application && application.dataset.bound !== 'true') {
    application.dataset.bound = 'true';
    application.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!authUser || !supabase) return requireLogin();
    const error = document.querySelector<HTMLElement>('[data-application-error]');
    const button = application.querySelector<HTMLButtonElement>('button[type="submit"]'); if (button) button.disabled = true;
    const result = await supabase.rpc('apply_reporter', { p_motivation: String(new FormData(application).get('motivation') ?? '').trim() });
    if (button) button.disabled = false;
    if (result.error) return setMessage(error, result.error.message);
    const currentSection = document.querySelector<HTMLElement>('[data-application-section]');
    if (currentSection) currentSection.innerHTML = '<div class="feed-empty"><strong>আপনার আবেদন সম্পাদকীয় দলের কাছে পৌঁছেছে।</strong><p>পর্যালোচনা হলে আপনাকে জানানো হবে।</p></div>';
    });
  }
  const roleForm = document.querySelector<HTMLFormElement>('[data-admin-role-form]');
  if (roleForm) roleForm.hidden = authRole !== 'admin';
  if (roleForm && roleForm.dataset.bound !== 'true') {
    roleForm.dataset.bound = 'true';
    roleForm.addEventListener('submit', async (event) => {
    event.preventDefault(); if (!supabase || !authUser || authRole !== 'admin') return;
    const error = document.querySelector<HTMLElement>('[data-admin-role-error]'); const values = formDataObject(roleForm);
    const result = await supabase.rpc('assign_user_role', { p_user_id: values.user_id, p_role: values.role, p_tier: values.role === 'reporter' || values.role === 'moderator' ? values.reporter_tier || null : null, p_reason: values.reason });
    if (result.error) return setMessage(error, result.error.message);
    toast('ব্যবহারকারীর ভূমিকা হালনাগাদ হয়েছে।'); setMessage(error, '', false); roleForm.reset();
    await reloadRole(); paintAuthState();
  });
  }
}
function initModeration() {
  const queue = document.querySelector<HTMLElement>('[data-moderation-queue]');
  if (!queue) return;
  if (!supabase || !authUser || (authRole !== 'moderator' && authRole !== 'admin')) {
    queue.innerHTML = `<div class="feed-empty"><strong>${authUser ? 'এই ডেস্ক ব্যবহারের অনুমতি নেই' : 'মডারেশন ডেস্ক দেখতে আগে প্রবেশ করুন'}</strong></div>`; return;
  }
  void (async () => {
    const result = await supabase!.from('articles').select('id,slug,title,excerpt,body,created_at,author_id,profiles:profiles!articles_author_id_fkey(username,display_name)')
      .eq('status', 'pending').order('created_at', { ascending: true }).limit(60);
    if (result.error) { queue.innerHTML = `<p class="form-error">${escapeHtml(result.error.message)}</p>`; return; }
    const articles = result.data ?? [];
    if (!articles.length) { queue.innerHTML = '<div class="feed-empty"><span class="feed-empty__icon">✓</span><strong>সব প্রতিবেদন পর্যালোচিত</strong><p>নতুন অপেক্ষমাণ প্রতিবেদন এলে এখানে দেখা যাবে।</p></div>'; return; }
    queue.innerHTML = articles.map((article) => {
      const author = single(article.profiles) ?? { username: '', display_name: 'পাঠক' };
      const canEdit = authRole === 'admin';
      return `<article class="moderation-card" data-pending-id="${attr(article.id)}" data-original-title="${attr(article.title)}" data-original-excerpt="${attr(article.excerpt)}" data-original-body="${attr(article.body)}">
        <div class="moderation-card__top"><span class="story-meta"><a href="/u/${encodeURIComponent(author.username)}/">${escapeHtml(publicName(author))}</a> · ${escapeHtml(timestamp(article.created_at))}</span><span class="section-kicker">অপেক্ষমাণ প্রতিবেদন</span></div>
        <h2>${escapeHtml(article.title)}</h2><p>${escapeHtml(article.excerpt)}</p><details><summary>পূর্ণ প্রতিবেদন পড়ুন</summary><div class="moderation-preview">${escapeHtml(article.body)}</div></details>
        ${canEdit ? `<button class="outline-button" type="button" data-edit-pending>প্রতিবেদন সম্পাদনা</button>` : ''}
        <form data-moderation-form><label class="field-label">সিদ্ধান্তের কারণ<textarea name="reason" rows="2" minlength="3" maxlength="500" required></textarea></label><button type="button" data-action="approve">অনুমোদন ও প্রকাশ</button><button type="button" data-action="reject">প্রত্যাখ্যান</button></form>
      </article>`;
    }).join('');
    queue.querySelectorAll<HTMLButtonElement>('[data-edit-pending]').forEach((button) => button.addEventListener('click', async () => {
      const card = button.closest<HTMLElement>('[data-pending-id]'); if (!card || !supabase) return;
      const reason = window.prompt('প্রতিবেদন সম্পাদনার কারণ লিখুন (অন্তত ৩ অক্ষর)');
      if (!reason || reason.trim().length < 3) return toast('সম্পাদনার কারণ লিখুন।', true);
      const title = window.prompt('প্রতিবেদনের শিরোনাম', card.dataset.originalTitle ?? ''); if (title === null) return;
      const excerpt = window.prompt('সংক্ষিপ্ত পরিচিতি', card.dataset.originalExcerpt ?? ''); if (excerpt === null) return;
      const body = window.prompt('পূর্ণ প্রতিবেদন', card.dataset.originalBody ?? ''); if (body === null) return;
      button.disabled = true;
      const result = await supabase.rpc('admin_update_article', { p_article_id: card.dataset.pendingId, p_title: title, p_excerpt: excerpt, p_body: body, p_reason: reason.trim() });
      button.disabled = false;
      if (result.error) return toast(result.error.message, true);
      toast('প্রতিবেদন সম্পাদনা করে নতুন সংস্করণ সংরক্ষণ হয়েছে।');
      initModeration();
    }));
    queue.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', async () => {
      const card = button.closest<HTMLElement>('[data-pending-id]'); const form = button.closest<HTMLFormElement>('form');
      const reason = String(new FormData(form!).get('reason') ?? '').trim();
      if (reason.length < 3) return toast(strings.required, true);
      button.disabled = true;
      const result = await supabase!.rpc('moderate_article', { p_article_id: card!.dataset.pendingId, p_decision: button.dataset.action === 'approve' ? 'approve' : 'reject', p_reason: reason });
      if (result.error) { button.disabled = false; return toast(result.error.message, true); }
      card?.remove(); toast(button.dataset.action === 'approve' ? 'প্রতিবেদন অনুমোদিত ও প্রকাশিত হয়েছে।' : 'প্রতিবেদন প্রত্যাখ্যান করা হয়েছে।');
      if (!queue.querySelector('[data-pending-id]')) queue.innerHTML = '<div class="feed-empty"><strong>সব প্রতিবেদন পর্যালোচিত</strong></div>';
    }));
  })();
}
function initAdminWorkflows() {
  const withdrawals = document.querySelector<HTMLElement>('[data-admin-withdrawals]');
  if (withdrawals) {
    if (!supabase || !authUser || authRole !== 'admin') withdrawals.innerHTML = '<div class="feed-empty"><strong>এই তালিকা কেবল প্রশাসক দেখতে পারেন।</strong></div>';
    else void supabase.from('withdrawals').select('id,user_id,amount_tk,method,payout_number_snapshot,created_at,profiles:profiles!withdrawals_user_id_fkey(username,display_name)').eq('status', 'pending').order('created_at', { ascending: true }).limit(60).then(({ data, error }) => {
      if (error) { withdrawals.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; return; }
      if (!data?.length) { withdrawals.innerHTML = '<div class="feed-empty"><strong>অপেক্ষমাণ উত্তোলন নেই।</strong></div>'; return; }
      withdrawals.innerHTML = data.map((item) => {
        const owner = single(item.profiles); const method = item.method === 'nagad' ? 'নগদ' : 'বিকাশ';
        return `<article class="history-entry" data-withdrawal-id="${attr(item.id)}"><strong>${escapeHtml(publicName(owner))} · ${money(Number(item.amount_tk))}</strong><p>${method} ${escapeHtml(item.payout_number_snapshot)} · ${escapeHtml(timestamp(item.created_at))}</p><form data-review-withdrawal><label class="field-label">পর্যালোচনার কারণ<textarea name="reason" minlength="3" maxlength="500" required></textarea></label><button class="outline-button" type="button" data-withdrawal-decision="paid">পেমেন্ট সম্পন্ন</button><button class="outline-button" type="button" data-withdrawal-decision="rejected">প্রত্যাখ্যান ও টাকা ফেরত</button></form></article>`;
      }).join('');
      withdrawals.querySelectorAll<HTMLButtonElement>('[data-withdrawal-decision]').forEach((button) => button.addEventListener('click', async () => {
        const card = button.closest<HTMLElement>('[data-withdrawal-id]'); const form = button.closest<HTMLFormElement>('form'); const reason = String(new FormData(form!).get('reason') ?? '').trim();
        if (reason.length < 3) return toast(strings.required, true);
        button.disabled = true; const result = await supabase!.rpc('review_withdrawal', { p_withdrawal_id: card!.dataset.withdrawalId, p_decision: button.dataset.withdrawalDecision, p_reason: reason });
        if (result.error) { button.disabled = false; return toast(result.error.message, true); }
        card?.remove(); toast(button.dataset.withdrawalDecision === 'paid' ? 'পেমেন্ট সম্পন্ন হিসেবে নথিভুক্ত হয়েছে।' : 'অনুরোধ প্রত্যাখ্যাত; অর্থ ফেরত দেওয়া হয়েছে।');
      }));
    });
  }
  const applications = document.querySelector<HTMLElement>('[data-admin-applications]');
  if (applications) {
    if (!supabase || !authUser || authRole !== 'admin') applications.innerHTML = '<div class="feed-empty"><strong>এই তালিকা কেবল প্রশাসক দেখতে পারেন।</strong></div>';
    else void supabase.from('reporter_applications').select('id,applicant_id,motivation,created_at,profiles:profiles!reporter_applications_applicant_id_fkey(username,display_name)').eq('status', 'pending').order('created_at', { ascending: true }).limit(60).then(({ data, error }) => {
      if (error) { applications.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; return; }
      if (!data?.length) { applications.innerHTML = '<div class="feed-empty"><strong>অপেক্ষমাণ আবেদন নেই।</strong></div>'; return; }
      applications.innerHTML = data.map((item) => { const applicant = single(item.profiles); return `<article class="history-entry" data-application-id="${attr(item.id)}"><strong>${escapeHtml(publicName(applicant))}</strong><p>${escapeHtml(item.motivation)}</p><form data-review-application><label class="field-label">রিপোর্টার স্তর<select name="tier" required><option value="">নির্বাচন করুন</option><option value="junior">জুনিয়র — ৳৯০</option><option value="general">জেনারেল — ৳১১৫</option><option value="executive">এক্সিকিউটিভ — ৳১৪০</option></select></label><label class="field-label">সিদ্ধান্তের কারণ<textarea name="reason" minlength="3" maxlength="500" required></textarea></label><button class="outline-button" type="button" data-application-decision="approve">অনুমোদন</button><button class="outline-button" type="button" data-application-decision="reject">প্রত্যাখ্যান</button></form></article>`; }).join('');
      applications.querySelectorAll<HTMLButtonElement>('[data-application-decision]').forEach((button) => button.addEventListener('click', async () => {
        const card = button.closest<HTMLElement>('[data-application-id]'); const form = button.closest<HTMLFormElement>('form'); const fields = new FormData(form!); const reason = String(fields.get('reason') ?? '').trim();
        if (reason.length < 3 || (button.dataset.applicationDecision === 'approve' && !fields.get('tier'))) return toast('নির্বাচিত স্তর ও সিদ্ধান্তের কারণ লিখুন।', true);
        button.disabled = true; const result = await supabase!.rpc('review_reporter_application', { p_application_id: card!.dataset.applicationId, p_decision: button.dataset.applicationDecision, p_tier: fields.get('tier') || null, p_reason: reason });
        if (result.error) { button.disabled = false; return toast(result.error.message, true); }
        card?.remove(); toast(button.dataset.applicationDecision === 'approve' ? 'রিপোর্টার আবেদন অনুমোদিত হয়েছে।' : 'রিপোর্টার আবেদন প্রত্যাখ্যাত হয়েছে।');
      }));
    });
  }
  const managedArticles = document.querySelector<HTMLElement>('[data-admin-articles]');
  if (managedArticles) {
    if (!supabase || !authUser || authRole !== 'admin') managedArticles.innerHTML = '<div class="feed-empty"><strong>এই তালিকা কেবল প্রশাসক দেখতে পারেন।</strong></div>';
    else void supabase.from('articles').select('id,slug,title,excerpt,body,published_at,created_at,author_id,profiles:profiles!articles_author_id_fkey(username,display_name)').eq('status', 'published').order('published_at', { ascending: false }).limit(30).then(({ data, error }) => {
      if (error) { managedArticles.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; return; }
      if (!data?.length) { managedArticles.innerHTML = '<div class="feed-empty"><strong>এখনো প্রকাশিত প্রতিবেদন নেই।</strong></div>'; return; }
      managedArticles.innerHTML = data.map((article) => `<article class="history-entry" data-admin-article="${attr(article.id)}" data-article-title="${attr(article.title)}" data-article-excerpt="${attr(article.excerpt)}" data-article-body="${attr(article.body)}"><strong>${escapeHtml(article.title)}</strong><p>${escapeHtml(publicName(single(article.profiles)))} · ${escapeHtml(timestamp(article.published_at))}</p><button class="outline-button" type="button" data-admin-edit-article>প্রতিবেদন সম্পাদনা</button> <a class="text-link" href="/news/${encodeURIComponent(article.slug)}/">প্রতিবেদন দেখুন ↗</a></article>`).join('');
      managedArticles.querySelectorAll<HTMLButtonElement>('[data-admin-edit-article]').forEach((button) => button.addEventListener('click', async () => {
        const card = button.closest<HTMLElement>('[data-admin-article]'); if (!card || !supabase) return;
        const reason = window.prompt('সম্পাদনার কারণ লিখুন (অন্তত ৩ অক্ষর)'); if (!reason || reason.trim().length < 3) return toast('সম্পাদনার কারণ লিখুন।', true);
        const title = window.prompt('প্রতিবেদনের শিরোনাম', card.dataset.articleTitle ?? ''); if (title === null) return;
        const excerpt = window.prompt('সংক্ষিপ্ত পরিচিতি', card.dataset.articleExcerpt ?? ''); if (excerpt === null) return;
        const body = window.prompt('পূর্ণ প্রতিবেদন', card.dataset.articleBody ?? ''); if (body === null) return;
        button.disabled = true;
        const saved = await supabase.rpc('admin_update_article', { p_article_id: card.dataset.adminArticle, p_title: title, p_excerpt: excerpt, p_body: body, p_reason: reason.trim() });
        button.disabled = false;
        if (saved.error) return toast(saved.error.message, true);
        toast('প্রতিবেদন সম্পাদনা ও সংস্করণ ইতিহাসে সংরক্ষণ হয়েছে।'); initAdminWorkflows();
      }));
    });
  }
  const balanceForm = document.querySelector<HTMLFormElement>('[data-admin-balance-form]');
  if (balanceForm && balanceForm.dataset.bound !== 'true') {
    balanceForm.hidden = !authUser || authRole !== 'admin';
    balanceForm.dataset.bound = 'true';
    balanceForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const error = balanceForm.querySelector<HTMLElement>('[data-admin-balance-error]');
      if (!supabase || !authUser || authRole !== 'admin') return;
      const values = formDataObject(balanceForm); const button = balanceForm.querySelector<HTMLButtonElement>('button[type="submit"]'); if (button) button.disabled = true;
      const result = await supabase.rpc('admin_adjust_balance', { p_user_id: values.user_id, p_amount_tk: Number(values.amount_tk), p_reason: values.reason });
      if (button) button.disabled = false;
      if (result.error) return setMessage(error, result.error.message);
      toast('কারণসহ হিসাব সমন্বয় সংরক্ষিত হয়েছে।'); balanceForm.reset(); setMessage(error, '', false);
    });
  }
  const comments = document.querySelector<HTMLElement>('[data-admin-comments]');
  if (comments) {
    if (!supabase || !authUser || (authRole !== 'moderator' && authRole !== 'admin')) comments.innerHTML = '<div class="feed-empty"><strong>এই তালিকা সম্পাদকীয় দলের জন্য।</strong></div>';
    else void supabase.from('comments').select('id,article_id,author_id,body,status,created_at,profiles:profiles!comments_author_id_fkey(username,display_name),articles:articles!comments_article_id_fkey(title,slug)').in('status', ['visible', 'hidden']).order('created_at', { ascending: false }).limit(50).then(({ data, error }) => {
      if (error) { comments.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; return; }
      if (!data?.length) { comments.innerHTML = '<div class="feed-empty"><strong>সাম্প্রতিক মন্তব্য নেই।</strong></div>'; return; }
      comments.innerHTML = data.map((item) => { const author = single(item.profiles); const article = single(item.articles); return `<article class="history-entry" data-comment-id="${attr(item.id)}"><strong>${escapeHtml(publicName(author))} · ${escapeHtml(article?.title ?? 'প্রতিবেদন')}</strong><p>${escapeHtml(item.body)}</p><form data-moderate-comment><label class="field-label">সিদ্ধান্তের কারণ<textarea name="reason" minlength="3" maxlength="500" required></textarea></label>${item.status === 'visible' ? '<button class="outline-button" type="button" data-comment-decision="hide">লুকান</button><button class="outline-button" type="button" data-comment-decision="remove">অপসারণ</button>' : '<button class="outline-button" type="button" data-comment-decision="restore">পুনরুদ্ধার</button>'}</form></article>`; }).join('');
      comments.querySelectorAll<HTMLButtonElement>('[data-comment-decision]').forEach((button) => button.addEventListener('click', async () => {
        const card = button.closest<HTMLElement>('[data-comment-id]'); const form = button.closest<HTMLFormElement>('form'); const reason = String(new FormData(form!).get('reason') ?? '').trim();
        if (reason.length < 3) return toast(strings.required, true);
        button.disabled = true; const result = await supabase!.rpc('moderate_comment', { p_comment_id: card!.dataset.commentId, p_decision: button.dataset.commentDecision, p_reason: reason });
        if (result.error) { button.disabled = false; return toast(result.error.message, true); }
        card?.remove(); toast('মন্তব্যের অবস্থা হালনাগাদ ও কারণসহ নথিভুক্ত হয়েছে।');
      }));
    });
  }
}
function initAdminHistory() {
  const history = document.querySelector<HTMLElement>('[data-moderation-history]');
  if (!history || !supabase || !authUser || authRole !== 'admin') return;
  void supabase.from('moderation_actions').select('id,action,reason,details,created_at,profiles:profiles!moderation_actions_actor_id_fkey(username,display_name)').order('created_at', { ascending: false }).limit(60).then(({ data, error }) => {
    if (error) { history.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; return; }
    if (!data?.length) { history.innerHTML = '<div class="feed-empty"><strong>এখনো কোনো মডারেশন পদক্ষেপ নেই</strong></div>'; return; }
    const labels: Record<string, string> = { approve_article: 'প্রতিবেদন অনুমোদন', reject_article: 'প্রতিবেদন প্রত্যাখ্যান', assign_role: 'ব্যবহারকারীর ভূমিকা পরিবর্তন', review_application: 'রিপোর্টার আবেদন পর্যালোচনা', edit_article: 'প্রতিবেদন সম্পাদনা', hide_comment: 'মন্তব্য লুকানো', remove_comment: 'মন্তব্য অপসারণ', restore_comment: 'মন্তব্য পুনরুদ্ধার', review_withdrawal: 'উত্তোলন পর্যালোচনা', adjust_balance: 'হিসাব সমন্বয়' };
    history.innerHTML = data.map((entry) => `<article class="history-entry"><strong>${escapeHtml(labels[entry.action] ?? 'প্রশাসনিক পদক্ষেপ')} · ${escapeHtml(publicName(single(entry.profiles)))}</strong><p>কারণ: ${escapeHtml(entry.reason)}</p><time datetime="${attr(entry.created_at)}">${escapeHtml(timestamp(entry.created_at))}</time></article>`).join('');
  });
}
function initSearchPage() {
  const term = new URLSearchParams(location.search).get('q');
  if (!term && document.querySelector('[data-page-search-input]')) {
    const target = document.querySelector<HTMLElement>('#search-page-results');
    if (demoMode && target) target.innerHTML = currentArticles.map((article) => renderStoryCard(article)).join('');
    else if (supabase && target) void supabase.from('articles').select('id,slug,title,excerpt,body,published_at,created_at,status,author_id,hero_media_key,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)').eq('status', 'published').order('published_at', { ascending: false }).limit(30).then(({ data }) => { target.innerHTML = (data as unknown as Article[] ?? []).map((article) => renderStoryCard(article)).join(''); });
  }
}

async function loadOwnArticles() {
  const container = document.querySelector<HTMLElement>('[data-my-articles]');
  if (!container) return;
  if (!supabase || !authUser || !(authRole === 'admin' || (authRole === 'reporter' || authRole === 'moderator') && reporterTier === 'executive')) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const result = await supabase.from('articles').select('id,slug,title,excerpt,body,published_at')
    .eq('author_id', authUser.id).eq('status', 'published').order('published_at', { ascending: false }).limit(30);
  if (result.error) { container.innerHTML = `<p class="form-error">${escapeHtml(result.error.message)}</p>`; return; }
  if (!result.data?.length) { container.innerHTML = '<div class="feed-empty"><strong>এখনো কোনো প্রকাশিত প্রতিবেদন নেই</strong></div>'; return; }
  container.innerHTML = result.data.map((article) => `<details class="history-entry own-article-editor" data-own-article="${attr(article.id)}"><summary><strong>${escapeHtml(article.title)}</strong><span> · ${escapeHtml(timestamp(article.published_at))}</span></summary><form data-own-article-form><label class="field-label">শিরোনাম<input name="title" maxlength="180" value="${attr(article.title)}" required></label><label class="field-label">সংক্ষিপ্ত পরিচিতি<textarea name="excerpt" rows="3" maxlength="280" required>${escapeHtml(article.excerpt)}</textarea></label><label class="field-label">পূর্ণ প্রতিবেদন<textarea name="body" rows="9" minlength="100" maxlength="30000" required>${escapeHtml(article.body)}</textarea></label><label class="field-label">সম্পাদনার কারণ<textarea name="reason" rows="2" minlength="3" maxlength="500" required></textarea></label><p class="form-error" data-own-article-error hidden></p><button class="outline-button" type="submit">পরিবর্তন সংরক্ষণ করুন</button><a class="text-link" href="/news/${encodeURIComponent(article.slug)}/">প্রকাশিত প্রতিবেদন দেখুন ↗</a></form></details>`).join('');
  container.querySelectorAll<HTMLFormElement>('[data-own-article-form]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const card = form.closest<HTMLElement>('[data-own-article]'); const error = form.querySelector<HTMLElement>('[data-own-article-error]');
    if (!supabase || !card) return;
    const values = formDataObject(form); const button = form.querySelector<HTMLButtonElement>('button[type="submit"]'); if (button) button.disabled = true;
    const updated = await supabase.rpc('update_own_article', { p_article_id: card.dataset.ownArticle, p_title: values.title, p_excerpt: values.excerpt, p_body: values.body, p_reason: values.reason });
    if (button) button.disabled = false;
    if (updated.error) return setMessage(error, updated.error.message);
    toast('আপনার প্রতিবেদন হালনাগাদ হয়েছে।'); await loadOwnArticles();
  }));
}

async function initIdentity() {
  if (!supabase) { paintAuthState(); return; }
  const { data } = await supabase.auth.getSession(); authUser = data.session?.user ?? null;
  if (authUser) {
    if (!demoMode) { const bootstrap = await supabase.rpc('bootstrap_first_admin'); if (bootstrap.data === true) toast('প্রাথমিক অ্যাডমিন হিসেবে সক্রিয় হয়েছেন।'); }
    await loadIdentity(authUser);
  }
  paintAuthState();
  supabase.auth.onAuthStateChange((_event, session) => {
    const previous = authUser?.id;
    authUser = session?.user ?? null;
    if (!authUser) {
      if (previous) sessionStorage.removeItem(`dutimz-profile-prompt:${previous}`);
      authProfile = null; authRole = 'reader'; reporterTier = null; profilePromptShown = false;
      setCompletion(0); paintAuthState();
      return;
    }
    if (previous !== authUser.id) profilePromptShown = false;
    paintAuthState();
    if (previous !== authUser.id && !refreshBusy) {
      refreshBusy = true;
      const user = authUser;
      window.setTimeout(() => {
        void loadIdentity(user).then(() => {
          paintAuthState(); initRoleForms(); initModeration(); initAdminWorkflows(); initAdminHistory();
        }).finally(() => { refreshBusy = false; });
      }, 0);
    }
  });
}
async function boot() {
  await loadConfig();
  initAccountMenu(); initProfileForm(); initLiveSearch(); initProfileEditor();
  initWithdrawals(); initArticleEditor();
  await initOAuth(); await initIdentity();
  await loadArticles(); initSearchPage(); initModeration();
  initRoleForms(); initAdminWorkflows(); initAdminHistory();
  document.querySelectorAll<HTMLElement>('[data-google-sign-in]').forEach((button) => { (button as HTMLButtonElement).disabled = false; });
  const path = location.pathname; document.querySelectorAll('.mobile-dock__link.is-active').forEach((link) => link.classList.remove('is-active'));
  const active = path === '/' ? '.mobile-dock__link[href="/"]' : path === '/search/' ? '.mobile-dock__link[href="/search/"]' : path === '/saved/' ? '.mobile-dock__link[href="/saved/"]' : '';
  if (active) document.querySelector(active)?.classList.add('is-active');
}
if (typeof document !== 'undefined') void boot();


