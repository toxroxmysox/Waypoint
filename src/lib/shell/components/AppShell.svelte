<script lang="ts">
	import BottomNav from '$lib/shell/components/BottomNav.svelte';
	import SideRail from './SideRail.svelte';
	import ContextRail from './ContextRail.svelte';
	import ModePill from './ModePill.svelte';
	import type { Snippet } from 'svelte';
	import type { MemberRole, Phase, Day, Trip, Item } from '$lib/types';
	import { isTripActive } from '$lib/trip-mode/activation';
	import type { TripViewMode } from '$lib/trip-mode/activation';
	import { getNavConfig } from '$lib/shell/nav-tabs';

	let {
		children,
		slug,
		role = '',
		trip,
		phases = [],
		days = [],
		parkingLotItems = []
	}: {
		children: Snippet;
		slug: string;
		role?: MemberRole | string;
		trip?: Trip;
		phases?: Phase[];
		days?: Day[];
		parkingLotItems?: Item[];
	} = $props();

	const active = $derived(trip ? isTripActive(trip) : false);
	const defaultMode: TripViewMode = $derived(active ? 'trip' : 'planning');

	let userOverride = $state<TripViewMode | null>(null);

	const mode: TripViewMode = $derived(active ? (userOverride ?? defaultMode) : 'planning');

	$effect(() => {
		if (!active) userOverride = null;
	});

	const navConfig = $derived(getNavConfig(slug, mode));

	function toggleMode() {
		userOverride = mode === 'trip' ? 'planning' : 'trip';
	}
</script>

<!-- Mobile: content + bottom nav -->
<div class="md-desktop:hidden">
	{#if active}
		<div class="px-4 pt-3 pb-1">
			<ModePill {mode} onToggle={toggleMode} />
		</div>
	{/if}
	{@render children()}
	<BottomNav config={navConfig} />
	<div class="h-16"></div>
</div>

<!-- Desktop: side rail + content + context rail -->
<div class="hidden md-desktop:block">
	<SideRail
		{slug}
		{role}
		tripName={trip?.title ?? ''}
		{phases}
		config={navConfig}
		{active}
		onToggleMode={toggleMode}
		{mode}
	/>
	<div class="md-desktop:ml-[72px] lg-desktop:ml-[240px] lg-desktop:mr-[320px]">
		{@render children()}
	</div>
	<ContextRail {slug} {trip} {phases} {days} {parkingLotItems} />
</div>
