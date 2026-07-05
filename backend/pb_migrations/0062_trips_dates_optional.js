/// <reference path="../pb_data/types.d.ts" />
// #270 / ADR-0022 — a trip may exist WITHOUT dates (the derived `forming`
// lifecycle state: start_date empty ⇔ forming). Relax trips.start_date /
// trips.end_date from required:true (0002) to optional.
//
// IMPERATIVE field-modify API on purpose: the declarative `new Collection({
// fields: [...] })` constructor-array form silently drops fields on this PB
// build (see 0018 + 0053 — the proven fix both times was the imperative
// `collection.fields.*` API). 0026 is the precedent for mutating an existing
// field's property in place.
//
// "Both dates or neither" is an APP-layer invariant (form actions + the
// trips.pb.js update/create request hooks), not a schema one — PB has no
// cross-field required expression.
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.getByName('start_date').required = false;
		trips.fields.getByName('end_date').required = false;
		app.save(trips);
	},
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.getByName('start_date').required = true;
		trips.fields.getByName('end_date').required = true;
		app.save(trips);
	}
);
