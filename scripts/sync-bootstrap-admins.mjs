// Who is an administrator is data, not a claim: public.app_settings.bootstrap_admin_emails
// holds the Google addresses that receive the role, and migration 007 applies it both when an
// account is created and to accounts that already exist (public.bootstrap_admin_accounts()).
//
// The addresses are personal data, and this repository is public, so they are not committed.
// They travel from the BOOTSTRAP_ADMIN_EMAILS repository secret straight into the database
// through the Supabase management API (the same endpoint the SQL editor uses), in the same
// spirit as scripts/inject-pages-vars.mjs. Removing an address here does not demote anyone —
// a role change is a deliberate act, so it stays a reviewed migration or an admin action.
//
// The script also verifies its own work: every configured address that already has an account
// must end up holding the administrator role, or the release fails. Nothing sensitive is
// printed, because the logs of a public repository are public too.
const PROJECT_REF = process.env.SUPABASE_PROJECT_ID;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const RAW_EMAILS = process.env.BOOTSTRAP_ADMIN_EMAILS ?? '';
const ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

const configured = RAW_EMAILS.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);

if (!process.env.CI && !process.argv.includes('--force')) {
  console.error(
    'Refusing to change production administrators outside CI.\n' +
      'Run with --force only if you are releasing by hand.',
  );
  process.exit(1);
}

if (configured.length === 0) {
  console.warn(
    'BOOTSTRAP_ADMIN_EMAILS is empty, so no administrator is configured by policy.\n' +
      'Set the repository secret (Settings -> Secrets and variables -> Actions) to keep the\n' +
      'portal owners in the administrator role. Continuing without changing anything.',
  );
  process.exit(0);
}

const missing = ['SUPABASE_PROJECT_ID', 'SUPABASE_ACCESS_TOKEN'].filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Cannot configure administrators without ${missing.join(' and ')}.`);
  process.exit(1);
}

/** Masks an address so a public CI log never contains a personal address. */
const mask = (email) => email.replace(/^(.)[^@]*(@.*)$/, '$1•••$2');

async function runQuery(query) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Management API ${response.status} for the query below.\n${query}\n${body}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return [];
  }
}

const quoted = configured.map((email) => `'${email.replace(/'/g, "''")}'`).join(', ');
const list = configured.join(',');

await runQuery(
  `insert into public.app_settings (key, value) values ('bootstrap_admin_emails', '${list}')
   on conflict (key) do update set value = excluded.value, updated_at = now()`,
);
console.log(`Configured ${configured.length} administrator address(es): ${configured.map(mask).join(', ')}`);

const promoted = await runQuery('select public.bootstrap_admin_accounts() as promoted');
console.log(`Bootstrap assigned the administrator role to ${promoted?.[0]?.promoted ?? 0} existing account(s).`);

// Verification: an address that has signed in at all must now be an administrator. An address
// that has never signed in has no account yet — handle_new_user() covers it at first sign-in.
const accounts = await runQuery(
  `select lower(u.email) as email, coalesce(r.role::text, 'reader') as role
     from auth.users u
     left join public.user_roles r on r.user_id = u.id
    where lower(u.email) in (${quoted})`,
);
const totals = await runQuery("select count(*)::int as admins from public.user_roles where role = 'admin'");
console.log(`Administrator accounts in the portal: ${totals?.[0]?.admins ?? 'unknown'}`);
const roleByEmail = new Map((Array.isArray(accounts) ? accounts : []).map((row) => [row.email, row.role]));
const failures = [];

for (const email of configured) {
  const role = roleByEmail.get(email);
  if (role === undefined) {
    console.log(`  ${mask(email)}: no account yet, will become an administrator at first sign-in`);
  } else if (role === 'admin') {
    console.log(`  ${mask(email)}: administrator`);
  } else {
    console.log(`  ${mask(email)}: ${role} — expected administrator`);
    failures.push(email);
  }
}

if (failures.length > 0) {
  console.error(
    `${failures.length} configured address(es) did not reach the administrator role. ` +
      'Check that the migrations were applied before this step ran.',
  );
  process.exitCode = 1;
} else {
  console.log(`Administrator bootstrap verified for ${configured.length} configured address(es).`);
}
