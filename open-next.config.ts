// Required by the Cloudflare adapter: without this file `opennextjs-cloudflare build`
// refuses to run, and `opennextjs-cloudflare deploy` then fails with "Could not find
// compiled Open Next config, did you run the build command?".
//
// No incremental cache override is configured, deliberately. The portal Worker holds no
// storage binding of its own — every byte of media lives behind the separate media Worker —
// so the adapter template's default R2 incremental cache would need a bucket binding this
// Worker intentionally does not have. Routes that export `revalidate` are therefore
// rendered on demand rather than served from a shared cache; adding an R2 or KV
// incremental cache is the follow-up if regenerating them starts to cost more than the
// cache is worth.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
