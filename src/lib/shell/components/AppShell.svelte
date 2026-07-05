<script lang="ts">
	import BottomNav from '$lib/shell/components/BottomNav.svelte';
	import SideRail from './SideRail.svelte';
	import ContextRail from './ContextRail.svelte';
	import ModePill from './ModePill.svelte';
	import OfflineBanner from './OfflineBanner.svelte';
	import AddSheet from '$lib/trip-mode/components/AddSheet.svelte';
	import type { Snippet } from 'svelte';
	import type { MemberRole, Phase, Day, Trip } from '$lib/types';
	import { isTripActive } from '$lib/trip-mode/activation';
	import type { TripViewMode } from '$lib/trip-mode/activation';
	import { getNavConfig, resolveChromeMode } from '$lib/shell/nav-tabs';
	import { tripToday, tripTz } from '$lib/shell/trip-time';
	import { goto } from '$app/navigation';
	import { markReplaceNavigation } from '$lib/shell/stores/nav-depth';
	import { page } from '$app/state';

	let {
		children,
		slug,
		role = '',
		trip,
		phases = [],
		days = [],
		immersive = false
	}: {
		children: Snippet;
		slug: string;
		role?: MemberRole | string;
		trip?: Trip;
		phases?: Phase[];
		days?: Day[];
		// Full-screen takeover (swipe minigames): the deck owns the screen, app
		// chrome (mode pill, bottom nav, side/context rails) is suppressed.
		immersive?: boolean;
	} = $props();

	const active = $derived(trip ? isTripActive(trip) : false);

	// #270 / ADR-0022 — forming ⇔ start_date empty (PB stores an unset date as
	// ''). Gates the nav to the forming scope: Ideas + Members + Goals + More.
	const forming = $derived(!!trip && !trip.start_date);

	let userOverride = $state<TripViewMode | null>(null);

	// Chrome mode is derived from the URL (SSR-safe $derived, never $effect): a
	// planning surface — including the bare Overview — always renders planning
	// chrome even on an active trip, so the mode pill can't lie (#197 B-011).
	const mode: TripViewMode = $derived(resolveChromeMode(page.url.pathname, active, userOverride));

	$effect(() => {
		if (!active) userOverride = null;
	});

	const navConfig = $derived(getNavConfig(slug, mode, forming));

	function toggleMode() {
		const next: TripViewMode = mode === 'trip' ? 'planning' : 'trip';
		userOverride = next;
		// #80: switching modes must also navigate to that mode's home — Trip view
		// lands on Now, Edit plan lands on the itinerary. Without this the toggle
		// only swapped the nav tabs while leaving the user on the current page.
		// #296: replace (don't push) — a mode switch is a lateral re-frame of the
		// SAME trip, not a drill-down. Pushing stacked a history entry per toggle,
		// so back-button behaviour broke (each switch needed an extra back tap, and
		// back from planning landed in trip mode again). afterNavigate can't see the
		// replaceState flag, so announce it at the call site (ADR-0012 nav-depth).
		markReplaceNavigation();
		goto(next === 'trip' ? `/trips/${slug}/now` : `/trips/${slug}`, { replaceState: true });
	}

	let addSheetOpen = $state(false);

	const todayDayId = $derived.by(() => {
		const todayStr = tripToday(tripTz(trip ?? {}));
		const day = days.find((d) => d.date?.split(/[T ]/)[0] === todayStr);
		return day?.id ?? null;
	});

	function handleNavAction(action: string) {
		if (action === 'add-sheet') addSheetOpen = true;
	}
</script>

{#if immersive}
	<!-- Full-screen takeover (swipe minigames): the deck owns the viewport, no app chrome. -->
	{@render children()}
{:else}
	<!-- Mobile: content + bottom nav -->
	<div
		class="md-desktop:hidden"
		style="--color-accent: {mode === 'trip' ? 'var(--color-clay)' : 'var(--color-moss)'}; --color-accent-tint: {mode === 'trip' ? 'var(--color-clay-tint)' : 'var(--color-moss-tint)'}"
	>
		<!-- Automatic offline banner (#255): self-hides when online; prominent at the
		     top of every trip surface, most so in Trip Mode where the trip title shows. -->
		<OfflineBanner tripTitle={trip?.title ?? ''} />
		{#if active}
			<div class="px-4 pt-3 pb-1">
				<ModePill {mode} onToggle={toggleMode} />
			</div>
		{/if}
		{@render children()}
		<BottomNav config={navConfig} onAction={handleNavAction} />
		<div class="h-16"></div>
	</div>

	<!-- Desktop: side rail + content + context rail -->
	<div
		class="hidden md-desktop:block"
		style="--color-accent: {mode === 'trip' ? 'var(--color-clay)' : 'var(--color-moss)'}; --color-accent-tint: {mode === 'trip' ? 'var(--color-clay-tint)' : 'var(--color-moss-tint)'}"
	>
		<SideRail
			{slug}
			{role}
			tripName={trip?.title ?? ''}
			{phases}
			config={navConfig}
			{active}
			onToggleMode={toggleMode}
			{mode}
			onAction={handleNavAction}
		/>
		<div class="md-desktop:ml-[72px] lg-desktop:ml-[240px] lg-desktop:mr-[320px]">
			<OfflineBanner tripTitle={trip?.title ?? ''} />
			{@render children()}
		</div>
		<ContextRail {slug} {trip} {phases} {days} />
	</div>

	{#if trip}
		<AddSheet bind:open={addSheetOpen} slug={trip.slug} {todayDayId} />
	{/if}
{/if}
