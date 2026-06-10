<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import AvatarCropper from '$lib/account/components/AvatarCropper.svelte';
	import { toast } from '$lib/shell/stores/toast';

	let { data, form } = $props();

	const initial = $derived((data.profile.name || '?').slice(0, 1));

	// --- Avatar upload (crop → 512² webp → form action) ---
	let fileInput = $state<HTMLInputElement | null>(null);
	let avatarForm = $state<HTMLFormElement | null>(null);
	let pickedFile = $state<File | null>(null);
	let croppedBlob: Blob | null = null;
	let cropperOpen = $state(false);
	let uploading = $state(false);
	let removing = $state(false);

	const ACCEPT = 'image/jpeg,image/png,image/webp';

	function choosePhoto() {
		fileInput?.click();
	}

	function onPick() {
		const f = fileInput?.files?.[0];
		if (!f) return;
		pickedFile = f;
		cropperOpen = true;
	}

	function onCropped(blob: Blob) {
		croppedBlob = blob;
		cropperOpen = false;
		// Submit the (enhanced) avatar form; the cropped webp is swapped in below.
		avatarForm?.requestSubmit();
	}

	function onCropCancel() {
		cropperOpen = false;
		pickedFile = null;
		if (fileInput) fileInput.value = '';
	}

	// --- Name ---
	let savingName = $state(false);
	const nameError = $derived(form?.nameError ?? '');
</script>

<NavBar title="Profile" back backHref="/trips" />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-6 pb-24 space-y-6">
	<!-- Avatar -->
	<Card>
		<div class="flex flex-col items-center gap-4 p-6">
			<div class="relative">
				{#if uploading || removing}
					<Skeleton width="96px" height="96px" rounded="rounded-full" />
				{:else}
					<Avatar img={data.avatarUrl} {initial} alt={data.profile.name} size={96} />
				{/if}
			</div>

			{#if form?.avatarError}
				<p role="alert" class="text-error-deep text-center text-sm">{form.avatarError}</p>
			{/if}

			<div class="flex items-center gap-2">
				<Button variant="ghost" size="sm" onclick={choosePhoto} disabled={uploading || removing}>
					{data.avatarUrl ? 'Change photo' : 'Add photo'}
				</Button>
				{#if data.avatarUrl}
					<form
						method="POST"
						action="?/removeAvatar"
						use:enhance={() => {
							removing = true;
							return async ({ result, update }) => {
								removing = false;
								if (result.type === 'success') toast.show('Photo removed');
								await update();
							};
						}}
					>
						<Button type="submit" variant="ghost" size="sm" loading={removing}>Remove</Button>
					</form>
				{/if}
			</div>

			<!-- Real form action (progressive enhancement). With JS the file is
			     cropped to a 512² webp and swapped into the payload; without JS the
			     raw picked file posts and PB's mime/size caps gate it. -->
			<form
				bind:this={avatarForm}
				method="POST"
				action="?/updateAvatar"
				enctype="multipart/form-data"
				use:enhance={({ formData }) => {
					if (croppedBlob) formData.set('avatar', croppedBlob, 'avatar.webp');
					uploading = true;
					return async ({ result, update }) => {
						uploading = false;
						croppedBlob = null;
						pickedFile = null;
						if (fileInput) fileInput.value = '';
						if (result.type === 'success') toast.show('Photo updated');
						await update();
					};
				}}
			>
				<input
					bind:this={fileInput}
					type="file"
					name="avatar"
					accept={ACCEPT}
					class="sr-only"
					tabindex="-1"
					onchange={onPick}
				/>
			</form>

			<noscript>
				<form
					method="POST"
					action="?/updateAvatar"
					enctype="multipart/form-data"
					class="flex flex-col items-center gap-2"
				>
					<input type="file" name="avatar" accept={ACCEPT} class="text-sm" />
					<button type="submit" class="text-moss text-sm font-semibold underline">Upload photo</button>
				</form>
			</noscript>

			<p class="text-ink-muted text-center text-[12px]">JPEG, PNG, or WebP · cropped to a circle</p>
		</div>
	</Card>

	<!-- Name -->
	<Card>
		<form
			method="POST"
			action="?/updateName"
			use:enhance={() => {
				savingName = true;
				return async ({ result, update }) => {
					savingName = false;
					if (result.type === 'success') toast.show('Name saved');
					await update({ reset: false });
				};
			}}
			class="space-y-3 p-4"
		>
			<div>
				<label for="name" class="text-ink-soft block text-sm font-medium">Display name</label>
				<input
					type="text"
					id="name"
					name="name"
					required
					maxlength="100"
					value={data.profile.name}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				/>
				<p class="text-ink-muted mt-1 text-[12px]">Shown to people you travel with.</p>
				{#if nameError}
					<p role="alert" class="text-error-deep mt-1 text-[12px]">{nameError}</p>
				{/if}
			</div>
			<div class="flex justify-end">
				<Button type="submit" variant="moss" size="md" loading={savingName}>Save</Button>
			</div>
		</form>
	</Card>
</main>

<BottomSheet bind:open={cropperOpen} title="Position your photo">
	<AvatarCropper file={pickedFile} {onCropped} onCancel={onCropCancel} />
</BottomSheet>
