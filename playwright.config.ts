import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

// Match Vite/SvelteKit behavior: auto-load .env.local so tests see
// WAYPOINT_DEV_MODE and E2E_TEST_EMAIL without requiring an inline export.
config({ path: '.env.local' });
config({ path: '.env' });

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testMatch: '**/*.spec.{ts,js}',
	testDir: 'tests/e2e'
});
