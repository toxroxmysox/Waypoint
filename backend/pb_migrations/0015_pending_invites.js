/// <reference path="../pb_data/types.d.ts" />
// M2b — pending_invites collection. Backs the invite-by-email flow:
// owner/co-owner/traveler clicks "invite", we create a pending_invites row,
// the after-create hook (invites.pb.js) sends a Resend email with a link to
// /invite/<code>. Acceptance creates a trip_members row and deletes the
// pending invite (handled by /api/invites/accept).
//
// Schema source of truth: SPEC.md §4. Roles whitelist matches SPEC §3
// (only co_owner/traveler/viewer can be invited; owner is implicit on trip
// creation and not invitable).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const collection = new Collection({
			type: 'base',
			name: 'pending_invites',
			fields: [
				{
					type: 'relation',
					name: 'trip',
					required: true,
					collectionId: trips.id,
					maxSelect: 1,
					cascadeDelete: true
				},
				{ type: 'email', name: 'email', required: true },
				{
					type: 'select',
					name: 'role',
					required: true,
					values: ['co_owner', 'traveler', 'viewer'],
					maxSelect: 1
				},
				{
					type: 'relation',
					name: 'invited_by',
					required: true,
					collectionId: tripMembers.id,
					maxSelect: 1,
					cascadeDelete: true
				},
				{ type: 'text', name: 'code', required: true, min: 16, max: 64 },
				{ type: 'date', name: 'expires_at', required: true }
			],
			indexes: [
				// Code is the URL token — must be globally unique.
				'CREATE UNIQUE INDEX idx_pending_invites_code ON pending_invites (code)',
				// One open invite per (trip, email) — prevents duplicate sends.
				'CREATE UNIQUE INDEX idx_pending_invites_trip_email ON pending_invites (trip, email)'
			],
			// Members of the trip can list/view pending invites and revoke them
			// (revoke = delete). All gating beyond "is a member" lives in the
			// invites hook (validate inviter role per SPEC §3 on create; only
			// owner/co-owner can revoke).
			//
			// Create rule = null: legitimate path is the invites hook which
			// generates `code` and `expires_at` server-side. Allowing direct
			// client POST would let any member set arbitrary codes / lifetimes.
			//
			// Update rule = null: invites are immutable; to "change role" or
			// "extend expiry", revoke and re-invite.
			listRule:
				'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id',
			viewRule:
				'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id',
			createRule: null,
			updateRule: null,
			deleteRule:
				'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id'
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('pending_invites');
		app.delete(collection);
	}
);
