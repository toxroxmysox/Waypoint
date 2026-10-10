<script lang="ts">
	// "Waypoint 3.0.0" — the app version, from its single source: SvelteKit's
	// `version` is `kit.version.name`, which svelte.config.js reads from
	// package.json (#447). Never hardcode the string.
	import { version } from '$app/environment';
</script>

<p class="text-ink-muted text-center text-[12px]" data-testid="app-version">Waypoint {version}</p>
