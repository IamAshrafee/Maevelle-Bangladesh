# Phase 01-C browser reproduction

Use a fresh Phase 01-C scratch directory and an owned disposable container. The checked-in Phase 01-C scripts contain the runtime and faults used in this run. For a checkout predating those scripts, the generator and patch recreate the adapted Phase 01B-R harness. The generator refuses existing paths. Keep fault suites sequential and allow a quiet limiter window between high-volume runs.

```sh
docker run --pull never -d --name maevelle-cart01c-pg18 --label maevelle.purpose=cart01c-isolated -p 127.0.0.1:55444:5432 --tmpfs /var/lib/postgresql -e POSTGRES_USER=cart01c -e POSTGRES_PASSWORD -e POSTGRES_DB=maevelle_test postgres:18
docker inspect --format '{{json .Config.Labels}} {{json .HostConfig.PortBindings}} {{json .HostConfig.Tmpfs}}' maevelle-cart01c-pg18
docker exec maevelle-cart01c-pg18 psql -U cart01c -d maevelle_test -Atc 'select current_database(), current_user, version()'
CART_01C_ISOLATED_URL="$TEST_DATABASE_URL" pnpm exec tsx scripts/cart-phase01c-runtime.ts
node scripts/cart-phase01c-proxy.mjs
# Build via the report command. Start only after the selected fixture API is ready.
cp -R apps/storefront/.next/static apps/storefront/.next/standalone/apps/storefront/.next/static
HOSTNAME=127.0.0.1 PORT=3004 STOREFRONT_INTERNAL_API_URL=http://127.0.0.1:3002 STOREFRONT_BASE_URL=http://localhost:3000 node apps/storefront/.next/standalone/apps/storefront/server.js
```

Set a synthetic POSTGRES_PASSWORD before the container command and verify container identity and loopback mapping before setting TEST_DATABASE_URL. The API uses 3002, proxy 3000, Storefront 3004. Browser processes are started separately with Chrome's executable, headless mode, no first run, a distinct user-data-dir per process and the indicated remote debugging port. Use 9227 for normal, 9228 with profile.default_content_setting_values.cookies set to 2 in Default/Preferences before launch, and 9230/9231 for zoom. Set zoom profile windows to 1280×1000 and device scale to 1. The native zoom script uses Chrome's Settings page and asserts actual DPR and viewport changes.

```sh
node scripts/cart-phase01c-browser.mjs
node scripts/cart-phase01c-clear-reset.mjs
node scripts/cart-phase01c-variant.mjs
node scripts/cart-phase01c-native-zoom.mjs
node scripts/cart-phase01c-blocked-cookies.mjs
node scripts/cart-phase01c-layout.mjs
node scripts/cart-phase01c-visibility.mjs
node scripts/cart-phase01c-performance.mjs
```

Final outputs live in /tmp/maevelle-cart01c. Copy only sanitized evidence, never fixture.json, browser profile data or database dumps. The standalone test runner uses a dedicated generated cache. Changing the synthetic tenant requires a fresh runtime and Storefront context cache. If provisioning fails, retain logs and correct the specific test harness problem before counting an execution. Stop the owned processes, remove the verified tmpfs container, and preserve any tracked harness files.

For a checkout without any Phase 01-C harness scripts, run the generator and apply the patch from the repository root. For a checkpoint containing only the initial generated copies, apply the patch only after git apply --check succeeds. The verification checkpoint already contains the patched scripts in its worktree.
