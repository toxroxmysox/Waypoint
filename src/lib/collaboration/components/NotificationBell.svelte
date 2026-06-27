<script lang="ts">
	import { invalidate } from '$app/navigation';
	import type { Notification } from '$lib/types';

	let {
		notifications = $bindable<Notification[]>([]),
		unreadCount = $bindable(0)
	}: {
		notifications?: Notification[];
		unreadCount?: number;
	} = $props();

	let open = $state(false);

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	function formatDate(ts: string): string {
		if (!ts) return '';
		const d = new Date(ts.replace(' ', 'T'));
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffH = Math.floor(diffMin / 60);
		if (diffH < 24) return `${diffH}h ago`;
		const diffD = Math.floor(diffH / 24);
		return `${diffD}d ago`;
	}

	async function markRead(id: string) {
		// Snapshot for rollback if the write fails.
		const prevNotifications = notifications;
		const prevUnread = unreadCount;

		// Optimistically update local state.
		notifications = notifications.map((n) =>
			n.id === id ? { ...n, read_at: new Date().toISOString() } : n
		);
		unreadCount = Math.max(0, unreadCount - 1);

		try {
			const res = await fetch('/api/notifications/mark-read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids: [id] })
			});
			if (!res.ok) throw new Error('mark-read failed');
			// #297: re-fetch the layout's notifications so the persisted read_at
			// survives navigation between sibling pages (the optimistic mutation
			// alone is lost when a new page seeds its state from stale layout data).
			await invalidate('app:notifications');
		} catch {
			// Roll back the optimistic change so the bell never lies.
			notifications = prevNotifications;
			unreadCount = prevUnread;
		}
	}

	async function markAllRead() {
		const prevNotifications = notifications;
		const prevUnread = unreadCount;

		notifications = notifications.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
		unreadCount = 0;

		try {
			const res = await fetch('/api/notifications/mark-read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ all: true })
			});
			if (!res.ok) throw new Error('mark-read failed');
			await invalidate('app:notifications');
		} catch {
			notifications = prevNotifications;
			unreadCount = prevUnread;
		}
	}
</script>

<div class="relative">
	<button
		type="button"
		onclick={toggle}
		aria-label="Notifications{unreadCount > 0 ? ` (${unreadCount} unread)` : ''}"
		class="text-ink-soft hover:text-ink relative flex h-11 w-11 items-center justify-center rounded-full"
	>
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
			<path d="M13.73 21a2 2 0 0 1-3.46 0" />
		</svg>
		{#if unreadCount > 0}
			<span
				class="bg-clay text-paper absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
				aria-hidden="true"
			>
				{unreadCount > 9 ? '9+' : unreadCount}
			</span>
		{/if}
	</button>

	{#if open}
		<!-- Backdrop -->
		<button
			type="button"
			class="fixed inset-0 z-modal"
			onclick={close}
			aria-label="Close notifications"
			tabindex="-1"
		></button>

		<!-- Dropdown -->
		<div
			class="border-line bg-paper shadow-md absolute right-0 top-full z-modal mt-1 w-80 max-h-[70vh] overflow-y-auto rounded-lg border"
		>
			<div class="border-line flex items-center justify-between border-b px-4 py-2.5">
				<span class="text-ink text-sm font-semibold">Notifications</span>
				{#if unreadCount > 0}
					<button
						type="button"
						onclick={markAllRead}
						class="text-ink-muted hover:text-ink-soft text-xs"
					>
						Mark all read
					</button>
				{/if}
			</div>

			{#if notifications.length === 0}
				<p class="text-ink-muted px-4 py-6 text-center text-sm">No notifications yet.</p>
			{:else}
				<ul class="divide-line divide-y">
					{#each notifications as n (n.id)}
						{@const isUnread = !n.read_at}
						<li>
							{#if n.link}
								<a
									href={n.link}
									onclick={() => { if (isUnread) markRead(n.id); close(); }}
									class="flex gap-3 px-4 py-3 transition-colors {isUnread ? 'bg-surface hover:bg-surface-2' : 'hover:bg-surface'}"
								>
									<div class="flex min-w-0 flex-1 flex-col gap-0.5">
										<span class="text-ink text-sm leading-snug {isUnread ? 'font-medium' : ''}">{n.body}</span>
										<span class="text-ink-muted text-xs">{formatDate(n.created)}</span>
									</div>
									{#if isUnread}
										<span class="bg-moss mt-1.5 h-2 w-2 shrink-0 rounded-full" aria-hidden="true"></span>
									{/if}
								</a>
							{:else}
								<button
									type="button"
									onclick={() => { if (isUnread) markRead(n.id); }}
									class="flex w-full gap-3 px-4 py-3 text-left transition-colors {isUnread ? 'bg-surface hover:bg-surface-2' : 'hover:bg-surface'}"
								>
									<div class="flex min-w-0 flex-1 flex-col gap-0.5">
										<span class="text-ink text-sm leading-snug {isUnread ? 'font-medium' : ''}">{n.body}</span>
										<span class="text-ink-muted text-xs">{formatDate(n.created)}</span>
									</div>
									{#if isUnread}
										<span class="bg-moss mt-1.5 h-2 w-2 shrink-0 rounded-full" aria-hidden="true"></span>
									{/if}
								</button>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
