<script lang="ts">
	import BottomNav from '$lib/components/BottomNav.svelte';
	import SideRail from './SideRail.svelte';
	import type { Snippet } from 'svelte';
	import type { MemberRole } from '$lib/types';

	let {
		children,
		slug,
		role = ''
	}: {
		children: Snippet;
		slug: string;
		role?: MemberRole | string;
	} = $props();
</script>

<!-- Mobile: content + bottom nav -->
<div class="md-desktop:hidden">
	{@render children()}
	<BottomNav {slug} {role} />
	<div class="h-16"></div>
</div>

<!-- Desktop: side rail + content -->
<div class="hidden md-desktop:block">
	<SideRail {slug} {role} />
	<div class="ml-[72px]">
		{@render children()}
	</div>
</div>
