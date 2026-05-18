<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let show = $state(false);
	let isIOS = $state(false);
	let deferredPrompt: Event | null = null;

	const STORAGE_KEY = 'waypoint-a2hs-dismissed';
	const DISMISS_DAYS = 30;

	onMount(() => {
		// Check if already installed as PWA
		if (window.matchMedia('(display-mode: standalone)').matches) return;

		// Check if dismissed recently
		const dismissed = localStorage.getItem(STORAGE_KEY);
		if (dismissed) {
			const dismissedAt = parseInt(dismissed, 10);
			if (Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
		}

		// Detect iOS Safari
		const ua = navigator.userAgent;
		const isIOSSafari = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
		if (isIOSSafari) {
			isIOS = true;
			show = true;
			return;
		}

		// Android: listen for beforeinstallprompt
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			deferredPrompt = e;
			show = true;
		});
	});

	function dismiss() {
		localStorage.setItem(STORAGE_KEY, Date.now().toString());
		show = false;
	}

	async function installAndroid() {
		if (!deferredPrompt) return;
		(deferredPrompt as any).prompt();
		const result = await (deferredPrompt as any).userChoice;
		if (result.outcome === 'accepted') {
			show = false;
		}
		deferredPrompt = null;
	}
</script>

{#if show}
	<div class="border-moss/30 bg-moss-tint mx-4 mt-2 rounded-lg border p-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p class="text-ink text-sm font-semibold">Add Waypoint to Home Screen</p>
				{#if isIOS}
					<p class="text-ink-muted mt-1 text-xs">
						Tap the Share button
						<svg class="inline-block align-text-bottom" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
							<polyline points="16 6 12 2 8 6" />
							<line x1="12" y1="2" x2="12" y2="15" />
						</svg>
						then "Add to Home Screen" for the best experience.
					</p>
				{:else}
					<p class="text-ink-muted mt-1 text-xs">Get quick access and offline support.</p>
					<Button onclick={installAndroid} variant="moss" size="sm" class="mt-2">Install</Button>
				{/if}
			</div>
			<button onclick={dismiss} class="text-ink-muted hover:text-ink-soft shrink-0 p-1" aria-label="Dismiss">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
	</div>
{/if}
