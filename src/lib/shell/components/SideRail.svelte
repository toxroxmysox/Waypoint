<script lang="ts">
	import { page } from '$app/state';
	import type { Phase } from '$lib/types';
	import StarIcons from '$lib/ui/StarIcons.svelte';
	import { getActiveTab } from '$lib/shell/nav-tabs';
	import type { NavConfig } from '$lib/shell/nav-tabs';
	import type { TripViewMode } from '$lib/trip-mode/activation';
	import { formatTripDate } from '$lib/shell/trip-nav';

	let {
		slug,
		role = '',
		tripName = '',
		phases = [],
		config,
		active = false,
		onToggleMode,
		mode = 'planning',
		onAction
	}: {
		slug: string;
		role?: string;
		tripName?: string;
		phases?: Phase[];
		config: NavConfig;
		active?: boolean;
		onToggleMode?: () => void;
		mode?: TripViewMode;
		onAction?: (action: string) => void;
	} = $props();

	const activeTabId = $derived(getActiveTab(page.url.pathname, config.chrome));
</script>

<nav
	class="border-line bg-surface fixed left-0 top-0 hidden h-full flex-col border-r
		md-desktop:flex md-desktop:w-[72px] md-desktop:items-center
		lg-desktop:w-[240px] lg-desktop:items-stretch"
	aria-label="Trip navigation"
>
	<!-- Logo -->
	<a
		href="/trips"
		class="font-display text-moss flex items-center gap-2 font-semibold
			md-desktop:justify-center md-desktop:py-5
			lg-desktop:justify-start lg-desktop:px-5 lg-desktop:py-4"
	>
		<span class="text-lg">W</span>
		<span class="hidden text-sm tracking-tight lg-desktop:inline">Waypoint</span>
	</a>

	<!-- Trip name -->
	{#if tripName}
		<div class="border-line hidden border-b pb-3 lg-desktop:block lg-desktop:px-5 lg-desktop:text-left">
			<p
				class="text-ink-soft truncate text-xs font-medium"
				title={tripName}
			>
				{tripName}
			</p>
		</div>
	{/if}

	<!-- Mode toggle (when active). Full pill at lg-desktop; an icon-sized variant
	     fills the 72px md-desktop rail so 900–1279px isn't locked into Trip Mode
	     with no "Edit plan" (#168). -->
	{#if active && onToggleMode}
		{@const toLabel = mode === 'trip' ? 'Edit plan' : 'Trip view'}
		{@const toIcon = mode === 'trip' ? 'calendar' : 'clock'}
		{@const tint = mode === 'trip'
			? 'bg-moss-tint text-moss hover:bg-moss-tint/80'
			: 'bg-clay-tint text-clay hover:bg-clay-tint/80'}
		<!-- md-desktop: icon button -->
		<div class="flex justify-center px-2 pt-3 lg-desktop:hidden">
			<button
				onclick={onToggleMode}
				aria-label={toLabel}
				title={toLabel}
				class="flex h-12 w-12 items-center justify-center rounded-full transition-colors {tint}"
			>
				<StarIcons name={toIcon} size={20} />
			</button>
		</div>
		<!-- lg-desktop: full pill -->
		<div class="hidden lg-desktop:flex justify-center px-3 pt-3">
			<button
				onclick={onToggleMode}
				class="w-full rounded-full px-3 py-1.5 text-xs font-medium transition-colors {tint}"
			>
				{toLabel}
			</button>
		</div>
	{/if}

	<!-- Nav tabs -->
	<div class="flex flex-1 flex-col gap-1 px-2 pt-3 lg-desktop:px-3">
		{#each config.tabs as tab}
			{@const isActive = activeTabId === tab.id}
			{@const activeClasses = config.accent === 'clay'
				? 'bg-clay-tint text-clay font-medium'
				: 'bg-moss-tint text-moss font-medium'}
			{#if tab.oversized && tab.action}
				<button
					type="button"
					class="flex items-center gap-3 rounded-lg transition-colors
						md-desktop:w-12 md-desktop:flex-col md-desktop:justify-center md-desktop:gap-0.5 md-desktop:px-1 md-desktop:py-2.5 md-desktop:text-[11px]
						lg-desktop:w-auto lg-desktop:flex-row lg-desktop:justify-start lg-desktop:px-3 lg-desktop:py-2 lg-desktop:text-sm
						bg-clay text-white font-medium"
					aria-label={tab.label}
					onclick={() => onAction?.(tab.action!)}
				>
					<StarIcons
						name={tab.icon}
						size={18}
						class="shrink-0 md-desktop:h-5 md-desktop:w-5 lg-desktop:h-[18px] lg-desktop:w-[18px]"
					/>
					<span class="md-desktop:block lg-desktop:block">{tab.label}</span>
				</button>
			{:else if tab.oversized}
				<a
					href={tab.href}
					class="flex items-center gap-3 rounded-lg transition-colors
						md-desktop:w-12 md-desktop:flex-col md-desktop:justify-center md-desktop:gap-0.5 md-desktop:px-1 md-desktop:py-2.5 md-desktop:text-[11px]
						lg-desktop:w-auto lg-desktop:flex-row lg-desktop:justify-start lg-desktop:px-3 lg-desktop:py-2 lg-desktop:text-sm
						bg-clay text-white font-medium"
					aria-label={tab.label}
				>
					<StarIcons
						name={tab.icon}
						size={18}
						class="shrink-0 md-desktop:h-5 md-desktop:w-5 lg-desktop:h-[18px] lg-desktop:w-[18px]"
					/>
					<span class="md-desktop:block lg-desktop:block">{tab.label}</span>
				</a>
			{:else}
				<a
					href={tab.href}
					class="flex items-center gap-3 rounded-lg transition-colors
						md-desktop:w-12 md-desktop:flex-col md-desktop:justify-center md-desktop:gap-0.5 md-desktop:px-1 md-desktop:py-2.5 md-desktop:text-[11px]
						lg-desktop:w-auto lg-desktop:flex-row lg-desktop:justify-start lg-desktop:px-3 lg-desktop:py-2 lg-desktop:text-sm
						{isActive
							? activeClasses
							: 'text-ink-muted hover:bg-paper hover:text-ink-soft'}"
					aria-current={isActive ? 'page' : undefined}
				>
					<StarIcons
						name={tab.icon}
						size={18}
						class="shrink-0 md-desktop:h-5 md-desktop:w-5 lg-desktop:h-[18px] lg-desktop:w-[18px]"
					/>
					<span class="md-desktop:block lg-desktop:block">{tab.label}</span>
				</a>
			{/if}
		{/each}
	</div>

	<!-- Phase list (lg-desktop only, planning mode only) -->
	{#if phases.length > 0 && mode === 'planning'}
		<div class="border-line hidden flex-col gap-1 border-t px-3 py-3 lg-desktop:flex">
			<p class="text-ink-muted mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider">Phases</p>
			{#each phases as phase}
				<a
					href="/trips/{slug}/phases/{phase.id}"
					class="text-ink-soft hover:text-ink flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-paper"
				>
					<span
						class="h-2.5 w-2.5 shrink-0 rounded-full"
						style="background-color: var(--color-moss)"
					></span>
					<span class="flex-1 truncate">{phase.name}</span>
					<span class="text-ink-muted text-[11px]">{formatTripDate(phase.start_date)}</span>
				</a>
			{/each}
		</div>
	{/if}
</nav>
