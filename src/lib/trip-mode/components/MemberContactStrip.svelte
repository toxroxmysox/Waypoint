<script lang="ts">
	import Avatar from '$lib/ui/Avatar.svelte';
	import type { TripMember } from '$lib/types';
	import type { User } from '$lib/shell/types';

	// #244: Members left the Trip nav (Now · Money · Add · Docs). To not orphan
	// reaching a fellow traveller mid-trip, surface tap-to-contact here on Now.
	// The schema has only email (no phone — a phone field + tel:/sms: would need a
	// migration, out of scope for #244), so contact is mailto:. The roster comes
	// pre-resolved with avatarUrl + expanded user.
	type MemberRow = TripMember & { avatarUrl?: string; expand?: { user?: User } };

	let {
		members = [],
		selfUserId = ''
	}: {
		members?: MemberRow[];
		selfUserId?: string;
	} = $props();

	function nameOf(m: MemberRow): string {
		return m.display_name || m.expand?.user?.name || m.placeholder_name || m.expand?.user?.email || 'Member';
	}
	function emailOf(m: MemberRow): string {
		return m.expand?.user?.email || m.placeholder_email || '';
	}

	// Everyone but you, with a reachable email. Placeholders with no email are
	// not contactable, so they're dropped from the strip (still visible on the
	// planning Members roster).
	const contacts = $derived(
		members
			.filter((m) => m.user !== selfUserId)
			.map((m) => ({ id: m.id, name: nameOf(m), email: emailOf(m), avatarUrl: m.avatarUrl ?? '' }))
			.filter((c) => c.email !== '')
	);
</script>

{#if contacts.length > 0}
	<section class="border-line space-y-2 border-t pt-4">
		<p class="text-ink-muted text-[11px] font-medium uppercase tracking-wide">Trip crew</p>
		<div class="space-y-1">
			{#each contacts as c (c.id)}
				<a
					href="mailto:{c.email}"
					class="hover:bg-surface-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
				>
					<Avatar img={c.avatarUrl} initial={c.name} alt={c.name} size={28} />
					<span class="text-ink-soft min-w-0 flex-1 truncate text-sm">{c.name}</span>
					<span class="text-ink-muted shrink-0" aria-hidden="true">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="2" y="4" width="20" height="16" rx="2" />
							<path d="m22 7-10 5L2 7" />
						</svg>
					</span>
				</a>
			{/each}
		</div>
	</section>
{/if}
