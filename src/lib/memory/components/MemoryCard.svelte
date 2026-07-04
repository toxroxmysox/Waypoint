<script lang="ts">
	// A single member's memory for a day — the small review card (#269).
	// Rendered on Trip Mode Today (today's memories from all travelers) and in
	// Closeout's day-by-day walk. A member with no memory that day simply has no
	// card — absence is fine, never a guilt prompt.
	import Avatar from '$lib/ui/Avatar.svelte';
	import { isRenderablePhoto } from '$lib/memory/memory';
	import type { Memory } from '$lib/memory/types';
	import type { MemberWithAvatar } from '$lib/collaboration/member-avatar';

	let {
		memory,
		member = null,
		slug,
		mine = false,
		editable = false,
		onEdit
	}: {
		memory: Memory;
		/** The authoring member (roster row), for name + avatar. Null = departed. */
		member?: MemberWithAvatar | null;
		slug: string;
		/** This is the viewing member's own memory. */
		mine?: boolean;
		/** Capture is open (active/wrap-up trip, non-viewer) — show the edit affordance. */
		editable?: boolean;
		onEdit?: () => void;
	} = $props();

	const name = $derived(
		member ? member.display_name || member.placeholder_name || '?' : 'Former member'
	);
	const photoUrl = $derived(memory.photo ? `/trips/${slug}/memories/${memory.id}/photo` : '');
	const renderable = $derived(isRenderablePhoto(memory.photo));
	// A non-rendering photo (HEIC, v4 caveat) falls back to a download link.
	let imgFailed = $state(false);
</script>

<div class="border-line bg-surface overflow-hidden rounded-xl border">
	{#if photoUrl && renderable && !imgFailed}
		<img
			src={photoUrl}
			alt="{name}’s memory photo"
			loading="lazy"
			class="max-h-64 w-full object-cover"
			onerror={() => (imgFailed = true)}
		/>
	{:else if photoUrl}
		<a
			href="{photoUrl}?download=1"
			class="bg-paper text-ink-muted hover:text-ink flex items-center justify-center gap-2 px-3 py-6 text-xs"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" y1="15" x2="12" y2="3" />
			</svg>
			Photo won’t display here — download it
		</a>
	{/if}
	<div class="flex items-start gap-2.5 px-3 py-2.5">
		{#if member}
			<Avatar initial={name} alt={name} size={24} img={member.avatarUrl || undefined} />
		{:else}
			<Avatar departed alt={name} size={24} />
		{/if}
		<div class="min-w-0 flex-1">
			<p class="text-ink-muted text-[11px] font-medium">
				{mine ? 'You' : name}
			</p>
			{#if memory.thought}
				<p class="text-ink mt-0.5 text-sm leading-snug">{memory.thought}</p>
			{/if}
		</div>
		{#if mine && editable}
			<button
				type="button"
				onclick={() => onEdit?.()}
				class="text-ink-muted hover:text-ink shrink-0 p-1"
				aria-label="Edit your memory"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
				</svg>
			</button>
		{/if}
	</div>
</div>
