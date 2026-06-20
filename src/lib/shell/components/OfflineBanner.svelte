<script lang="ts">
	import { online } from '$lib/shell/stores/online';

	// App-wide offline banner (#255). Automatic — keyed off the reactive `online`
	// store (navigator.onLine + online/offline events), no toggle to find. When
	// offline it announces that the trip is a snapshot and roughly how fresh it is;
	// it clears the instant signal returns. Most prominent in Trip Mode, where the
	// trip title is passed in.
	let { tripTitle = '' }: { tripTitle?: string } = $props();

	const isOffline = $derived(!$online);

	// Snapshot freshness = the last moment we had signal (the data on screen is as
	// fresh as that). Stamp it whenever online; freeze it while offline so the
	// "as of" time reflects the snapshot, not the clock. PRD: "the snapshot time is
	// the last successful cache write for the trip" — last-online is its honest,
	// client-observable proxy.
	let lastOnlineAt = $state<number>(Date.now());
	$effect(() => {
		if ($online) lastOnlineAt = Date.now();
	});

	const snapshotTime = $derived(
		new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(lastOnlineAt)
	);

	const label = $derived(
		tripTitle
			? `Offline — showing ${tripTitle} as of ${snapshotTime}`
			: `Offline — showing your trip as of ${snapshotTime}`
	);
</script>

{#if isOffline}
	<div
		class="border-clay/30 bg-clay-tint text-ink flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium"
		role="status"
		aria-live="polite"
		data-testid="offline-banner"
	>
		<svg
			class="text-clay shrink-0"
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
