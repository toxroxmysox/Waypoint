<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import A2HSBanner from '$lib/shell/components/A2HSBanner.svelte';
	import Toast from '$lib/ui/Toast.svelte';

	let { children } = $props();
	let routeAnnouncement = $state('');

	onMount(() => {
		// Number input scroll prevention
		const handler = (e: WheelEvent) => {
			if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
				e.target.blur();
			}
		};
		document.addEventListener('wheel', handler, { passive: true });

		return () => document.removeEventListener('wheel', handler);
	});

	afterNavigate(() => {
		const mainEl = document.querySelector('main');
		if (mainEl) {
			mainEl.id = 'main-content';
			mainEl.tabIndex = -1;
			mainEl.style.outline = 'none';
			mainEl.focus({ preventScroll: true });
		}
		const h1 = document.querySelector('h1');
		routeAnnouncement = h1?.textContent?.trim() || document.title;
	});
</script>

<svelte:head>
	<meta name="theme-color" content="#F6F2EA" />
</svelte:head>

<a href="#main-content" class="skip-link">Skip to content</a>
<div class="sr-only" aria-live="polite" aria-atomic="true">{routeAnnouncement}</div>

<A2HSBanner />

{@render children()}

<Toast />
