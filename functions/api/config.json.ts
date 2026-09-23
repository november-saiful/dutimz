type RuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  MEDIA_URL?: string;
  PUBLIC_DEMO_MODE?: string;
};

export const onRequestGet: PagesFunction<RuntimeEnv> = ({ env }) => Response.json({
  supabaseUrl: env.SUPABASE_URL ?? '',
  supabaseAnonKey: env.SUPABASE_ANON_KEY ?? '',
  mediaUrl: env.MEDIA_URL ?? '',
  demoMode: env.PUBLIC_DEMO_MODE !== 'false' && !env.SUPABASE_URL,
}, {
  headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  },
});
