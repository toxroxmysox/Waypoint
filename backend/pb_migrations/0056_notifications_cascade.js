/// <reference path="../pb_data/types.d.ts" />
// #298 — "Can't delete trip." Deleting a trip 400s because `notifications.trip`
// is a REQUIRED relation to `trips` WITHOUT cascadeDelete. PocketBase refuses to
// delete a parent while a child holds a required, non-cascading reference to it
// (it can neither null the FK nor delete the child), so the whole trip delete
// fails the moment the trip has any notification rows.
//
// notifications.trip was defined required in 0020 and re-added required in 0053
// (#260 fix), and NEITHER set cascadeDelete — so it was never patched. This is
// the lone trip-scoped child still blocking the delete: a full audit of every
// `required relation → trips` across the migration history shows all the others
// already cascade —
//   trip_members (0003), phases (0004), days (0005), items (0006),
//   pending_invites (0015), suggestions (0019 patch), expenses (0021),
//   settlements (0022), trip_budgets (0023), votes (0024), vault_entries (0025),
//   checklists (0030), documents (0032), trip_goals (0040), join_tokens (0046),
//   money_units (0050)
// all carry cascadeDelete:true on their trip relation, and the grandchildren
// (tasks→checklist, goal_votes→goal, suggestion_votes→suggestion, votes→item)
// cascade from their own parents — so once notifications cascades, deleting a
// trip removes its entire subtree cleanly.
//
// Append-only (cerebrum: never edit/delete a migration). Follows the 0019
// (suggestions_cascade) pattern: load collection, flip the field flag, save.
migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('notifications');
		const field = collection.fields.getByName('trip');
		field.cascadeDelete = true;
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('notifications');
		const field = collection.fields.getByName('trip');
		field.cascadeDelete = false;
		app.save(collection);
	}
);
