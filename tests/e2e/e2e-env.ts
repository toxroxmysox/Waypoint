// #384 — where the suite points, from ONE source, so two worktrees can verify
// at the same time. E2E_SLOT=N (one per worktree) offsets the preview port;
// scripts/e2e-isolated.sh offsets the PB port + data dir the same way. An
// explicit E2E_PORT / E2E_BASE_URL wins. Default slot 0 = the historical :4173.
//
// Functions, not constants: playwright.config.ts must read these AFTER it loads
// .env.local (ESM imports are evaluated before the config body runs).
export function e2ePort(): number {
	return Number(process.env.E2E_PORT ?? 4173 + Number(process.env.E2E_SLOT ?? 0));
}

export function e2eBase(): string {
	return process.env.E2E_BASE_URL ?? `http://localhost:${e2ePort()}`;
}

/** For specs: worker processes inherit the env the config resolved. */
export const E2E_BASE = e2eBase();
