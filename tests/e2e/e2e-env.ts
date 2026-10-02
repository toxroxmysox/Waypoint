// #384 — where the suite points, from ONE source, so two worktrees can verify
// at the same time. scripts/e2e-isolated.sh derives E2E_PORT (and the PB port
// and data dir) from E2E_SLOT; playwright.config.ts serves the preview there.
// Default slot 0 = the historical :4173.
export const E2E_PORT = Number(process.env.E2E_PORT ?? 4173);
export const E2E_BASE = process.env.E2E_BASE_URL ?? `http://localhost:${E2E_PORT}`;
