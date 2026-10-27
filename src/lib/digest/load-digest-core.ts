// #542 — Vitest access to the REAL digest module, backend/pb_hooks/digest-core.js.
//
// The repo is "type": "module", so node refuses to require() the CommonJS
// hook file. Evaluate it the way PB's goja require() does: wrap in a CJS
// module shim. (Renaming to .cjs would desync it from the goja-verified path.)
// Untyped on purpose — the hook file is plain JS.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const corePath = join(
	dirname(fileURLToPath(import.meta.url)),
	'../../../backend/pb_hooks/digest-core.js'
);
const coreModule: { exports: unknown } = { exports: {} };
new Function('module', 'exports', readFileSync(corePath, 'utf8'))(coreModule, coreModule.exports);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const core: any = coreModule.exports;
