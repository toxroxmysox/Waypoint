// #332 — the money area's sub-tabs (Expenses · Budget · Groups). Single source of
// truth so the three pages can't drift out of sync (a page showing 2 tabs while
// another shows 3). The `Groups` label = the Money Units home (ADR-0015 / #230), at /money-units.
export function moneyTabs(slug: string): Array<{ id: string; label: string; href: string }> {
	return [
		{ id: 'expenses', label: 'Expenses', href: `/trips/${slug}/expenses` },
		{ id: 'budget', label: 'Budget', href: `/trips/${slug}/budget` },
		{ id: 'money-units', label: 'Groups', href: `/trips/${slug}/money-units` }
	];
}
