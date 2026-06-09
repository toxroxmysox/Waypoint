import { config as loadEnv } from 'dotenv';

// Match playwright.config.ts: load .env.local then .env so WAYPOINT_DEV_MODE,
// E2E_TEST_EMAIL, and PUBLIC_PB_URL are visible here.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

// Seed one active baseline trip for E2E_TEST_EMAIL before the suite runs.
// Several specs "open the first trip" for that user and assume an active trip
// already exists. On a clean DB nothing guarantees that — the trip the M1 spec
// creates may not have run yet — so they race whichever spec seeds first. This
// makes the precondition deterministic. No-op when dev mode is off (specs skip).
export default async function globalSetup() {
	if (process.env.WAYPOINT_DEV_MODE !== 'true' || !process.env.E2E_TEST_EMAIL) return;

	const PB_BASE = process.env.PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
	const res = await fetch(`${PB_BASE}/api/dev/seed-baseline-trip`, { method: 'POST' });
	if (!res.ok) {
		throw new Error(
			`global-setup: seed-baseline-trip failed (${res.status}): ${await res.text()}`
		);
	}
}
