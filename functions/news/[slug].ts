import { escapeHtml, pageShell, publicName, responseHtml, safeJson } from '../_lib/render';

type Env = { SUPABASE_URL: string; SUPABASE_ANON_KEY: string };
type Category = { slug: string; title_bn: string };
type Profile = { username: string; display_name: string; avatar_url: string | null };
type Article = { id: string; slug: string; title: string; excerpt: string; body: string; author_id: string; hero_media_key: string | null; published_at: string; category: Category | Category[]; profiles: Profile | Profile[] };
const one = <T,>(value: T | T[] | null | undefined): T | null => Array.isArray(value) ? value[0] ?? null : value ?? null;
const fmt = (value: string) => new Date(value).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' });

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || env.SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    return responseHtml(pageShell('প্রতিবেদনটি প্রস্তুত হচ্ছে', 'ডুটিমজের সংবাদ আর্কাইভ শিগগিরই প্রকাশিত হবে।', '/news/', '<section class="content-page article-not-found"><div><span class="feed-empty__icon">ঢা</span><h1>সংবাদ আর্কাইভ প্রস্তুত হচ্ছে</h1><p>প্রকাশিত, সম্পাদিত প্রতিবেদন এখানে দেখানো হবে।</p><a class="read-button" href="/"><span>মূলপাতায় ফিরুন</span><span>→</span></a></div></section>'));
  }
  const slug = String(params.slug ?? '');
  const query = new URL('/rest/v1/articles', `${env.SUPABASE_URL.replace(/\/$/, '')}/`);
  query.searchParams.set('select', 'id,slug,title,excerpt,body,author_id,hero_media_key,published_at,category:categories(slug,title_bn),profiles:profiles!articles_author_id_fkey(username,display_name,avatar_url)');
  query.searchParams.set('status', 'eq.published');
  query.searchParams.set('slug', `eq.${slug}`);
  query.searchParams.set('limit', '1');
  const response = await fetch(query, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } });
  if (!response.ok) return responseHtml(pageShell('প্রতিবেদন পাওয়া যায়নি', 'প্রকাশিত প্রতিবেদন খুঁজে পাওয়া যায়নি।', `/news/${encodeURIComponent(slug)}/`, '<section class="content-page article-not-found"><div><span class="feed-empty__icon">⌕</span><h1>প্রতিবেদনটি পাওয়া যায়নি</h1><p>লিংকটি ভুল হতে পারে অথবা প্রতিবেদনটি প্রকাশিত নেই।</p><a class="read-button" href="/"><span>মূলপাতায় ফিরুন</span><span>→</span></a></div></section>'), 502);
  const article = (await response.json() as Article[])[0];
  if (!article) return responseHtml(pageShell('প্রতিবেদন পাওয়া যায়নি', 'প্রকাশিত প্রতিবেদন খুঁজে পাওয়া যায়নি।', `/news/${encodeURIComponent(slug)}/`, '<section class="content-page article-not-found"><div><span class="feed-empty__icon">⌕</span><h1>প্রতিবেদনটি পাওয়া যায়নি</h1><p>এই প্রতিবেদনটি এখন প্রকাশিত নেই।</p><a class="read-button" href="/"><span>মূলপাতায় ফিরুন</span><span>→</span></a></div></section>'), 404);
  const category = one(article.category) ?? { slug: '', title_bn: 'ঢাকা বিশ্ববিদ্যালয়' };
  const author = one(article.profiles) ?? { username: '', display_name: 'সম্পাদকীয় ডেস্ক', avatar_url: null };
  const articleUrl = `/news/${encodeURIComponent(article.slug)}/`;
  const body = article.body.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`).join('');
  const image = article.hero_media_key ? `<figure class="article-hero-art"><img src="https://media.dutimz.com/media/${encodeURIComponent(article.hero_media_key)}" alt="" loading="eager"></figure>` : `<div class="article-hero-art"><span class="story-art__visual art-campus" aria-hidden="true"><span class="story-art__halo"></span><span class="story-art__seal">ঢা<br><i>বি</i></span></span></div>`;
  const content = `<article class="article-page" data-article-root data-article-slug="${escapeHtml(article.slug)}" data-article-id="${escapeHtml(article.id)}">
    <nav class="article-breadcrumbs" aria-label="অবস্থান"><a href="/">মূলপাতা</a><span aria-hidden="true">›</span><a href="/category/${encodeURIComponent(category.slug)}/">${escapeHtml(category.title_bn)}</a></nav>
    <header class="article-header"><div class="story-meta"><a href="/category/${encodeURIComponent(category.slug)}/">${escapeHtml(category.title_bn)}</a><span aria-hidden="true">·</span><time datetime="${escapeHtml(article.published_at)}">${fmt(article.published_at)}</time></div><h1>${escapeHtml(article.title)}</h1><p class="article-excerpt">${escapeHtml(article.excerpt)}</p><div class="article-author-row"><span class="article-author-avatar" aria-hidden="true">ঢা</span><div class="article-author-info"><a href="/u/${encodeURIComponent(author.username)}/"><strong>${escapeHtml(publicName(author))}</strong></a><time datetime="${escapeHtml(article.published_at)}">প্রকাশিত ${fmt(article.published_at)}</time></div></div></header>
    ${image}<article class="article-body">${body}</article>
    <div class="article-actions"><div class="article-actions__group"><button class="action-pill" type="button" data-reaction-button aria-label="প্রতিবেদনটি ভালো লেগেছে"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.9c0 5.1-8.8 11.1-8.8 11.1S3.2 14 3.2 8.9a4.3 4.3 0 0 1 8.1-2 4.3 4.3 0 0 1 9.5 2Z"/></svg><span data-reaction-count>০</span><span>ভালো লেগেছে</span></button><button class="action-pill" type="button" data-bookmark-button><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.8L6 21z"/></svg><span data-bookmark-label>সংরক্ষণ</span></button></div><div class="article-actions__group"><button class="action-pill" type="button" data-share-button>শেয়ার করুন <span aria-hidden="true">↗</span></button><a class="action-pill" href="mailto:corrections@dutimz.com?subject=${encodeURIComponent(`সংশোধন: ${article.title}`)}">সংশোধন জানান</a></div></div>
    <section class="comments-section"><div class="feed-heading"><div><span class="section-kicker">পাঠকের আলোচনা</span><h2>মন্তব্য</h2></div><span data-comment-total>০টি</span></div><form class="comment-form" data-comment-form><label class="sr-only" for="comment-body">আপনার মন্তব্য</label><textarea id="comment-body" name="body" maxlength="2000" placeholder="শ্রদ্ধাশীল ভাষায় আপনার মতামত লিখুন…" required></textarea><button class="read-button" type="submit"><span>মন্তব্য করুন</span><span aria-hidden="true">→</span></button></form><p class="form-error" role="alert" data-comment-error hidden></p><div class="comment-list" data-comment-list></div></section>
  </article><script type="application/ld+json">${safeJson({ '@context': 'https://schema.org', '@type': 'NewsArticle', headline: article.title, description: article.excerpt, datePublished: article.published_at, author: { '@type': 'Person', name: publicName(author), url: `https://dutimz.com/u/${author.username}` }, publisher: { '@type': 'Organization', name: 'ডুটিমজ', url: 'https://dutimz.com' }, inLanguage: 'bn' })}</script>`;
  const result = pageShell(article.title, article.excerpt, articleUrl, content);
  return responseHtml(result, 200, 'public, max-age=60, stale-while-revalidate=600');
};
