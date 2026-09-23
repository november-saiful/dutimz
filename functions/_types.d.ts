// Only the values the Pages Functions actually read are declared here. Media lives in the
// separate `dutimz-media` Worker, so this project holds no storage binding at all.
interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  PUBLIC_DEMO_MODE?: string;
  SITE_URL: string;
  MEDIA_URL: string;
  MEDIA_WORKER_URL?: string;
}

type PagesContext = EventContext<Env, string, Record<string, unknown>>;
