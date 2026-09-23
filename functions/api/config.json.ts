type RuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  MEDIA_URL?: string;
  PUBLIC_DEMO_MODE?: string;
};

export const onRequestGet: PagesFunction<RuntimeEnv> = ({ env }) => {
  const demoFlag = env.PUBLIC_DEMO_MODE;
  return Response.json({
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY ?? '',
    mediaUrl: env.MEDIA_URL ?? '',
    // An explicit flag always wins. Preview deployments inherit whole variable sets from
    // whichever environment they are given, so "demo unless a Supabase project happens to
    // be configured" would put unmerged pull-request code in front of the production
    // database. With the flag unset (local development), the project's presence decides.
    demoMode:
      demoFlag === undefined || demoFlag === '' ? !env.SUPABASE_URL : demoFlag !== 'false',
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
