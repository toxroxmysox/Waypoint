<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import SubTabs from '$lib/components/SubTabs.svelte';
	import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { titleCase } from '$lib/utils/format';
	import TypeIcon from '$lib/components/ui/TypeIcon.svelte';
	import type { Notification, BudgetCategory, ExpenseCategory, ItemType } from '$lib/types';
	import { toast } from '$lib/stores/toast';

	let { data, form } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	const categoryMeta: Record<ExpenseCategory, { iconType: ItemType; label: string }> = {
		lodging: { iconType: 'lodging', label: 'Lodging' },
		transportation: { iconType: 'transportation', label: 'Transport' },
		food: { iconType: 'meal', label: 'Food' },
		activity: { iconType: 'activity', label: 'Activities' },
		other: { iconType: 'note', label: 'Other' }
	};

	// Editable category state
	type EditableCategory = BudgetCategory & { editing?: boolean };
	let cats = $state<EditableCategory[]>(
		untrack(() => {
			const existing = data.budget?.categories;
			if (existing && existing.length > 0) return existing.map((c) => ({ ...c }));
			return data.defaultCategories.map((c) => ({ ...c }));
		})
	);

	let saving = $state(false);

	let grandTotal = $derived(cats.reduce((s, c) => s + c.total, 0));
	let perDay = $derived(data.tripDays > 0 ? grandTotal / data.tripDays : 0);

	let totalSpent = $derived(
		Object.values(data.spentByCategory).reduce((s: number, v: number) => s + v, 0)
	);

	function updateCategory(idx: number, field: 'mode' | 'daily_amount' | 'total', value: string) {
		const cat = { ...cats[idx] };
		if (field === 'mode') {
			cat.mode = value as 'per_day' | 'total';
			if (cat.mode === 'per_day') {
				cat.daily_amount = cat.total > 0 ? Math.round((cat.total / data.tripDays) * 100) / 100 : 0;
			} else {
				cat.daily_amount = null;
			}
		} else if (field === 'daily_amount') {
			cat.daily_amount = parseFloat(value) || 0;
			cat.total = Math.round(cat.daily_amount * data.tripDays * 100) / 100;
		} else if (field === 'total') {
			cat.total = parseFloat(value) || 0;
			if (cat.mode === 'per_day') {
				cat.daily_amount = data.tripDays > 0 ? Math.round((cat.total / data.tripDays) * 100) / 100 : 0;
			}
		}
		cats[idx] = cat;
	}

	function buildCategoriesJson(): string {
		return JSON.stringify(
			cats.map((c) => ({
				category: c.category,
				mode: c.mode,
				daily_amount: c.daily_amount,
				total: c.total
			}))
		);
	}

	function formatAmount(n: number): string {
		return n.toFixed(2);
	}
</script>

<NavBar
	title={data.trip.title}
	subtitle={data.trip.location_summary || undefined}
	subtitleStyle="tagline"
	back
	backHref="/trips"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>
<SubTabs tabs={[
	{ id: 'expenses', label: 'Expenses', href: `/trips/${data.trip.slug}/expenses` },
	{ id: 'budget', label: 'Budget', href: `/trips/${data.trip.slug}/budget` }
]} />

