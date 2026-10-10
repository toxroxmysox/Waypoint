/// <reference path="../pb_data/types.d.ts" />
// #435 (card system spec #418, CARD_SYSTEM D2) — a stored flight number.
//
// The flight lookup writes `UA 1234` here and builds the title from it
// (`UA 1234 to Denver`). The place line reads it for flights whose title lacks
// the number. Flight-only, plain text, not required (empty on every other item
// and on flights created before this). Additive (fields.add) so items keeps its
// existing fields and autodates.
migrate(
	(app) => {
		const items = app.findCollectionByNameOrId('items');
		items.fields.add(new TextField({ name: 'flight_number', required: false, max: 20 }));
		app.save(items);
	},
	(app) => {
		const items = app.findCollectionByNameOrId('items');
		items.fields.removeByName('flight_number');
		app.save(items);
	}
);
