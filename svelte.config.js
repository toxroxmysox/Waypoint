import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-node';

// Single source of the app version: package.json. Bump it per release.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter({ out: 'build' }),
		// SvelteKit's default version name is a per-build timestamp. Pin it to the
		// release version so the service worker's version-namespaced caches
		// (`waypoint-*-${version}`, src/service-worker.ts) roll per release, not per
		// build. Also what `$app/environment`'s `version` returns (the app footer).
		version: { name: version }
	}
};

export default config;
