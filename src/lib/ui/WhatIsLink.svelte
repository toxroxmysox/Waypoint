<script lang="ts">
	// #406 — "What is this?" on someone else's idea or goal: opens a web search for
	// `what is <title> in <place>` in the browser. Stops pointerdown so a swipe card
	// does not start a drag from it.
	import { whatIsSearchUrl } from '$lib/shell/web-search';

	let { title, place = '', class: klass = '' }: { title: string; place?: string; class?: string } = $props();

	const href = $derived(whatIsSearchUrl(title, place));
</script>

{#if href}
	<a
		{href}
		target="_blank"
		rel="noopener noreferrer"
		onpointerdown={(e) => e.stopPropagation()}
		class="text-ink-soft hover:text-ink active:text-ink pointer-events-auto relative z-10 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold {klass}"
		data-what-is
	>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
		</svg>
		What is this? ↗<span class="sr-only"> (searches the web in a new tab)</span>
	</a>
{/if}
