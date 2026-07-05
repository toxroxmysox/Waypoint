/// <reference path="../pb_data/types.d.ts" />
// #271 (Availability wedge / Ideation → When) — the `availability` collection.
// ADR-0023: availability is the FOURTH group-input mechanism, NOT a Vote. Each
// member paints, on a calendar for a FORMING trip, when they are free; the tool
// SURFACES consensus, never ranks.
//
// Model (ADR-0023 Decisions 2/3): per-(trip, member, day) cells; value ∈
// {available, maybe} ONLY — no "unavailable", no red; a blank day persists
// nothing. Aggregation is a pure per-day group (a day is GREEN only when EVERY
// active member marked `available`; any maybe/blank → YELLOW). No interval math.
//
// Fields:
//   trip    relation → trips        required, cascadeDelete
//   member  relation → trip_members required, cascadeDelete (ADR-0023 build
//                                   invariant 2: a zero-ref respondent's hard-
//                                   purge takes their cells and can't throw a
//                                   required-FK 400 — cells reference
//                                   trip_members.id, never user.id or a cookie)
//   day     date                    required (the painted day)
//   value   select available|maybe  required
//   created/updated autodate        (explicit-field collections get none — bug-185)
// Unique (trip, member, day) → a re-paint of the same day is an UPDATE, not an
// insert.
//
// Permissions (ADR-0023 §Consequences; PB rules first):
//   list/view — ALL trip members incl. viewers read the poll (everyone reads the
//               group heatmap). MEMBER_VIA_TRIP.
//   create    — a member painting AS THEMSELVES (member.user = auth). Viewers MAY
//               paint their own availability (it's not an authoring/proposal act —
//               a viewer can still be free on a day), so NO `role != "viewer"`
//               clamp, UNLIKE scenarios/votes. The Tier-1 anon paint path does NOT
//               go through this rule — it writes via the admin-context
//               /api/poll/paint route (M4), which bypasses collection rules.
//   update/delete — own cells only (SELF_ONLY: member.user = auth).
//
// Every availability READ that feeds the green computation filters `removed_at =
// ""` (ADR-0023 build invariant 4) — enforced in the app/hook query layer, not the
// rule (the rule already scopes to trip membership).
//
// IMPERATIVE field-add API on purpose: the declarative new Collection({fields:[...]})
// constructor-array form has silently dropped fields on this PB build before
// (scars 0018/0053) — the imperative collection.fields.add(new XxxField()) form is
// the proven-safe path (guardrail).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		// Membership resolved single-parent via the cell's trip (mirrors goal_votes
		// 0042 / scenario_votes 0064).
		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		const SELF = ' && member.user = @request.auth.id';

		const collection = new Collection({ type: 'base', name: 'availability' });

		collection.fields.add(
			new RelationField({
				name: 'trip',
				required: true,
				collectionId: trips.id,
				maxSelect: 1,
				cascadeDelete: true
			})
		);
		collection.fields.add(
			new RelationField({
				name: 'member',
				required: true,
				collectionId: tripMembers.id,
				maxSelect: 1,
				cascadeDelete: true
			})
		);
		collection.fields.add(new DateField({ name: 'day', required: true }));
		collection.fields.add(
			new SelectField({
				name: 'value',
				required: true,
				maxSelect: 1,
				values: ['available', 'maybe']
			})
		);
		collection.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
		collection.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));

		collection.indexes = [
			'CREATE UNIQUE INDEX idx_availability_trip_member_day ON availability (trip, member, day)',
			'CREATE INDEX idx_availability_trip ON availability (trip)'
		];

		collection.listRule = MEMBER_VIA_TRIP;
		collection.viewRule = MEMBER_VIA_TRIP;
		// create: a member painting AS THEMSELVES. No viewer clamp — a viewer can be
		// free too. The anon poll path (M4) writes via admin-context route, not this rule.
		collection.createRule = MEMBER_VIA_TRIP + SELF;
		collection.updateRule = MEMBER_VIA_TRIP + SELF;
		collection.deleteRule = MEMBER_VIA_TRIP + SELF;

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('availability');
		app.delete(collection);
	}
);
