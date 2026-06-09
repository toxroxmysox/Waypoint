<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import DocumentRow from '$lib/documents/components/DocumentRow.svelte';
	import DocumentLightbox from '$lib/documents/components/DocumentLightbox.svelte';
	import DocumentAddSheet from '$lib/documents/components/DocumentAddSheet.svelte';
	import { groupDocuments } from '$lib/documents/grouping';
	import { isRenderableImage } from '$lib/documents/files';
	import { isTripActive } from '$lib/trip-mode/activation';
	import type { DocumentView } from '$lib/documents/types';

	let { data, form } = $props();

	const groups = $derived(groupDocuments(data.documents));
	const total = $derived(data.documents.length);
	const onTrip = $derived(isTripActive(data.trip));
	const privileged = $derived(data.membership.role === 'owner' || data.membership.role === 'co_owner');

	function canDelete(doc: DocumentView): boolean {
		return privileged || doc.uploaded_by === data.membership.id;
	}

	let addOpen = $state(false);

	// Lightbox swipes within a single group's renderable images (PRD: "swipe
	// through an item's images").
	let lightboxGallery = $state<DocumentView[]>([]);
	let lightboxIndex = $state<number | null>(null);
	function openLightbox(groupDocs: DocumentView[], doc: DocumentView) {
		const renderable = groupDocs.filter((d) => isRenderableImage(d.file));
		const i = renderable.indexOf(doc);
		if (i < 0) return;
		lightboxGallery = renderable;
		lightboxIndex = i;
	}

	// The Trip Mode central Add navigates here with ?action=add — open the sheet
	// and strip the param so a refresh doesn't reopen it.
	$effect(() => {
		if (page.url.searchParams.get('action') === 'add') {
			addOpen = true;
			const url = new URL(page.url);
			url.searchParams.delete('action');
			replaceState(url, page.state);
		}
	});
</script>

<NavBar title="Documents" subtitle="{total} {total === 1 ? 'file' : 'files'} · {data.trip.title}" back backHref="/trips">
	{#snippet right()}
		{#if onTrip}
			<span class="bg-clay-tint text-clay rounded-full px-2.5 py-1 text-[11px] font-semibold">On trip</span>
		{/if}
	{/snippet}
</NavBar>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-24">
	{#if total === 0}
		<div class="flex flex-col items-center justify-center py-20 text-center">
			<div class="text-ink-muted mb-3">
				<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
				</svg>
			</div>
			<p class="font-display text-ink-soft text-base italic">No documents yet.</p>
			<p class="text-ink-muted mt-1 text-sm">Boarding passes, tickets, and confirmations land here.</p>
		</div>
	{:else}
		<div class="space-y-7">
			{#each groups as group (group.key)}
				<section>
					<!-- Group header: round badge + label + mono count + hairline rule. -->
					<div class="mb-3 flex items-center gap-2.5">
						{#if group.type}
							<TypeIcon type={group.type} size={28} />
						{:else}
							<span class="bg-moss-tint text-moss flex h-7 w-7 items-center justify-center rounded-full">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
									<circle cx="12" cy="12" r="9" />
									<path d="M12 7v5l3 2" />
								</svg>
							</span>
						{/if}
						<h2 class="text-ink text-sm font-semibold">{group.label}</h2>
						<span class="text-ink-muted font-mono text-xs tabular-nums">{group.docs.length}</span>
						<span class="bg-line h-px flex-1"></span>
					</div>

					<div class="space-y-2">
						{#each group.docs as doc (doc.id)}
							<DocumentRow
								{doc}
								canDelete={canDelete(doc)}
								showItemName={group.key !== 'trip'}
								onView={(d) => openLightbox(group.docs, d)}
							/>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}

	{#if form?.uploadError}
		<p class="text-clay mt-4 text-center text-sm">{form.uploadError}</p>
	{/if}
</main>

<!-- Planning reuses the FAB; Trip Mode uses the central nav Add (PRD D4). -->
{#if !onTrip}
	<FAB onclick={() => (addOpen = true)} label="Add document" />
{/if}

<DocumentAddSheet bind:open={addOpen} itemOptions={data.itemOptions} />

<DocumentLightbox bind:index={lightboxIndex} gallery={lightboxGallery} canDelete={canDelete} />
