<script lang="ts">
	import BottomNav from '$lib/components/BottomNav.svelte';
	import SideRail from './SideRail.svelte';
	import ContextRail from './ContextRail.svelte';
	import type { Snippet } from 'svelte';
	import type { MemberRole, Phase, Day, Trip } from '$lib/types';

	let {
		children,
		slug,
		role = '',
		trip,
		phases = [],
		days = []
	}: {
		children: Snippet;
		slug: string;
		role?: MemberRole | string;
		trip?: Trip;
		phases?: Phase[];
		days?: Day[];
	} = $props();
</script>

<!-- Mobile: content + bottom nav -->
<div class="md-desktop:hidden">
	{@render children()}
	<BottomNav {slug} {role} />
	<div class="h-16"></div>
</div>

<!-- Desktop: side rail + content + context rail -->
<div class="hidden md-desktop:block">
	<SideRail {slug} {role} tripName={trip?.title ?? ''} {phases} />
	<div class="md-desktop:ml-[72px] lg-desktop:ml-[240px] lg-desktop:mr-[320px]">
		{@render children()}
	</div>
	<ContextRail {slug} {trip} {phases} {days} />
</div>
