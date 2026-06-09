/// <reference path="../pb_data/types.d.ts" />
// Documents S1 (#70) — the `documents` collection.
//
// Plain (unencrypted) file artifacts attached to a trip, or to a single item
// within it. Membership-gated like all trip data (ADR-0005 — no encryption).
//
//   trip        relation → trips        required, cascadeDelete
//   item        relation → items        nullable; set = item-scoped,
//                                        null = trip-scoped; cascadeDelete
//   file        file (single)           PDF + images only, 20 MB, protected
//   caption     text                    optional label (e.g. pasted screenshots)
//   uploaded_by relation → trip_members required (auto-set in hook)
//
// Rules (PRD §Permissions):
//   list/view/create — any trip member (MEMBER_VIA_TRIP).
//                      Viewers are blocked from create by documents.pb.js.
//   update           — none (v4 documents are immutable artifacts; no edit UI).
//   delete           — any member by rule; documents.pb.js narrows to the
//                      uploader OR owner/co_owner.
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const items = app.findCollectionByNameOrId('items');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'documents',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				// Nullable item relation. cascadeDelete so deleting an item destroys
				// its documents (PRD — paired with a count-naming delete confirmation).
				{ type: 'relation', name: 'item', required: false, collectionId: items.id, maxSelect: 1, cascadeDelete: true },
				{
					type: 'file',
					name: 'file',
					required: true,
					maxSelect: 1,
					// 20 MB cap (PRD). Bytes.
					maxSize: 20971520,
					// PDF + images only — the real enforcement (client pre-checks for UX).
					// HEIC/HEIF allowed for upload; browsers may not render it (download
					// fallback), no transcoding in v4.
					mimeTypes: [
						'application/pdf',
						'image/jpeg',
						'image/png',
						'image/webp',
						'image/heic',
						'image/heif'
					],
					// Protected: files require a short-lived file token to download, so a
					// leaked URL can't be opened by a non-member. The app mints tokens
					// server-side (see the document file endpoint).
					protected: true
				},
				{ type: 'text', name: 'caption', required: false, max: 500 },
				{ type: 'relation', name: 'uploaded_by', required: true, collectionId: tripMembers.id, maxSelect: 1 }
			],
			indexes: [
				'CREATE INDEX idx_documents_trip ON documents (trip)',
				'CREATE INDEX idx_documents_item ON documents (item)'
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			createRule: MEMBER_VIA_TRIP,
			// Immutable in v4.
			updateRule: null,
			// Member by rule; uploader-or-owner/co_owner enforced in documents.pb.js.
			deleteRule: MEMBER_VIA_TRIP
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('documents');
		app.delete(collection);
	}
);
