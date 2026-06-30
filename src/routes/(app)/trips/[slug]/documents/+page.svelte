<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import NavBar from '$lib/ui/NavBar.svelte';
	import TypeIcon from '$lib/ui/TypeIcon.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import DocumentRow from '$lib/documents/components/DocumentRow.svelte';
	import CodeChip from '$lib/documents/components/CodeChip.svelte';
	import DocumentLightbox from '$lib/documents/components/DocumentLightbox.svelte';
	import DocumentAddSheet from '$lib/documents/components/DocumentAddSheet.svelte';
	import { groupDocuments } from '$lib/documents/grouping';
	import { isRenderableImage } from '$lib/documents/files';
	import { precacheDocuments } from '$lib/documents/offline-cache';
	import { isTripActive } from '$lib/trip-mode/activation';
	import type { DocumentView } from '$lib/documents/types';

	let { data, form } = $props();

	const groups = $derived(groupDocuments(data.documents));
	const total = $derived(data.documents.length);
	// Confirmation codes surface even for items with no uploaded file (#205), so the
	// page is "empty" only when there are neither documents nor codes.
	const itemCodes = $derived(data.itemCodes ?? []);
	const isEmpty = $derived(total === 0 && itemCodes.length === 0);
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

	// Active trip → precache every document's bytes while the user (presumably)
	// still has signal (PRD: automatic precache, no manual pin). Each href is
	// requested once; new uploads are picked up as the list grows.
	const requested = new Set<string>();
	$effect(() => {
		if (!onTrip) return;
		const fresh = data.documents.map((d) => d.file_href).filter((u) => !requested.has(u));
		if (!fresh.length) return;
		fresh.forEach((u) => requested.add(u));
		precacheDocuments(fresh);
	});

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

<!-- Back stays INSIDE the trip (#197 B-012) — never abandon to the all-trips list. -->
<NavBar title="Documents" subtitle="{total} {total === 1 ? 'file' : 'files'} · {data.trip.title}" back backHref="/trips/{data.trip.slug}">
	{#snippet right()}
		{#if onTrip}
			<span class="bg-clay-tint text-clay rounded-full px-2.5 py-1 text-[11px] font-semibold">On trip</span>
		{/if}
	{/snippet}
</NavBar>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-24">
	{#if isEmpty}
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
			<!-- #205 — Confirmation codes live on the item, not the file. Surface every
			     code-bearing item here (even ones with no uploaded document) so a member
			     finds "the hotel code" in Docs without hunting through item detail. Read-only;
			     tap the item to edit. -->
			{#if itemCodes.length > 0}
				<section>
					<div class="mb-3 flex items-center gap-2.5">
						<span class="bg-gold-tint text-gold flex h-7 w-7 items-center justify-center rounded-full">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<circle cx="7.5" cy="15.5" r="5.5" />
								<path d="m21 2-9.6 9.6" />
								<path d="m15.5 7.5 3 3L22 7l-3-3" />
							</svg>
						</span>
						<h2 class="text-ink text-sm font-semibold">Confirmation codes</h2>
						<span class="text-ink-muted font-mono text-xs tabular-nums">{itemCodes.length}</span>
						<span class="bg-line h-px flex-1"></span>
					</div>
					<div class="space-y-2">
						{#each itemCodes as entry (entry.item_id)}
							<div class="border-line bg-surface rounded-lg border p-3">
								<a
									href="/trips/{data.trip.slug}/items/{entry.item_id}"
									class="text-ink hover:text-moss mb-2 flex items-center gap-2 text-sm font-medium"
								>
									<TypeIcon type={entry.item_type} size={22} />
									<span class="truncate">{entry.item_title}</span>
								</a>
								<!-- #268 slice 2b — each code is a distinct copyable chip, not a
								     file card. Tap to copy the value (toast confirms). No attribution. -->
								<div class="flex flex-wrap gap-2">
									{#each entry.codes as code}
										<CodeChip {code} />
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
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