<main class="mx-auto w-full max-w-lg md-desktop:max-w-2xl flex-1 px-4 pt-4 pb-8">
	<!-- Grand total -->
	<div class="mb-6 text-center">
		<p class="text-xs font-medium text-ink-muted uppercase tracking-wider">Estimated Total</p>
		<p class="font-mono text-3xl font-semibold text-ink">${formatAmount(grandTotal)}</p>
		<div class="mt-1 flex items-center justify-center gap-3 text-xs text-ink-muted">
			<span>${formatAmount(perDay)} / day</span>
			<span class="text-line">|</span>
			<span>{data.tripDays} days</span>
		</div>
		{#if totalSpent > 0}
			<div class="mt-2">
				<div class="mx-auto max-w-[200px] h-1.5 rounded-full bg-surface-2 overflow-hidden">
					<div
						class="h-full rounded-full transition-all {totalSpent > grandTotal && grandTotal > 0 ? 'bg-clay' : 'bg-moss'}"
						style="width: {grandTotal > 0 ? Math.min(100, (totalSpent / grandTotal) * 100) : 0}%"
					></div>
				</div>
				<p class="mt-1 text-xs text-ink-muted">
					${formatAmount(totalSpent)} spent of ${formatAmount(grandTotal)}
				</p>
			</div>
		{/if}
	</div>

	<!-- Category cards -->
	<form
		method="POST"
		action="?/saveBudget"
		use:enhance={() => {
			saving = true;
			return async ({ update, result }) => {
				saving = false;
				if (result.type === 'success') toast.show('Budget saved');
				await update();
			};
		}}
	>
		<input type="hidden" name="categories" value={buildCategoriesJson()} />

		<div class="space-y-3">
			{#each cats as cat, idx}
				{@const spent = data.spentByCategory[cat.category] ?? 0}
				{@const meta = categoryMeta[cat.category]}
				<Card>
					<div class="p-3">
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center gap-2">
								<TypeIcon type={meta.iconType} size={24} />
								<span class="text-sm font-medium text-ink">{meta.label}</span>
							</div>
							<span class="font-mono text-sm font-semibold text-ink">${formatAmount(cat.total)}</span>
						</div>

						<!-- Progress bar (only if budget > 0) -->
						{#if cat.total > 0}
							<div class="mb-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
								<div
									class="h-full rounded-full transition-all {spent > cat.total ? 'bg-clay' : 'bg-moss'}"
									style="width: {Math.min(100, (spent / cat.total) * 100)}%"
								></div>
							</div>
							<p class="text-[11px] text-ink-muted mb-2">
								${formatAmount(spent)} spent
								{#if spent > cat.total}
									<span class="text-clay">(${formatAmount(spent - cat.total)} over)</span>
								{/if}
							</p>
						{/if}

						<!-- Editable fields (owner/co_owner only) -->
						{#if data.isOwner}
							<div class="flex items-center gap-2">
								<!-- Mode toggle -->
								<div class="flex rounded-md border border-line overflow-hidden">
									<button
										type="button"
										class="px-2 py-1 text-[11px] font-medium transition-colors {cat.mode === 'per_day' ? 'bg-ink text-paper' : 'bg-surface-2 text-ink-soft'}"
										onclick={() => updateCategory(idx, 'mode', 'per_day')}
									>Per day</button>
									<button
										type="button"
										class="px-2 py-1 text-[11px] font-medium transition-colors {cat.mode === 'total' ? 'bg-ink text-paper' : 'bg-surface-2 text-ink-soft'}"
										onclick={() => updateCategory(idx, 'mode', 'total')}
									>Total</button>
								</div>

								{#if cat.mode === 'per_day'}
									<input
										type="number"
										step="0.01"
										min="0"
										value={cat.daily_amount ?? 0}
										oninput={(e) => updateCategory(idx, 'daily_amount', (e.target as HTMLInputElement).value)}
										class="w-20 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-ink focus:border-moss focus:outline-none"
									/>
									<span class="text-[11px] text-ink-muted">x {data.tripDays}d</span>
								{:else}
									<input
										type="number"
										step="0.01"
										min="0"
										value={cat.total}
										oninput={(e) => updateCategory(idx, 'total', (e.target as HTMLInputElement).value)}
										class="w-24 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs text-ink focus:border-moss focus:outline-none"
									/>
								{/if}
							</div>
						{/if}
					</div>
				</Card>
			{/each}
		</div>

		{#if form?.saveBudget && 'error' in form.saveBudget}
			<p class="mt-3 text-sm text-clay">{form.saveBudget.error}</p>
		{/if}

		{#if form?.saveBudget && 'success' in form.saveBudget}
			<p class="mt-3 text-sm text-moss">Budget saved.</p>
		{/if}

		{#if data.isOwner}
			<Button type="submit" variant="primary" size="lg" class="mt-4 w-full" disabled={saving} loading={saving}>
				{saving ? 'Saving...' : 'Save Budget'}
			</Button>
		{/if}
	</form>
</main>
