/// <reference path="../pb_data/types.d.ts" />
// #272 — Email Digest Phase 1: per-trip digest state.
//
// Two fields on `trips`:
//   - last_digest_at (date): stamped only after a successful digest send (or a
//     silent baseline write). Empty = never digested. Truthiness checks in
//     hooks MUST use getString() (goja returns a truthy DateTime for an empty
//     date field — cerebrum [2026-06-11]).
//   - digest_state (json): compact snapshot of the trip's items at the last
//     digest — { [itemId]: { t: title, d: dayDate|'', s: status, g: signature } }.
//     A window on `updated` alone cannot distinguish MOVED from EDITED and
//     cannot see REMOVED at all (no notification event records item deletes),
//     so the diff is snapshot-vs-current. ~60 bytes/item → 65536 covers ~1000
//     items; capped trips just skip the digest gracefully.
//
// Imperative fields.add API per cerebrum Do-Not-Repeat: the declarative
// `new Collection({fields:[...]})` constructor-array form silently drops
// fields on this PB build (0018, 0053).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const existing = trips.fields.fieldNames();
		const has = (name) => existing.indexOf(name) !== -1;

		if (!has('last_digest_at')) {
			trips.fields.add(new DateField({ name: 'last_digest_at' }));
		}
		if (!has('digest_state')) {
			trips.fields.add(new JSONField({ name: 'digest_state', maxSize: 262144 }));
		}

		app.save(trips);
	},
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		['last_digest_at', 'digest_state'].forEach((name) => {
			try {
				trips.fields.removeByName(name);
			} catch (_) {}
		});
		app.save(trips);
	}
);
