<script lang="ts">
	import { enhance } from '$app/forms';
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import Skeleton from '$lib/ui/Skeleton.svelte';
	import AppVersion from '$lib/ui/AppVersion.svelte';
	import BottomSheet from '$lib/ui/BottomSheet.svelte';
	import AvatarCropper from '$lib/account/components/AvatarCropper.svelte';
	import ConnectedApps from '$lib/account/components/ConnectedApps.svelte';
	import { toast } from '$lib/shell/stores/toast';
	import { untrack } from 'svelte';

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

	// --- #510 link defaults ---
	let savingLinks = $state(false);
	let searchEngine = $state(untrack(() => data.linkDefaults.search_engine));
	let mapsApp = $state(untrack(() => data.linkDefaults.maps_app));

	// --- #523 daily trip emails. Client-owned + bound: an unbound `checked`
	// re-syncs on any effect re-run and silently reverts a tap (#272 scar).
	let savingEmails = $state(false);
	let emailOn = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(data.tripEmails.map((t) => [t.id, t.on])))
	);
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

	<!-- #510 — where links open -->
	<Card>
		<form
			method="POST"
			action="?/updateLinkDefaults"
			use:enhance={() => {
				savingLinks = true;
				return async ({ result, update }) => {
					savingLinks = false;
					if (result.type === 'success') toast.show('Defaults saved');
					await update({ reset: false });
				};
			}}
			class="space-y-3 p-4"
		>
			<h2 class="text-ink text-sm font-semibold">Open links in</h2>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="search_engine" class="text-ink-soft block text-sm font-medium">Web search</label>
					<select
						id="search_engine"
						name="search_engine"
						bind:value={searchEngine}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					>
						<option value="google">Google</option>
						<option value="duckduckgo">DuckDuckGo</option>
					</select>
				</div>
				<div>
					<label for="maps_app" class="text-ink-soft block text-sm font-medium">Maps</label>
					<select
						id="maps_app"
						name="maps_app"
						bind:value={mapsApp}
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					>
						<option value="google">Google Maps</option>
						<option value="apple">Apple Maps</option>
					</select>
				</div>
			</div>
			{#if form?.linkDefaultsError}
				<p role="alert" class="text-error-deep text-[12px]">{form.linkDefaultsError}</p>
			{/if}
			<div class="flex justify-end">
				<Button type="submit" variant="ghost" size="sm" loading={savingLinks}>Save</Button>
			</div>
		</form>
	</Card>

	<!-- #523 — daily trip emails, one toggle per trip -->
	<Card>
		<form
			method="POST"
			action="?/updateTripEmails"
			use:enhance={() => {
				savingEmails = true;
				return async ({ result, update }) => {
					savingEmails = false;
					if (result.type === 'success') toast.show('Email preferences saved');
					await update({ reset: false });
				};
			}}
			class="space-y-3 p-4"
		>
			<div>
				<h2 class="text-ink text-sm font-semibold">Daily trip emails</h2>
				<p class="text-ink-muted mt-0.5 text-[12px]">A morning email when a trip changes, plus booking and pre-trip reminders.</p>
			</div>
			{#if data.tripEmails.length === 0}
				<p class="text-ink-muted text-sm">No current trips.</p>
			{:else}
				<ul class="space-y-1" data-trip-emails>
					{#each data.tripEmails as t (t.id)}
						<li>
							<label class="flex min-h-11 items-center gap-3">
								<input type="checkbox" name="on" value={t.id} bind:checked={emailOn[t.id]} class="border-line h-4 w-4 rounded" />
								<span class="text-ink text-sm">{t.title}</span>
							</label>
						</li>
					{/each}
				</ul>
				{#if form?.tripEmailsError}
					<p role="alert" class="text-error-deep text-[12px]">{form.tripEmailsError}</p>
				{/if}
				<div class="flex justify-end">
					<Button type="submit" variant="ghost" size="sm" loading={savingEmails}>Save</Button>
				</div>
			{/if}
		</form>
	</Card>

	<ConnectedApps connections={data.connections} aiChanges={data.aiChanges} />

	<AppVersion />
</main>

<BottomSheet bind:open={cropperOpen} title="Position your photo">
	<AvatarCropper file={pickedFile} {onCropped} onCancel={onCropCancel} />
</BottomSheet>
