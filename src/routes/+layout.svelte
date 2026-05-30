<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import A2HSBanner from '$lib/shell/components/A2HSBanner.svelte';
	import Toast from '$lib/ui/Toast.svelte';

	let { children } = $props();
	let routeAnnouncement = $state('');

	let offline = $state(false);

	onMount(() => {
		// Number input scroll prevention
		const handler = (e: WheelEvent) => {
			if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
				e.target.blur();
			}
		};
		document.addEventListener('wheel', handler, { passive: true });

		// Restore offline state from localStorage
		const storedOffline = localStorage.getItem('waypoint-offline');
		if (storedOffline === 'true') {
			offline = true;
			sendOfflineToSW(true);
		}

		// Listen for online/offline events
		window.addEventListener('online', () => {
			if (!offline) sendOfflineToSW(false);
		});
		window.addEventListener('offline', () => {
			sendOfflineToSW(true);
		});

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

	function sendOfflineToSW(value: boolean) {
		if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
			navigator.serviceWorker.controller.postMessage({
				type: 'SET_OFFLINE',
				offline: value
			});
		}
	}

	function toggleOffline() {
		offline = !offline;
		localStorage.setItem('waypoint-offline', String(offline));
		sendOfflineToSW(offline);
	}
</script>

<svelte:head>
	<meta name="theme-color" content="#F6F2EA" />
</svelte:head>

<a href="#main-content" class="skip-link">Skip to content</a>
<div class="sr-only" aria-live="polite" aria-atomic="true">{routeAnnouncement}</div>

{#if offline}
	<div class="bg-clay/90 text-paper px-4 py-1.5 text-center text-xs font-semibold">
		Offline mode
		<button onclick={toggleOffline} class="text-paper/80 hover:text-paper ml-2 underline">Go online</button>
	</div>
{/if}

<A2HSBanner />

{@render children()}

<Toast />
