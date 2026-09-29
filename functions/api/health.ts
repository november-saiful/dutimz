export const onRequestGet = async () => new Response(JSON.stringify({ ok: true, service: 'dutimz-pages' }), {
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
