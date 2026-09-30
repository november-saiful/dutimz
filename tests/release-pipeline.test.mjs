// The release pipeline is the only gate in front of production.
//
// A push to main runs the release: migrations, then two Worker deployments, with no
// pull-request review in between. These assertions pin the handful of ordering decisions
// that keep a failed release from leaving production half-updated, so a later edit to
// the workflow has to argue with a test rather than quietly reorder the deploy.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const releaseJob = async () => {
  const workflow = await readProjectFile('.github/workflows/ci.yml');
  const at = workflow.indexOf('\n  release:');
  assert.notEqual(at, -1, 'the workflow must define a release job');
  return workflow.slice(at);
};
const indexOf = (source, needle) => {
  const at = source.indexOf(needle);
  assert.notEqual(at, -1, `the workflow must contain "${needle}"`);
  return at;
};

test('a release starts only after verify passed for that commit, and only on main', async () => {
  const release = await releaseJob();
  assert.match(release, /needs: verify/, 'the release must depend on the verify job');
  assert.match(release, /github\.ref == 'refs\/heads\/main'/);
  // A manual run on another branch has to fail loudly rather than deploy that branch.
  assert.match(release, /A release must run on main/);
});

test('nothing irreversible runs before the steps that can fail on their own', async () => {
  const release = await releaseJob();
  const credentials = indexOf(release, 'Check the release credentials before anything changes');
  const build = indexOf(release, 'Build the production Workers bundle');
  const migrate = indexOf(release, 'Apply committed production database migrations');
  const portal = indexOf(release, 'Deploy the production Worker');

  assert.ok(
    credentials < build,
    'the credential check must run before anything is built or changed',
  );
  assert.ok(
    build < migrate,
    'the production bundle must be built before migrations are applied',
  );
  assert.ok(migrate < portal, 'the portal deployment must follow the migrations');
  // `deploy` must not build: a second build could ship a bundle that verify never saw
  // (the pull-request preview may chain the two, the release may not).
  assert.match(release, /run: npx @opennextjs\/cloudflare deploy\r?\n/);
});

test('the credential check names every missing secret', async () => {
  const release = await releaseJob();
  for (const secret of [
    'SUPABASE_ACCESS_TOKEN',
    'SUPABASE_DB_PASSWORD',
    'SUPABASE_PROJECT_ID',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
  ]) {
    assert.ok(
      release.includes(secret),
      `the release must require ${secret} before it changes anything`,
    );
  }
  assert.match(release, /::error::Missing release credentials/);
});

test('the release publishes the pending migration plan before it applies it', async () => {
  // A push to main has no pull request above it, so the run summary is where the
  // migration plan gets read. It has to come from the dry run and reach the summary
  // *before* `supabase db push` runs: a plan published by the summary step at the end
  // would describe what already happened to the database rather than what is about to.
  const release = await releaseJob();
  const review = release.slice(
    indexOf(release, 'Review pending database migrations'),
    indexOf(release, 'Publish the pending migration plan'),
  );
  assert.match(review, /db push --dry-run/, 'the plan must come from the dry run');
  assert.match(
    review,
    /tee "\$RUNNER_TEMP\/pending-migrations\.txt"/,
    'the dry run must be captured, not only printed to the log',
  );
  assert.match(
    review,
    /set -o pipefail/,
    'without pipefail the pipeline reports tee and a dry run that could not connect would pass',
  );

  const publish = release.slice(
    indexOf(release, 'Publish the pending migration plan'),
    indexOf(release, 'Materialise the Worker variables'),
  );
  assert.match(publish, /if: always\(\)/, 'a dry run that failed must still show what it printed');
  // Teed rather than appended: the step log then shows exactly what the summary got,
  // which is the only way to read a run summary back off a finished run.
  assert.match(publish, /tee -a "\$GITHUB_STEP_SUMMARY"/);
  assert.match(publish, /sed -E[^\n]*"\$plan"/, 'the captured plan is what gets printed');
  assert.match(publish, /The dry run produced no plan/, 'an absent plan must say so, not render empty');
  assert.ok(
    indexOf(release, 'Publish the pending migration plan') <
      indexOf(release, 'Apply committed production database migrations'),
    'the plan must be on the run page before the migrations are applied',
  );
});

test('a failed release reports which half landed', async () => {
  const release = await releaseJob();
  const summary = indexOf(release, 'Summarise the release');
  assert.ok(summary > indexOf(release, 'Verify production endpoints'));
  assert.match(release.slice(summary), /if: always\(\)/);
  assert.match(release, /GITHUB_STEP_SUMMARY/);
  for (const stage of [
    'production bundle built',
    'migrations applied',
    'administrators synced',
    'media Worker deployed',
    'portal Worker deployed',
  ]) {
    assert.ok(
      release.includes(stage),
      `the summary must report "${stage}"`,
    );
  }
});
