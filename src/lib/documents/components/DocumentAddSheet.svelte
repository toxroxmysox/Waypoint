<script lang="ts">
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import DocumentUpload from './DocumentUpload.svelte';
	import DocumentPaste from './DocumentPaste.svelte';

	let {
		open = $bindable(false),
		itemOptions = [],
		uploadAction = '?/uploadDocument',
		onUploaded
	}: {
		open?: boolean;
		itemOptions?: { id: string; title: string; type: string }[];
		uploadAction?: string;
		onUploaded?: () => void;
	} = $props();

	// Scope defaults to whole trip from the aggregate (PRD); reassignable to an item.
	let scope = $state('');

	function done() {
		open = false;
		onUploaded?.();
	}
</script>

<BottomSheet bind:open title="Add document">
	<div class="space-y-4">
		<div>
			<label for="doc-scope" class="mb-1 block text-sm font-medium text-ink-soft">Attach to</label>
			<select
				id="doc-scope"
				bind:value={scope}
				class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
			>
				<option value="">Whole trip</option>
				{#each itemOptions as opt (opt.id)}
					<option value={opt.id}>{opt.title}</option>
				{/each}
			</select>
		</div>

		<DocumentUpload
			action={uploadAction}
			itemId={scope}
			label="Choose file"
			hint="PDF or image · up to 20 MB"
			onUploaded={done}
		/>

		<div class="flex items-center gap-3">
			<span class="h-px flex-1 bg-line"></span>
			<span class="text-[12px] text-ink-muted">or</span>
			<span class="h-px flex-1 bg-line"></span>
		</div>

		<DocumentPaste action={uploadAction} itemId={scope} listen={open} onUploaded={done} />
	</div>
</BottomSheet>
