/// <reference path="../pb_data/types.d.ts" />
// #268 slice 1 (ADR-0016) — confirmation codes become first-class Documents.
//
// The `documents` collection (0032) was file-centric (`file` required:true). This
// migration extends it so a single collection holds BOTH file artifacts and
// confirmation codes, discriminated by a new `kind` select:
//
//   kind        select ['file','code']   default 'file' (existing rows backfilled)
//   file        file (single)            RELAXED required:false (code rows have none)
//   code_label  text                     optional label  (e.g. "Hotel conf.")
//   code_value  text                     the code itself  (non-empty for code rows)
//
// file-XOR-code is NOT expressible in the schema → enforced in documents.pb.js:
// kind='file' requires a `file`; kind='code' requires a non-empty `code_value`.
//
// APPEND-ONLY (project rule): this migration only ADDS fields, RELAXES one
// constraint, and ADDS rows. It never deletes the legacy `items.confirmation_codes`
// json field (0006) — slices 2/3 repoint readers and leave it inert. Existing
// `documents` rows are backfilled to kind='file' so every row is unambiguous (a
// non-required select otherwise stores "" for legacy rows; "default file" is made
// real here + in the create hook).
//
// BACKFILL: for every item whose `confirmation_codes` json (shape {label,value}[])
// is non-empty, ONE kind='code' document is created per entry (trip/item/
// code_label/code_value). `documents.uploaded_by` is a REQUIRED trip_members
// relation that codes never carried → resolved by fallback:
//   1. the item's `booked_by`, IF it resolves to an ACTIVE member of that trip;
//   2. else the trip's owner/creator member (role='owner', the auto-seeded
//      creator membership — trips.pb.js).
// `uploaded_by` is stored for schema integrity but NOT surfaced in the UI for
// code rows (ADR-0016 — backfilled attribution is a fiction; that's slice 2).
//
// goja json scar (cf. budgets.pb.js / expenses.pb.js): a json field read in the
// JSVM can come back as a byte array OR a string — robust-parse both forms.
// Idempotent: backfilled code documents are skipped if an identical
// (item,code_label,code_value) kind='code' row already exists, so a re-run adds
// nothing.
migrate(
	(app) => {
		const documents = app.findCollectionByNameOrId('documents');

		// --- 1. Relax `file` to optional (code rows have no file) ---
		const fileField = documents.fields.getByName('file');
		fileField.required = false;

		// --- 2. Add discriminator + code fields (idempotent) ---
		const existing = documents.fields.fieldNames();
		if (existing.indexOf('kind') === -1) {
			documents.fields.add(
				new SelectField({
					name: 'kind',
					required: false,
					maxSelect: 1,
					values: ['file', 'code']
				})
			);
		}
		if (existing.indexOf('code_label') === -1) {
			documents.fields.add(new TextField({ name: 'code_label', required: false, max: 200 }));
		}
		if (existing.indexOf('code_value') === -1) {
			documents.fields.add(new TextField({ name: 'code_value', required: false, max: 500 }));
		}

		app.save(documents);

		// --- 3. Backfill existing file documents to kind='file' ---
		// A non-required select stores "" for legacy rows; stamp 'file' so every
		// pre-existing row is unambiguously a file artifact (matches ADR default).
		let existingDocs = [];
		try {
			existingDocs = app.findRecordsByFilter('documents', '', '', 0, 0);
		} catch (_) {
			existingDocs = [];
		}
		for (const doc of existingDocs) {
			if (doc.getString('kind') === '') {
				doc.set('kind', 'file');
				app.save(doc);
			}
		}

		// --- 4. Backfill confirmation codes → kind='code' documents ---
		let items = [];
		try {
			// items with a non-empty json confirmation_codes field.
			items = app.findRecordsByFilter(
				'items',
				'confirmation_codes != "" && confirmation_codes != "[]" && confirmation_codes != "null"',
				'',
				0,
				0
			);
		} catch (_) {
			items = [];
		}

		for (const item of items) {
			// Robust json read (goja byte-array OR string — cf. budgets.pb.js).
			let codes = item.get('confirmation_codes');
			if (Array.isArray(codes) && codes.length > 0 && typeof codes[0] === 'number') {
				try {
					codes = JSON.parse(String.fromCharCode.apply(null, codes));
				} catch (_) {
					codes = [];
				}
			} else if (typeof codes === 'string') {
				try {
					codes = JSON.parse(codes);
				} catch (_) {
					codes = [];
				}
			}
			if (!Array.isArray(codes) || codes.length === 0) continue;

			const tripId = item.get('trip');
			if (!tripId) continue;

			// --- Resolve uploaded_by (fallback chain) ---
			// 1. item.booked_by, IF it's an active member of this trip.
			let uploadedById = '';
			const bookedById = item.get('booked_by');
			if (bookedById) {
				try {
					const bookedMember = app.findRecordById('trip_members', bookedById);
					if (
						bookedMember &&
						bookedMember.get('trip') === tripId &&
						bookedMember.getString('removed_at') === ''
					) {
						uploadedById = bookedMember.id;
					}
				} catch (_) {
					/* booked_by didn't resolve → fall through */
				}
			}

			// 2. else the trip's owner/creator member (active).
			if (!uploadedById) {
				try {
					const owner = app.findFirstRecordByFilter(
						'trip_members',
						'trip = {:tripId} && role = "owner" && removed_at = ""',
						{ tripId: tripId }
					);
					if (owner) uploadedById = owner.id;
				} catch (_) {
					/* no active owner found */
				}
			}
			// Last resort: any active member of the trip (keeps the required
			// relation satisfiable even on a malformed trip; should never hit on
			// real data because trips.pb.js always seeds an owner).
			if (!uploadedById) {
				try {
					const anyMember = app.findFirstRecordByFilter(
						'trip_members',
						'trip = {:tripId} && removed_at = ""',
						{ tripId: tripId }
					);
					if (anyMember) uploadedById = anyMember.id;
				} catch (_) {
					/* trip has no members at all → skip (cannot satisfy required) */
				}
			}
			if (!uploadedById) continue;

			const docsCollection = app.findCollectionByNameOrId('documents');
			for (const entry of codes) {
				if (!entry || typeof entry !== 'object') continue;
				const label = entry.label == null ? '' : String(entry.label);
				const value = entry.value == null ? '' : String(entry.value);
				// A code with no value is meaningless — skip (hook would reject it).
				if (value === '') continue;

				// Idempotency: skip if an identical code doc already exists.
				let dup = null;
				try {
					dup = app.findFirstRecordByFilter(
						'documents',
						'kind = "code" && item = {:itemId} && code_value = {:value} && code_label = {:label}',
						{ itemId: item.id, value: value, label: label }
					);
				} catch (_) {
					dup = null;
				}
				if (dup) continue;

				const doc = new Record(docsCollection);
				doc.set('kind', 'code');
				doc.set('trip', tripId);
				doc.set('item', item.id);
				doc.set('code_label', label);
				doc.set('code_value', value);
				doc.set('uploaded_by', uploadedById);
				app.save(doc);
			}
		}
	},
	(app) => {
		// Down: remove the backfilled code documents, then drop the added fields
		// and restore `file` to required. (We do NOT touch items.confirmation_codes
		// — it was never modified up.) The kind='file' stamp on legacy rows is left
		// as-is; dropping the `kind` field removes it anyway.
		try {
			const codeDocs = app.findRecordsByFilter('documents', 'kind = "code"', '', 0, 0);
			for (const doc of codeDocs) {
				app.delete(doc);
			}
		} catch (_) {
			/* nothing to clean */
		}

		const documents = app.findCollectionByNameOrId('documents');
		try {
			documents.fields.removeByName('kind');
		} catch (_) {}
		try {
			documents.fields.removeByName('code_label');
		} catch (_) {}
		try {
			documents.fields.removeByName('code_value');
		} catch (_) {}
		const fileField = documents.fields.getByName('file');
		fileField.required = true;
		app.save(documents);
	}
);
