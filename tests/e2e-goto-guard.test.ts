import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #384 — a bare `page.goto(url)` resolves on `load`, before SvelteKit hydrates.
// A click on a client-side control in that window is a silent no-op, and under
// parallel workers (slower hydration) that is most of the suite's "random" reds.
// Every app navigation waits for `networkidle` instead. Exempt: the dev-login
// hop (it redirects; specs `waitForURL` after it) and the offline spec (it
// navigates with the network cut on purpose).
const DIR = join(import.meta.dirname, 'e2e');
const EXEMPT_FILES = new Set(['offline-read.spec.ts']);

function bareGotos(): string[] {
	const hits: string[] = [];
	for (const file of readdirSync(DIR).filter((f) => f.endsWith('.ts') && !EXEMPT_FILES.has(f))) {
		const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
		lines.forEach((line, i) => {
			if (!/\.goto\(/.test(line) || /dev\/login/.test(line)) return;
			// Options may sit on the next line or two (multi-line call).
			const call = lines.slice(i, i + 3).join(' ');
			if (!/waitUntil/.test(call)) hits.push(`${file}:${i + 1}`);
		});
	}
	return hits;
}

describe('e2e navigation waits for hydration', () => {
	it('every page.goto passes a waitUntil', () => {
		expect(bareGotos()).toEqual([]);
	});
});
