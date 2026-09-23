export const onRequestGet = async ({ env }: PagesContext) => new Response(JSON.stringify({ ok: true, service: 'dutimz-pages' }), {
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
