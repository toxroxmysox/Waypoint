<script lang="ts">
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	const isOwnerOrCoOwner = $derived(
		data.membership.role === 'owner' || data.membership.role === 'co_owner'
	);

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));
	let offlineEnabled = $state(false);

	$effect(() => {
		offlineEnabled = typeof localStorage !== 'undefined' && localStorage.getItem('waypoint-offline') === 'true';
	});
</script>

<NavBar
	title={data.trip.title}
	subtitle={data.trip.location_summary || undefined}
	subtitleStyle="tagline"
	back
	backHref="/trips"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 space-y-2">
	{#if isOwnerOrCoOwner}
		<Card href="/trips/{data.trip.slug}/inbox">
			<div class="flex items-center gap-3 p-4">
				<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
					<path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
				</svg>
				<div class="min-w-0 flex-1">
					<p class="text-ink text-sm font-semibold">Inbox</p>
					<p class="text-ink-muted text-[12px]">Review suggestions from travelers</p>
				</div>
				<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="m9 18 6-6-6-6" />
				</svg>
			</div>
		</Card>
	{/if}

	{#if isOwnerOrCoOwner}
		<Card href="/trips/{data.trip.slug}/closeout">
			<div class="flex items-center gap-3 p-4">
				<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9 11l3 3L22 4" />
					<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
				</svg>
				<div class="min-w-0 flex-1">
					<p class="text-ink text-sm font-semibold">Closeout</p>
					<p class="text-ink-muted text-[12px]">Review each day and archive the trip</p>
				</div>
				<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="m9 18 6-6-6-6" />
				</svg>
			</div>
		</Card>
	{/if}

	<Card href="/trips/{data.trip.slug}/settings">
		<div class="flex items-center gap-3 p-4">
			<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="3" />
				<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
			</svg>
			<div class="min-w-0 flex-1">
				<p class="text-ink text-sm font-semibold">Settings</p>
				<p class="text-ink-muted text-[12px]">Trip details, slug, auto-approve, danger zone</p>
			</div>
			<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="m9 18 6-6-6-6" />
			</svg>
		</div>
	</Card>

	<Card href="/trips/{data.trip.slug}/vault">
		<div class="flex items-center gap-3 p-4">
			<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
				<path d="M7 11V7a5 5 0 0 1 10 0v4" />
			</svg>
			<div class="min-w-0 flex-1">
				<p class="text-ink text-sm font-semibold">Vault</p>
				<p class="text-ink-muted text-[12px]">Encrypted trip documents</p>
			</div>
			<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="m9 18 6-6-6-6" />
			</svg>
		</div>
	</Card>

	{#if isOwnerOrCoOwner}
		<Card href="/trips/{data.trip.slug}/clone">
			<div class="flex items-center gap-3 p-4">
				<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
					<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
				</svg>
				<div class="min-w-0 flex-1">
					<p class="text-ink text-sm font-semibold">Clone trip</p>
					<p class="text-ink-muted text-[12px]">Create a new trip based on this one</p>
				</div>
				<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="m9 18 6-6-6-6" />
				</svg>
			</div>
		</Card>
	{/if}

	<Card href="/trips/{data.trip.slug}/parking-lot">
		<div class="flex items-center gap-3 p-4">
			<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="10" />
				<path d="M8 12h4c1.1 0 2-.9 2-2s-.9-2-2-2H8v8" />
			</svg>
			<div class="min-w-0 flex-1">
				<p class="text-ink text-sm font-semibold">Parking lot</p>
				<p class="text-ink-muted text-[12px]">Alternate and considered items</p>
			</div>
			<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="m9 18 6-6-6-6" />
			</svg>
		</div>
	</Card>

	<Card>
		<a
			href="/trips/{data.trip.slug}/export"
			download
			class="flex items-center gap-3 p-4"
		>
			<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" y1="15" x2="12" y2="3" />
			</svg>
			<div class="min-w-0 flex-1">
				<p class="text-ink text-sm font-semibold">Export</p>
				<p class="text-ink-muted text-[12px]">Download trip as JSON backup</p>
			</div>
			<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="m9 18 6-6-6-6" />
			</svg>
		</a>
	</Card>

	<Card>
		<button
			type="button"
			onclick={() => window.print()}
			class="flex w-full items-center gap-3 p-4"
		>
			<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="6 9 6 2 18 2 18 9" />
				<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
				<rect x="6" y="14" width="12" height="8" />
			</svg>
			<div class="min-w-0 flex-1 text-left">
				<p class="text-ink text-sm font-semibold">Print itinerary</p>
				<p class="text-ink-muted text-[12px]">Print-friendly view of your trip</p>
			</div>
		</button>
	</Card>

	<Card>
		<button
			type="button"
			onclick={() => {
				const current = localStorage.getItem('waypoint-offline') === 'true';
				const next = !current;
				localStorage.setItem('waypoint-offline', String(next));
				if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
					navigator.serviceWorker.controller.postMessage({ type: 'SET_OFFLINE', offline: next });
				}
				window.location.reload();
			}}
			class="flex w-full items-center gap-3 p-4"
		>
			<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<line x1="1" y1="1" x2="23" y2="23" />
				<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
				<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
				<path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
				<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
				<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
				<line x1="12" y1="20" x2="12.01" y2="20" />
			</svg>
			<div class="min-w-0 flex-1 text-left">
				<p class="text-ink text-sm font-semibold">Offline mode</p>
				<p class="text-ink-muted text-[12px]">{offlineEnabled ? 'Currently on — using cached data' : 'Toggle offline to use cached trip data'}</p>
			</div>
			{#if offlineEnabled}
				<span class="bg-gold-tint text-gold shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">On</span>
			{/if}
		</button>
	</Card>
</main>
