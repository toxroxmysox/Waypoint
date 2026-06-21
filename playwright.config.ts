import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

// Match Vite/SvelteKit behavior: auto-load .env.local so tests see
// WAYPOINT_DEV_MODE and E2E_TEST_EMAIL without requiring an inline export.
config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
	// reuseExistingServer: reuse a preview already on :4173 (fast local iteration);
	// CI / e2e-isolated.sh have none pre-started, so Playwright builds+serves fresh.
	webServer: { command: 'npm run build && npm run preview', port: 4173, reuseExistingServer: !process.env.CI },
	testMatch: '**/*.spec.{ts,js}',
	testDir: 'tests/e2e',
	// Seed a deterministic active baseline trip for E2E_TEST_EMAIL before any
	// spec runs, so "open the first trip" specs don't race on a clean DB.
	globalSetup: './tests/e2e/global-setup.ts',
	// Multi-context contribution specs (owner+traveler+co_owner sessions) can race
	// under parallel workers on a shared PB — retry once locally, twice in CI.
	retries: process.env.CI ? 2 : 1,
	// Disable UI animations during E2E. The app's transitions (e.g. BottomSheet's
	// fly) are gated on `prefers-reduced-motion`; forcing it 'reduce' makes sheets
	// open instantly so tests don't race the ~250ms animation and click a control
	// that is still mid-flight (and momentarily off-screen).
	use: { reducedMotion: 'reduce', screenshot: 'only-on-failure', trace: 'retain-on-failure' }
});
