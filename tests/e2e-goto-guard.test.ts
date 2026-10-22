import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #384 — a bare `page.goto(url)` or `page.reload()` resolves on `load`, before
// SvelteKit hydrates. A click on a client-side control in that window is a silent
// no-op, and under parallel workers (slower hydration) that is most of the suite's
// "random" reds. Every app navigation waits for `networkidle` instead. Exempt: the
// dev-login hop (it redirects; specs `waitForURL` after it) and the offline spec (it
// navigates with the network cut on purpose).
const DIR = join(import.meta.dirname, 'e2e');
const EXEMPT_FILES = new Set(['offline-read.spec.ts']);

function bareNavigations(): string[] {
	const hits: string[] = [];
	const files = readdirSync(DIR, { recursive: true, encoding: 'utf8' }).filter(
		(f) => f.endsWith('.ts') && !EXEMPT_FILES.has(f.split('/').pop()!)
	);
	for (const file of files) {
		const lines = readFileSync(join(DIR, file), 'utf8').split('\n');
		lines.forEach((line, i) => {
			const start = line.search(/\.(goto|reload)\(/);
			if (start < 0 || /^\s*\/\//.test(line)) return;
			// The call may span lines (options on the next line or two); stop at its end
			// so a neighbouring call's options can't vouch for this one.
			const rest = [line.slice(start), ...lines.slice(i + 1, i + 5)].join(' ');
			const call = rest.slice(0, rest.indexOf(');') + 1 || rest.length);
			if (/dev\/login/.test(call)) return;
			if (!/waitUntil:\s*['"]networkidle['"]/.test(call)) hits.push(`${file}:${i + 1}`);
		});
	}
	return hits;
}

describe('e2e navigation waits for hydration', () => {
	it('every page.goto / page.reload waits for networkidle', () => {
		expect(bareNavigations()).toEqual([]);
	});
});
