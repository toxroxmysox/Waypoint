// #228 — Reusable prefilled add-expense. Pure helpers that turn an [[Item]] into the
// URL params the expenses page reads on `?action=add` to seed `ExpenseForm`'s ADD-mode
// `$state` initializers (WITHOUT entering edit mode). The booked/paid-moment capture
// (#229) is one caller; the helper is general-purpose (TRIP_MONEY_PRD Grill Resolutions
// B; ADR-0014 — the #228 enabler).
//
// Param contract (consumed by expenses/+page.svelte's ?action=add effect):
//   amount        ← item.cost_estimate_usd (the estimate as the starting amount; omitted
//                   when there's no positive estimate, so the form opens with a blank
//                   amount rather than "0")
//   description   ← item.title
//   date          ← caller-supplied (defaults to today at the call site; backfilled when
//                   logging a prepaid item late — ADR-0014: the pre/on-trip split keys off
//                   expense.date, not booked)
//   linked_item   ← item.id (round-trips prefill → form hidden input → ?/addExpense)
//   paid_by       ← NOT a URL param; ExpenseForm defaults the payer to the current member
//                   and it stays editable (Grill Resolution 8). Passing it here would be
//                   redundant with the form's own default.

/** The minimal item shape the prefill reads — matches a field-limited fetch. */
export interface PrefillItem {
	id: string;
	title: string;
	cost_estimate_usd?: number;
}

/** The prefill values, pre-stringified for URL search params. A field is omitted (absent
 *  key) when it has no meaningful value, so the page's `searchParams.get(...) ?? ''` falls
 *  back to the form's own ADD default. */
export interface ExpensePrefillParams {
	amount?: string;
	description?: string;
	linked_item?: string;
}

/**
 * Build the prefill params for an item. `amount` is the item's estimate when positive,
 * omitted otherwise (a missing/zero estimate → blank amount, never "0"). `description` is
 * the item title; `linked_item` is the item id. Date and payer are intentionally NOT here
 * (date is caller-supplied; payer is the form's own current-member default).
 */
export function expensePrefillParams(item: PrefillItem): ExpensePrefillParams {
	const params: ExpensePrefillParams = {};

	const est = item.cost_estimate_usd ?? 0;
	if (est > 0) {
		params.amount = String(est);
	}

	const title = item.title?.trim() ?? '';
	if (title) {
		params.description = title;
	}

	if (item.id) {
		params.linked_item = item.id;
	}

	return params;
}

/**
 * Encode the prefill as a query string (no leading `?`). Convenience for building the
 * `?action=add&...` deep-link href. Only the keys `expensePrefillParams` set are emitted.
 */
export function expensePrefillQuery(item: PrefillItem): string {
	const params = expensePrefillParams(item);
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v != null && v !== '') sp.set(k, v);
	}
	return sp.toString();
}

/**
 * #229 — the full "Log payment" deep-link to the trip's expenses page, pre-filled from the
 * item: `/trips/<slug>/expenses?action=add&amount=…&description=…&linked_item=…` (the
 * `?action=add` effect reads these). The payer defaults to the current member and the
 * split to the whole group (both the form's own ADD defaults — ADR-0014's whole-group
 * even-split default needs no params; both stay editable). The amount key is dropped when
 * the item has no estimate, so the form opens with a blank amount.
 */
export function logPaymentHref(slug: string, item: PrefillItem): string {
	const sp = new URLSearchParams({ action: 'add' });
	const params = expensePrefillParams(item);
	for (const [k, v] of Object.entries(params)) {
		if (v != null && v !== '') sp.set(k, v);
	}
	return `/trips/${slug}/expenses?${sp.toString()}`;
}
