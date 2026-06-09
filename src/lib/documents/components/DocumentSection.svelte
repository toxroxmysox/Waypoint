<script lang="ts">
	import Card from '$lib/ui/Card.svelte';
	import SectionH from '$lib/ui/SectionH.svelte';
	import DocumentRow from './DocumentRow.svelte';
	import DocumentUpload from './DocumentUpload.svelte';
	import DocumentPaste from './DocumentPaste.svelte';
	import DocumentLightbox from './DocumentLightbox.svelte';
	import type { DocumentView } from '$lib/documents/types';

	let {
		docs,
		itemId,
		membershipId,
		role,
		canUpload = true,
		uploadAction = '?/uploadDocument',
		deleteAction = '?/deleteDocument'
	}: {
		docs: DocumentView[];
		itemId: string;
		membershipId: string;
		role: string;
		canUpload?: boolean;
		uploadAction?: string;
		deleteAction?: string;
	} = $props();

	const privileged = $derived(role === 'owner' || role === 'co_owner');
	function canDelete(doc: DocumentView): boolean {
		return privileged || doc.uploaded_by === membershipId;
	}

	let activeDoc = $state<DocumentView | null>(null);
</script>

<Card>
	<div class="space-y-3 p-4">
		<SectionH>
			{#snippet right()}
				{#if docs.length > 0}
					<span class="text-ink-muted font-mono text-xs tabular-nums">{docs.length}</span>
				{/if}
			{/snippet}
			Documents
		</SectionH>

		{#if docs.length === 0}
			<div class="py-6 text-center">
				<div class="text-ink-muted mx-auto mb-2 flex h-10 w-10 items-center justify-center">
					<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
					</svg>
				</div>
				<p class="font-display text-ink-soft text-sm italic">No documents yet.</p>
				<p class="text-ink-muted mt-1 text-[12px]">Add a boarding pass, ticket, or confirmation.</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each docs as doc (doc.id)}
					<DocumentRow
						{doc}
						canDelete={canDelete(doc)}
						{deleteAction}
						onView={(d) => (activeDoc = d)}
					/>
				{/each}
			</div>
		{/if}

		{#if canUpload}
			<div class="space-y-2">
				<DocumentUpload
					action={uploadAction}
					{itemId}
					label="Upload"
					hint="PDF or image · up to 20 MB"
				/>
				<DocumentPaste action={uploadAction} {itemId} />
			</div>
		{/if}
	</div>
</Card>

<DocumentLightbox bind:doc={activeDoc} />
