<script lang="ts">
	import { page } from '$app/state';
	import { online } from '$lib/shell/stores/online';
	import { cachedAt, formatAsOf } from '$lib/offline/snapshot-time';

	// App-wide offline banner (#255). Automatic — keyed off the reactive `online`
	// store (navigator.onLine + online/offline events + the SW's weak-signal
	// report, #533), no toggle to find. When
	// offline it announces that the trip is a snapshot and how fresh it is;
	// it clears the instant signal returns. Most prominent in Trip Mode, where the
	// trip title is passed in.
	let { tripTitle = '' }: { tripTitle?: string } = $props();

	const isOffline = $derived(!$online);

	// Snapshot freshness (#534) = when the cached copy on screen was fetched, read
	// from the Cache API so it survives a cold launch. Unknown (served the shell,
	// no Cache API) → no time at all rather than a wrong one.
	let savedAt = $state<number | null>(null);
	$effect(() => {
		if (!isOffline) return;
		const url = page.url;
		let stale = false;
		cachedAt(url).then((t) => {
			if (!stale) savedAt = t;
		});
		return () => {
			stale = true;
		};
	});

	const asOf = $derived(formatAsOf(savedAt, Date.now()));
	const label = $derived(
		asOf
			? `Offline — showing ${tripTitle || 'your trip'} as of ${asOf}`
			: `Offline — showing ${tripTitle ? `a saved copy of ${tripTitle}` : 'your saved trip'}`
	);
</script>

{#if isOffline}
	<div
		class="flex items-center gap-2.5 border-clay/30 bg-clay-tint px-4 py-2.5 text-sm font-medium text-ink"
		role="status"
		aria-live="polite"
		data-testid="offline-banner"
	>
		<svg
			class="shrink-0 text-clay"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<line x1="1" y1="1" x2="23" y2="23" />
			<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
			<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
			<path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
			<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
			<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
			<line x1="12" y1="20" x2="12.01" y2="20" />
		</svg>
		<span class="min-w-0">{label}</span>
	</div>
{/if}
