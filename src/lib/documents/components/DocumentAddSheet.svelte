<script lang="ts">
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import DocumentUpload from './DocumentUpload.svelte';

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
			<label for="doc-scope" class="text-ink-soft mb-1 block text-sm font-medium">Attach to</label>
			<select
				id="doc-scope"
				bind:value={scope}
				class="border-line bg-surface text-ink w-full rounded-md border px-3 py-2 text-sm"
			>
				<option value="">Whole trip</option>
				{#each itemOptions as opt}
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
	</div>
</BottomSheet>
