/// <reference path="../pb_data/types.d.ts" />
// #274 — Onboarding spine. Append-only field on the `users` auth collection:
// `onboarded_at` (nullable date). `null`/empty → the member has never completed
// the once-ever welcome walkthrough → the member-keyed welcome card auto-shows.
// Stamped when the member completes their first action OR taps "Got it".
//
// Per-user, once-ever (PRD §Complete-signal): a veteran invited to a new trip is
// never re-nagged. Gates ONLY the auto-show.
//
// goja DateField-truthy scar (cerebrum Do-Not-Repeat [2026-06-11], bug-133):
// PB's JSVM returns a TRUTHY DateTime for an EMPTY date field, so a hook must
// NEVER use `!!record.get('onboarded_at')`. This slice deliberately reads the
// signal in the APP layer (SvelteKit load), not a PB hook — the SvelteKit client
// receives the field as a plain string (`''` when unset, falsy), so the null
// path is correctly detected. No hook branches on this field. Should a hook ever
// need to, use `record.getString('onboarded_at')`.
//
// `users` already has explicit custom fields (0001) and system autodate fields
// (auth collections ship `created`/`updated` by default — the bug-185 explicit-
// field-collection caveat does not apply to the auth `users` collection). This
// migration only APPENDS one field; it never edits 0001 (append-only rule).
// `users.updateRule = SELF_ONLY` (0014) already lets a member stamp their own
// `onboarded_at` via the authed client — no rule change needed.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		const existing = users.fields.fieldNames();
		if (existing.indexOf('onboarded_at') === -1) {
			users.fields.add(new DateField({ name: 'onboarded_at', required: false }));
		}

		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		try {
			users.fields.removeByName('onboarded_at');
		} catch (_) {}
		app.save(users);
	}
);
