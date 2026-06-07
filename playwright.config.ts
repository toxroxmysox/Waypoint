import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

// Match Vite/SvelteKit behavior: auto-load .env.local so tests see
// WAYPOINT_DEV_MODE and E2E_TEST_EMAIL without requiring an inline export.
config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testMatch: '**/*.spec.{ts,js}',
	testDir: 'tests/e2e',
	// Disable UI animations during E2E. The app's transitions (e.g. BottomSheet's
	// fly) are gated on `prefers-reduced-motion`; forcing it 'reduce' makes sheets
	// open instantly so tests don't race the ~250ms animation and click a control
	// that is still mid-flight (and momentarily off-screen).
	use: { reducedMotion: 'reduce' }
});
