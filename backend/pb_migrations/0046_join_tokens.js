/// <reference path="../pb_data/types.d.ts" />
// #118 — shared, reusable trip-level Join Link (MEMBERSHIP_LIFECYCLE_PRD §#118,
// Resolutions 1–8). A new join-token collection, keyed by (trip, role):
//
//   role ∈ {traveler, viewer} ONLY — co_owner is NEVER mintable via a join link
//     (stays on the email Invite path). The select enum below is the first line
//     of the cap invariant; the create hook is the second.
//
//   token   — the URL secret (globally unique; rotating overwrites it so the old
//             value 404s — PRD Resolution 4).
//   revoked — soft-disable so the (trip, role) slot stays addressable for rotate
//             without violating the unique (trip, role) index.
//   expires_at — owner-set, default 30d, capped at trip end (enforced in hook).
//
// At most ONE row per (trip, role) → unique index → max two live links per trip
// (one traveler, one viewer). Lookup is by token (anon). create/rotate/revoke run
// owner/co_owner-gated through the hook; the collection's create/update/delete
// rules are null so no client can mint a token or set its own lifetime.
//
// Storage shape choice (PRD left it to the builder): a tiny collection, NOT
// fields-on-trips. Rationale: mirrors pending_invites exactly (unique token
// index, member-gated read rule, hook-only writes), gives clean revoke/rotate
// row semantics, and keeps trips from sprouting six role-doubled columns.
//
// Append-only. Autodate created/updated are added EXPLICITLY — a Collection built
// from an explicit `fields` array drops the system autodate fields, which 500s any
// `sort: 'created'` (cerebrum Do-Not-Repeat [2026-06-08]; bit goal_votes twice).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const collection = new Collection({
			type: 'base',
			name: 'join_tokens',
			fields: [
				{
					type: 'relation',
					name: 'trip',
					required: true,
					collectionId: trips.id,
					maxSelect: 1,
					cascadeDelete: true
				},
				{
					type: 'select',
					name: 'role',
					required: true,
					// NEVER owner/co_owner — the link cap lives here at the schema level.
					values: ['traveler', 'viewer'],
					maxSelect: 1
				},
				{ type: 'text', name: 'token', required: true, min: 16, max: 64 },
				{ type: 'date', name: 'expires_at', required: true },
				{ type: 'bool', name: 'revoked' },
				{
					type: 'relation',
					name: 'created_by',
					required: false,
					collectionId: tripMembers.id,
					maxSelect: 1,
					cascadeDelete: true
				},
				// System timestamps — the members page sorts links by '-created'.
				{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
				{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
			],
			indexes: [
				// Token is the URL secret — globally unique.
				'CREATE UNIQUE INDEX idx_join_tokens_token ON join_tokens (token)',
				// One link per (trip, role) — caps the trip at one traveler + one viewer link.
				'CREATE UNIQUE INDEX idx_join_tokens_trip_role ON join_tokens (trip, role)'
			],
			// Members of the trip may list/view the trip's links (to render the
			// management UI + copy the URL). All mutations go through the join hook,
			// which generates the token and enforces owner/co_owner + role cap; a
			// direct client write would let any member forge a token or lifetime.
			listRule:
				'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id',
			viewRule:
				'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id',
			createRule: null,
			updateRule: null,
			deleteRule: null
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('join_tokens');
		app.delete(collection);
	}
);
