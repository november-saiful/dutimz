interface Env {
  MEDIA_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  PUBLIC_DEMO_MODE?: string;
  SITE_URL: string;
  MEDIA_URL: string;
  MEDIA_WORKER_URL?: string;
}

type PagesContext = EventContext<Env, string, Record<string, unknown>>;
