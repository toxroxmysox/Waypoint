<script lang="ts">
	import NavBar from '$lib/ui/NavBar.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Pill from '$lib/ui/Pill.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Avatar from '$lib/ui/Avatar.svelte';
	import FAB from '$lib/shell/components/FAB.svelte';
	import { clearOfflineCaches } from '$lib/documents/offline-cache';
	import { goto } from '$app/navigation';

	let { data } = $props();

	// #278 — paste-invite escape hatch for the signed-up-but-trip-less user who
	// has an invite. Accept either a full invite URL (…/join/<token>) OR a bare
	// token, extract the token, and navigate to the EXISTING /join/[token] flow
	// (no new join logic). Tokens are $security.randomString(40) → 40 alphanumerics.
	// Client-side parse+goto (not a form action): the destination is a GET route
	// with the token as a PATH segment, so there's nothing to POST — a form action
	// would only re-parse and 303 to this same GET. The house "progressive
	// enhancement, not client fetch" rule governs data mutations; this is pure
	// navigation to a computed URL, the idiomatic SvelteKit case for goto().
	let inviteInput = $state('');
	let inviteError = $state('');

	function extractToken(raw: string): string | null {
		const trimmed = raw.trim();
		if (!trimmed) return null;
		// Pull the /join/<token> segment out of a pasted URL, else treat the whole
		// string as a bare token. Strip any trailing slash / query / fragment.
		const urlMatch = trimmed.match(/\/join\/([^/?#\s]+)/i);
		const candidate = urlMatch ? urlMatch[1] : trimmed;
		return /^[A-Za-z0-9]{6,}$/.test(candidate) ? candidate : null;
	}

	function submitInvite(e: SubmitEvent) {
		e.preventDefault();
		const token = extractToken(inviteInput);
		if (!token) {
			inviteError = "That doesn't look like an invite link. Paste the whole link, or just the code.";
			return;
		}
		inviteError = '';
		goto(`/join/${token}`);
	}

	function formatDateRange(start: string, end: string): string {
		const s = new Date(start.replace(' ', 'T'));
		const e = new Date(end.replace(' ', 'T'));
		const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
		const startStr = s.toLocaleDateString('en-US', opts);
		const endStr = e.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
		return `${startStr} – ${endStr}`;
	}

	let isEmpty = $derived(
		data.active.length === 0 &&
			data.upcoming.length === 0 &&
			data.forming.length === 0 &&
			data.past.length === 0
	);
</script>

<NavBar title="Waypoint" homeLink={false}>
	{#snippet right()}
		<div class="flex items-center gap-3">
			<form method="POST" action="/logout" onsubmit={() => clearOfflineCaches()}>
				<button
					type="submit"
					class="text-ink-muted hover:text-ink-soft text-[12px] font-medium"
				>
					Sign out
				</button>
			</form>
			<a
				href="/account"
				class="hover:opacity-80"
				aria-label="Profile"
				data-sveltekit-preload-data="hover"
			>
				<Avatar img={data.avatarUrl} initial={(data.profileName || '?').slice(0, 1)} alt={data.profileName} size={32} />
			</a>
		</div>
	{/snippet}
</NavBar>

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-24">
	{#if data.pendingClaims > 0}
		<!-- #179c: pending placeholder claims skipped at login are otherwise
		     stranded until the next fresh login. This card re-enters the flow. -->
		<a href="/claim" class="mb-4 block" data-sveltekit-preload-data="hover">
			<Card strong accent="var(--color-moss)">
				<div class="flex items-center gap-3 p-4">
					<span
						class="bg-moss-tint text-moss flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
						aria-hidden="true"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M20 6 9 17l-5-5" />
						</svg>
					</span>
					<div class="min-w-0 flex-1">
						<p class="text-ink text-sm font-semibold">
							{#if data.pendingClaims === 1}
								You've been added to {data.firstClaimTitle || 'a trip'}
							{:else}
								{data.pendingClaims} trips are waiting for you
							{/if}
						</p>
						<p class="text-ink-muted text-xs">Tap to review and join.</p>
					</div>
					<svg class="text-ink-muted shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="m9 18 6-6-6-6" />
					</svg>
				</div>
			</Card>
		</a>
	{/if}

	{#if isEmpty}
		<!-- #278 First-run for the signed-up-but-trip-less user (grill 2026-07-05, BINDING).
		     A warm orientation, not marketing: one plain sentence on what a trip IS, a
		     prominent "Plan your first trip" → the name-first forming create (#270), and a
		     quieter "Have an invite?" escape hatch that resolves a pasted link/token to the
		     existing /join flow. Evolves #277's on-ramp. NO feature tour, NO templates, NO
		     seeded data. Converges with the in-trip welcome card (#274) once you're in a trip. -->
		<div class="py-14 text-center" data-testid="trips-empty-onramp">
			<p class="font-display text-ink text-2xl italic">Where to?</p>
			<p class="text-ink-muted mx-auto mt-3 max-w-xs text-sm leading-relaxed">
				A trip is a shared place to plan a journey with the people coming along —
				gather ideas, weigh dates, and decide together.
			</p>
			<div class="mt-6">
				<Button href="/trips/new" variant="moss" size="md">Plan your first trip</Button>
			</div>

			<!-- Quieter escape hatch: signed up directly but someone sent you an invite. -->
			<div class="border-line/60 mx-auto mt-10 max-w-xs border-t pt-6 text-left">
				<form onsubmit={submitInvite}>
					<label for="invite-link" class="text-ink-soft block text-center text-sm font-medium">
						Have an invite? Paste your link.
					</label>
					<div class="mt-2 flex items-center gap-2">
						<input
							type="text"
							id="invite-link"
							name="invite"
							bind:value={inviteInput}
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
							placeholder="Paste link or code"
							class="border-line bg-surface text-ink min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
						/>
						<Button type="submit" variant="ghost" size="sm">Go</Button>
					</div>
					{#if inviteError}
						<p role="alert" class="text-error-deep mt-2 text-xs">{inviteError}</p>
					{/if}
				</form>
			</div>

			<p class="mt-8">
				<a href="/trips/import" class="text-ink-muted text-xs font-medium hover:text-ink-soft">
					or import from JSON
				</a>
			</p>
		</div>
	{:else}
		<div class="space-y-6">
			{#if data.active.length > 0}
				<section class="space-y-2">
					<div class="flex items-baseline justify-between pt-1">
						<h2 class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">On trip</h2>
					</div>
					{#each data.active as { trip }}
						<Card href="/trips/{trip?.slug}" strong accent="var(--color-clay)">
							<div class="p-4">
								<div class="flex items-start justify-between gap-2">
									<h3 class="font-display text-ink text-lg leading-tight font-semibold">
										{trip?.title}
									</h3>
									<Pill variant="trip" size="sm">Now</Pill>
								</div>
								<p class="text-ink-muted font-mono mt-1 text-[12px]">
									{formatDateRange(trip?.start_date ?? '', trip?.end_date ?? '')}
								</p>
								{#if trip?.location_summary}
									<p class="font-display text-ink-soft mt-1 text-sm italic">
										{trip.location_summary}
									</p>
								{/if}
							</div>
						</Card>
					{/each}
				</section>
			{/if}

			{#if data.upcoming.length > 0}
				<section class="space-y-2">
					<div class="flex items-baseline justify-between pt-1">
						<h2 class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">Upcoming</h2>
					</div>
					{#each data.upcoming as { trip }}
						<Card href="/trips/{trip?.slug}">
							<div class="p-4">
								<h3 class="font-display text-ink text-lg leading-tight font-semibold">
									{trip?.title}
								</h3>
								<p class="text-ink-muted font-mono mt-1 text-[12px]">
									{formatDateRange(trip?.start_date ?? '', trip?.end_date ?? '')}
								</p>
								{#if trip?.location_summary}
									<p class="font-display text-ink-soft mt-1 text-sm italic">
										{trip.location_summary}
									</p>
								{/if}
							</div>
						</Card>
					{/each}
				</section>
			{/if}

			{#if data.forming.length > 0}
				<!-- #270 / ADR-0022 — dateless (forming) trips: still alive, sorted ahead
				     of past. Subtle "No dates yet" badge where a date range would sit. -->
				<section class="space-y-2">
					<div class="flex items-baseline justify-between pt-1">
						<h2 class="text-moss text-[11px] font-bold tracking-[0.2em] uppercase">
							Taking shape
						</h2>
					</div>
					{#each data.forming as { trip }}
						<Card href="/trips/{trip?.slug}">
							<div class="p-4">
								<div class="flex items-start justify-between gap-2">
									<h3 class="font-display text-ink text-lg leading-tight font-semibold">
										{trip?.title}
									</h3>
									<Pill size="sm">No dates yet</Pill>
								</div>
								{#if trip?.location_summary}
									<p class="font-display text-ink-soft mt-1 text-sm italic">
										{trip.location_summary}
									</p>
								{/if}
							</div>
						</Card>
					{/each}
				</section>
			{/if}

			{#if data.past.length > 0}
				<section class="space-y-2">
					<div class="flex items-baseline justify-between pt-1">
						<h2 class="text-ink-muted text-[11px] font-bold tracking-[0.2em] uppercase">
							Past
						</h2>
					</div>
					{#each data.past as { trip }}
						<Card href="/trips/{trip?.slug}" class="opacity-80">
							<div class="p-4">
								<h3 class="text-ink-soft text-base leading-tight font-medium">{trip?.title}</h3>
								<p class="text-ink-muted font-mono mt-1 text-[12px]">
									{formatDateRange(trip?.start_date ?? '', trip?.end_date ?? '')}
								</p>
							</div>
						</Card>
					{/each}
				</section>
			{/if}
		</div>
	{/if}
</main>

{#if !isEmpty}
	<div class="fixed bottom-20 left-0 right-0 text-center">
		<a href="/trips/import" class="text-ink-muted text-xs font-medium hover:text-ink-soft">
			Import from JSON
		</a>
	</div>
	<FAB href="/trips/new" label="New trip" />
{/if}
