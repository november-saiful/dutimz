import { escapeHtml, pageShell, responseHtml } from '../_lib/render';

type Env = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
type Category = { slug: string; title_bn: string; description_bn: string };
type Article = { id: string; slug: string; title: string; excerpt: string; published_at: string; category: Category; profiles: { username: string; display_name: string } };
const categoryNames: Record<string, string> = { campus: 'ক্যাম্পাস', university: 'বিশ্ববিদ্যালয়', 'student-life': 'শিক্ষার্থী জীবন', culture: 'সংস্কৃতি', opinion: 'মতামত', sports: 'ক্রীড়া' };

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const slug = String(params.slug ?? '');
  const title = categoryNames[slug] ?? 'সংবাদ বিভাগ';
  const canonical = `/category/${encodeURIComponent(slug)}/`;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || env.SUPABASE_URL.includes('YOUR_PROJECT_REF')) return responseHtml(pageShell(title, `ঢাকা বিশ্ববিদ্যালয়ের ${title} বিভাগের খবর।`, canonical, `<section class="content-page dashboard-shell"><div class="account-page-heading"><span class="section-kicker">ডুটিমজ সংবাদ বিভাগ</span><h1>${escapeHtml(title)}</h1><p>সম্পাদিত প্রতিবেদন শিগগিরই এখানে প্রকাশিত হবে।</p></div><div class="feed-empty"><span class="feed-empty__icon">ঢা</span><strong>সংবাদ আর্কাইভ প্রস্তুত হচ্ছে</strong></div></section>`));
  const url = new URL('/rest/v1/categories', `${env.SUPABASE_URL.replace(/\/$/, '')}/`);
  url.searchParams.set('select', 'slug,title_bn,description_bn');
  url.searchParams.set('slug', `eq.${slug}`);
  url.searchParams.set('active', 'eq.true');
  url.searchParams.set('limit', '1');
  const categoryResult = await fetch(url, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } });
  const category = categoryResult.ok ? (await categoryResult.json() as Category[])[0] : null;
  if (!category) return responseHtml(pageShell('বিভাগ পাওয়া যায়নি', 'এই সংবাদ বিভাগটি সক্রিয় নেই।', canonical, '<section class="content-page article-not-found"><div><h1>বিভাগ পাওয়া যায়নি</h1><a href="/" class="read-button"><span>মূলপাতায় ফিরুন</span><span>→</span></a></div></section>'), 404);
  const storiesUrl = new URL('/rest/v1/articles', `${env.SUPABASE_URL.replace(/\/$/, '')}/`);
  storiesUrl.searchParams.set('select', 'id,slug,title,excerpt,published_at,category:categories!inner(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name)');
  storiesUrl.searchParams.set('category.slug', `eq.${slug}`);
  storiesUrl.searchParams.set('status', 'eq.published');
  storiesUrl.searchParams.set('order', 'published_at.desc');
  storiesUrl.searchParams.set('limit', '40');
  const storiesResult = await fetch(storiesUrl, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } });
  const stories = storiesResult.ok ? await storiesResult.json() as Article[] : [];
  const cards = stories.map((story) => `<article class="story-card"><a class="story-card__art story-art" href="/news/${encodeURIComponent(story.slug)}/"><span class="story-art__visual art-campus"><span class="story-art__halo"></span><span class="story-art__seal">ঢা<br><i>বি</i></span></span><span class="story-card__category">${escapeHtml(category.title_bn)}</span></a><div class="story-card__body"><div class="story-meta"><a href="${canonical}">${escapeHtml(category.title_bn)}</a><span aria-hidden="true">·</span><time datetime="${escapeHtml(story.published_at)}">${new Date(story.published_at).toLocaleDateString('bn-BD')}</time></div><h3><a href="/news/${encodeURIComponent(story.slug)}/">${escapeHtml(story.title)}</a></h3><p>${escapeHtml(story.excerpt)}</p><div class="story-card__footer"><a class="story-byline" href="/u/${encodeURIComponent(story.profiles.username)}/">${escapeHtml(story.profiles.display_name || `@${story.profiles.username}`)}</a><a class="round-arrow" href="/news/${encodeURIComponent(story.slug)}/" aria-label="প্রতিবেদন পড়ুন">→</a></div></div></article>`).join('');
  const content = `<section class="content-page dashboard-shell"><div class="account-page-heading"><span class="section-kicker">ডুটিমজ সংবাদ বিভাগ</span><h1>${escapeHtml(category.title_bn)}</h1><p>${escapeHtml(category.description_bn || `ঢাকা বিশ্ববিদ্যালয়ের ${category.title_bn} বিভাগের খবর।`)}</p></div><div class="story-grid category-story-grid">${cards || '<div class="feed-empty"><span class="feed-empty__icon">ঢা</span><strong>এই বিভাগে এখনো প্রতিবেদন নেই</strong><p>সম্পাদকীয় ডেস্কের যাচাই করা খবর এখানে দেখানো হবে।</p></div>'}</div></section>`;
  return responseHtml(pageShell(category.title_bn, category.description_bn || `ঢাকা বিশ্ববিদ্যালয়ের ${category.title_bn} বিভাগের সর্বশেষ খবর।`, canonical, content), 200, 'public, max-age=60, stale-while-revalidate=300');
};
