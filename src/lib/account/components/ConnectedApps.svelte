<script lang="ts">
	// #502 / ADR-0024 — the member's Connections (AI assistants linked by email
	// code). Disconnect deletes the connection; its tokens cascade, so the
	// assistant loses access on its next call.
	import { enhance } from '$app/forms';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import { relativeTime } from '$lib/documents/files';
	import { formatCalendarDate } from '$lib/shell/format';
	import { toast } from '$lib/shell/stores/toast';

	interface AiChange {
		id: string;
		quote: string;
		created: string;
		reverted: boolean;
		trip: string;
		/** #520 — which records it touched, e.g. "Lunch, Dinner and 2 more". */
		summary: string;
	}

	interface Connection {
		id: string;
		client_name: string;
		created: string;
		last_used_at: string;
	}

	let { connections, aiChanges = [] }: { connections: Connection[]; aiChanges?: AiChange[] } =
		$props();
	let pending = $state('');
	// #520 — a failed Revert says why, on its row (in-context, not a toast).
	let revertFailed = $state<{ id: string; message: string } | null>(null);

	// #503 — created is a real instant: show it in the viewer's zone, as "9:40 am".
	const when = (d: string) => {
		const t = new Date(d.replace(' ', 'T'));
		const day = t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const clock = t
			.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
			.toLowerCase();
		return `${day}, ${clock}`;
	};

	const ago = (d: string) => {
		const r = relativeTime(d);
		return /^\d/.test(r) && /[mhd]$/.test(r) ? `${r} ago` : r;
	};
</script>

<Card>
	<section class="space-y-3 p-4">
		<h2 class="text-sm font-semibold text-ink">Connected apps</h2>
		{#if connections.length === 0}
			<p class="text-sm text-ink-muted">
				No AI assistants connected. Add Waypoint as a connector in Claude to ask about your trips.
			</p>
		{:else}
			<ul class="divide-y divide-line">
				{#each connections as c (c.id)}
					<li class="flex items-center justify-between gap-3 py-2">
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-ink">{c.client_name || 'AI assistant'}</p>
							<p class="text-[12px] text-ink-muted">
								Connected {formatCalendarDate(c.created.slice(0, 10), {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
								· {c.last_used_at ? `Last used ${ago(c.last_used_at)}` : 'Not used yet'}
							</p>
						</div>
						<form
							method="POST"
							action="?/disconnect"
							use:enhance={() => {
								pending = c.id;
								return async ({ result, update }) => {
									pending = '';
									if (result.type === 'success') toast.show('Disconnected');
									await update();
								};
							}}
						>
							<input type="hidden" name="id" value={c.id} />
							<Button type="submit" variant="ghost" size="sm" loading={pending === c.id}
								>Disconnect</Button
							>
						</form>
					</li>
				{/each}
			</ul>
		{/if}

		{#if aiChanges.length}
			<details class="border-t border-line pt-3">
				<summary class="cursor-pointer text-sm font-medium text-ink">Recent AI changes</summary>
				<ul class="mt-2 divide-y divide-line">
					{#each aiChanges as a (a.id)}
						<li class="flex items-center justify-between gap-3 py-2">
							<div class="min-w-0">
								<p class="text-sm text-ink">“{a.quote}”</p>
								<p class="text-[12px] text-ink-muted">
									{a.trip ? `${a.trip} · ` : ''}{a.summary} · {when(a.created)}
								</p>
								{#if revertFailed?.id === a.id}
									<p class="mt-1 text-[12px] text-error-deep" role="alert">
										{revertFailed.message}
									</p>
								{/if}
							</div>
							{#if a.reverted}
								<span class="shrink-0 text-[12px] text-ink-muted">Undone</span>
							{:else}
								<form
									method="POST"
									action="?/revertAiChange"
									use:enhance={() => {
										pending = a.id;
										revertFailed = null;
										return async ({ result, update }) => {
											pending = '';
											if (result.type === 'failure')
												revertFailed = {
													id: a.id,
													message:
														(result.data?.revertError as string | undefined) ??
														'Could not undo that change.'
												};
											else if (result.type === 'error')
												revertFailed = {
													id: a.id,
													message: 'Could not undo that change. Try again.'
												};
											if (result.type === 'success') {
												const skipped = (result.data?.skipped as string[] | undefined) ?? [];
												toast.show(
													skipped.length ? `Undone. Left as is: ${skipped.join('; ')}` : 'Undone'
												);
											}
											await update();
										};
									}}
								>
									<input type="hidden" name="id" value={a.id} />
									<Button type="submit" variant="ghost" size="sm" loading={pending === a.id}
										>Revert</Button
									>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</section>
</Card>
