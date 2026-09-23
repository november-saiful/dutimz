import { escapeHtml, pageShell, publicName, responseHtml } from '../_lib/render';

type Env = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
type PublicProfile = { id: string; username: string; display_name: string; bio: string | null; avatar_url: string | null };
type Category = { slug: string; title_bn: string };
type Story = { id: string; slug: string; title: string; excerpt: string; published_at: string; category: Category | Category[] };
const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] ?? null : value ?? null;
const time = (value: string) => new Date(value).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const username = String(params.username ?? '');
  const canonical = `/u/${encodeURIComponent(username)}/`;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || env.SUPABASE_URL.includes('YOUR_PROJECT_REF')) return responseHtml(pageShell('লেখক প্রোফাইল', 'ডুটিমজ লেখকদের প্রকাশ্য পরিচয় ও প্রকাশিত প্রতিবেদন।', canonical, '<section class="content-page"><div class="feed-empty"><strong>প্রোফাইল প্রস্তুত হচ্ছে</strong><p>ডেটাবেজ সংযোগ চালু হলে লেখকের প্রতিবেদন এখানে আসবে।</p></div></section>'));
  const base = env.SUPABASE_URL.replace(/\/$/, '');
  const profileQuery = new URL('/rest/v1/profiles', `${base}/`);
  profileQuery.searchParams.set('select', 'id,username,display_name,bio,avatar_url');
  profileQuery.searchParams.set('username', `eq.${username}`);
  profileQuery.searchParams.set('limit', '1');
  const result = await fetch(profileQuery, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } });
  if (!result.ok) return responseHtml(pageShell('লেখক প্রোফাইল', 'লেখকের প্রকাশ্য প্রোফাইল পাওয়া যায়নি।', canonical, '<section class="content-page article-not-found"><div><span class="feed-empty__icon">⌕</span><h1>প্রোফাইল পাওয়া যায়নি</h1><p>এই ইউজারনেম দিয়ে কোনো প্রকাশ্য প্রোফাইল নেই।</p><a class="read-button" href="/"><span>মূলপাতায় ফিরুন</span><span>→</span></a></div></section>'), 404);
  const profile = (await result.json() as PublicProfile[])[0];
  if (!profile) return responseHtml(pageShell('লেখক প্রোফাইল', 'লেখকের প্রকাশ্য প্রোফাইল পাওয়া যায়নি।', canonical, '<section class="content-page article-not-found"><div><span class="feed-empty__icon">⌕</span><h1>প্রোফাইল পাওয়া যায়নি</h1><p>এই ইউজারনেম দিয়ে কোনো প্রকাশ্য প্রোফাইল নেই।</p><a class="read-button" href="/"><span>মূলপাতায় ফিরুন</span><span>→</span></a></div></section>'), 404);
  const storiesQuery = new URL('/rest/v1/articles', `${base}/`);
  storiesQuery.searchParams.set('select', 'id,slug,title,excerpt,published_at,category:categories(slug,title_bn)');
  storiesQuery.searchParams.set('author_id', `eq.${profile.id}`);
  storiesQuery.searchParams.set('status', 'eq.published');
  storiesQuery.searchParams.set('order', 'published_at.desc');
  storiesQuery.searchParams.set('limit', '30');
  const storiesResponse = await fetch(storiesQuery, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } });
  const stories = storiesResponse.ok ? await storiesResponse.json() as Story[] : [];
  const cards = stories.length ? stories.map((story) => {
    const category = one(story.category) ?? { slug: '', title_bn: 'ঢাকা বিশ্ববিদ্যালয়' };
    return `<article class="story-card"><a class="story-card__art story-art" href="/news/${encodeURIComponent(story.slug)}/"><span class="story-art__visual art-campus"><span class="story-art__halo"></span><span class="story-art__seal">ঢা<br><i>বি</i></span></span><span class="story-card__category">${escapeHtml(category.title_bn)}</span></a><div class="story-card__body"><div class="story-meta"><a href="/category/${encodeURIComponent(category.slug)}/">${escapeHtml(category.title_bn)}</a><span aria-hidden="true">·</span><time datetime="${escapeHtml(story.published_at)}">${time(story.published_at)}</time></div><h3><a href="/news/${encodeURIComponent(story.slug)}/">${escapeHtml(story.title)}</a></h3><p>${escapeHtml(story.excerpt)}</p></div></article>`;
  }).join('') : '<div class="feed-empty"><span class="feed-empty__icon">ঢা</span><strong>এখনো প্রকাশিত প্রতিবেদন নেই</strong><p>এই লেখকের প্রকাশিত প্রতিবেদন এখানে দেখা যাবে।</p></div>';
  const safeName = publicName(profile);
  const content = `<section class="account-page-shell dashboard-shell"><div class="profile-page-card__top"><span class="account-avatar account-avatar--large" aria-hidden="true">ঢা</span><div><span class="section-kicker">ডুটিমজ লেখক</span><h1>${escapeHtml(safeName)}</h1><p>@${escapeHtml(profile.username)}</p></div></div><p>${escapeHtml(profile.bio || 'ঢাকা বিশ্ববিদ্যালয়ের পাঠক ও লেখক।')}</p><div class="feed-heading"><div><span class="section-kicker">প্রকাশিত লেখা</span><h2>প্রতিবেদন</h2></div></div><div class="story-grid">${cards}</div></section>`;
  return responseHtml(pageShell(safeName, profile.bio || 'ডুটিমজ লেখকের প্রকাশ্য প্রোফাইল ও প্রকাশিত প্রতিবেদন।', canonical, content), 200, 'public, max-age=120, stale-while-revalidate=600');
};
