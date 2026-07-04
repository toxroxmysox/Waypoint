/// <reference path="../pb_data/types.d.ts" />
// #269 (ADR-0007) — the `memories` collection: Trip Memory bounded context.
//
// Per-member, per-day experiential capture: ONE photo + ONE thought, per trip
// member, per day. The cap is architectural (ADR-0007) — enforced by the unique
// (day, author) index, not UI discipline. A Memory is NOT a Document (separate
// collection, separate context; see the ADR's axis table).
//
//   trip    relation → trips        required, cascadeDelete
//   day     relation → days         required, cascadeDelete
//   author  relation → trip_members required (auto-pinned in memories.pb.js)
//   photo   file (single image)     nullable; jpg/png/webp/heic, 20 MB,
//                                   protected (member-only — proxied like
//                                   documents; never a bare public URL)
//   thought text                    nullable; max 280 chars (tweet-length)
//   created/updated autodate        (explicit-field collections get NO implicit
//                                   timestamps — bug-185)
//
// "At least one of {photo, thought}" is not expressible in the schema →
// enforced in memories.pb.js (create + update).
//
// Rules (PRD §Permissions):
//   list/view — ALL trip members, including viewers (memories are for the
//               travelers; review is shared). NEVER public — no archive rule.
//   create    — owner/co_owner/traveler authoring as THEMSELVES (author.user =
//               auth); viewers are read-only. Mirrors trip_goals.createRule.
//   update    — author only. Personal expression, not shared plan data —
//               deliberately stricter than documents (no owner override).
//   delete    — author only. No moderation override in v4 (PRD).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const days = app.findCollectionByNameOrId('days');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		const AUTHOR_SELF = ' && author.user = @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'memories',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'day', required: true, collectionId: days.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'author', required: true, collectionId: tripMembers.id, maxSelect: 1 },
				{
					type: 'file',
					name: 'photo',
					required: false,
					maxSelect: 1,
					// 20 MB cap (matches documents).
					maxSize: 20971520,
					// Images ONLY — no PDF (a memory is never a document). HEIC allowed
					// for upload; browsers may not render it (download-link fallback),
					// transcoding is a shelved shared capability (PRD).
					mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
					// Protected: served only with a short-lived file token, minted
					// server-side behind the membership gate (same posture as documents
					// — memory photos contain faces/kids/locations).
					protected: true
				},
				{ type: 'text', name: 'thought', required: false, max: 280 },
				{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
				{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
			],
			indexes: [
				// THE cap (ADR-0007): one memory per member per day. Editing replaces;
				// two memories for the same (day, author) can never exist.
				'CREATE UNIQUE INDEX idx_memories_day_author ON memories (day, author)',
				'CREATE INDEX idx_memories_trip ON memories (trip)'
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			// Author as yourself; viewers read-only (single relation → role check is
			// unambiguous, mirroring trip_goals 0040 / votes 0055).
			createRule: MEMBER_VIA_TRIP + AUTHOR_SELF + ' && author.role != "viewer"',
			// Author ONLY — stricter than documents by design (PRD §Permissions).
			updateRule: MEMBER_VIA_TRIP + AUTHOR_SELF,
			deleteRule: MEMBER_VIA_TRIP + AUTHOR_SELF
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('memories');
		app.delete(collection);
	}
);
