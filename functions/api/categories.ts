export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || env.SUPABASE_URL.includes('YOUR_PROJECT_REF')) {
    return Response.json({ categories: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const query = new URL('/rest/v1/categories?select=slug,title_bn,description_bn,sort_order&active=eq.true&order=sort_order.asc', `${env.SUPABASE_URL.replace(/\/$/, '')}/`);
  const result = await fetch(query, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } });
  if (!result.ok) return Response.json({ error: 'বিভাগ লোড করা যায়নি।' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  return new Response(JSON.stringify({ categories: await result.json() }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=300' },
  });
};
