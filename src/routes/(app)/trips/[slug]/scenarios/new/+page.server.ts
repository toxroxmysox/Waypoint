import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, TripMember } from '$lib/types';
import type { PhaseSketchSegment } from '$lib/ideation/types';
import { normalizeSketchToWindow } from '$lib/ideation/scenario-planning';

// #337 — the scenario composer. Title first; dates / budget / sketch / keystones
// ALL optional (spec §Surface). Only forming trips have a board; a viewer can't
// pitch. `fork` query param pre-fills from an existing scenario (the fork path).
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { trip, membership } = await parent();

	if (trip.start_date) {
		// Dated trip — no scenario board. Bounce home.
		redirect(303, `/trips/${trip.slug}`);
	}
	if (membership.role === 'viewer') {
		redirect(303, `/trips/${trip.slug}`);
	}

	// Existing forming ideas (unplanned items) for the keystone picker.
	const ideas = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}"`,
		fields: 'id,title,type',
		sort: '-created'
	});

	// Fork pre-fill — copy the source scenario's shape (never its votes/points).
	let fork:
		| {
				id: string;
				title: string;
				pitch: string;
				dateStart: string;
				dateEnd: string;
				budgetPerPerson: number;
				sketch: PhaseSketchSegment[];
				keystones: string[];
		  }
		| null = null;
	const forkId = url.searchParams.get('fork');
	if (forkId) {
		try {
			const src = await locals.pb.collection('scenarios').getOne(forkId);
			if (src.trip === trip.id) {
				fork = {
					id: src.id,
					title: src.title,
					pitch: src.pitch || '',
					dateStart: src.date_start ? src.date_start.slice(0, 10) : '',
					dateEnd: src.date_end ? src.date_end.slice(0, 10) : '',
					budgetPerPerson: src.budget_per_person > 0 ? src.budget_per_person : 0,
					sketch: Array.isArray(src.phase_sketch) ? src.phase_sketch : [],
					keystones: Array.isArray(src.keystones) ? src.keystones : []
				};
			}
		} catch {
			fork = null;
		}
	}

	return {
		trip: { id: trip.id, slug: trip.slug, title: trip.title },
		ideas: ideas.map((i) => ({ id: i.id, title: i.title, type: i.type })),
		fork
	};
};

export const actions: Actions = {
	create: async ({ request, params, locals }) => {
		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			if (trip.start_date) return fail(400, { error: 'This trip already has dates.' });

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(
					`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
				);
			if (membership.role === 'viewer') {
				return fail(403, { error: 'Viewers can’t pitch scenarios.' });
			}

			const data = await request.formData();
			const title = data.get('title')?.toString().trim() || '';
			if (!title) return fail(400, { error: 'Give your scenario a title.', values: readValues(data) });
			if (title.length > 120) return fail(400, { error: 'Keep the title under 120 characters.', values: readValues(data) });

			const pitch = data.get('pitch')?.toString().trim() || '';
			if (pitch.length > 200) return fail(400, { error: 'Keep the pitch under 200 characters.', values: readValues(data) });

			const dateStart = data.get('date_start')?.toString() || '';
			const dateEnd = data.get('date_end')?.toString() || '';
			// Both-or-neither for dates at authoring (promotion re-checks both present).
			if ((dateStart && !dateEnd) || (!dateStart && dateEnd)) {
				return fail(400, { error: 'Set both dates, or leave both blank.', values: readValues(data) });
			}
			if (dateStart && dateEnd && new Date(dateStart) > new Date(dateEnd)) {
				return fail(400, { error: 'The start date is after the end date.', values: readValues(data) });
			}

			const budgetRaw = data.get('budget_per_person')?.toString().trim() || '';
			let budget = 0;
			if (budgetRaw) {
				const n = Number(budgetRaw);
				if (!Number.isFinite(n) || n < 0) {
					return fail(400, { error: 'Budget must be a positive number.', values: readValues(data) });
				}
				budget = Math.round(n);
			}

			// Sketch — JSON array of {name, days}. Normalized to the window when dates
			// exist (auto-stretch the last segment). Silently drop malformed rows.
			let sketch: PhaseSketchSegment[] = [];
			const sketchRaw = data.get('sketch')?.toString() || '';
			if (sketchRaw) {
				try {
					const parsed = JSON.parse(sketchRaw) as unknown;
					if (Array.isArray(parsed)) {
						sketch = parsed
							.map((s) => {
								const seg = s as { name?: unknown; days?: unknown };
								return {
									name: String(seg.name ?? '').trim().slice(0, 60),
									days: Math.max(1, Math.round(Number(seg.days) || 1))
								};
							})
							.filter((s) => s.name.length > 0);
					}
				} catch {
					sketch = [];
				}
			}
			if (sketch.length > 0 && dateStart && dateEnd) {
				sketch = normalizeSketchToWindow(sketch, dateStart, dateEnd);
			}

			// Keystones: existing idea ids the composer selected.
			const existingKeystones = data.getAll('keystone').map((v) => v.toString()).filter(Boolean);

			// Keystone quick-create: newline-separated titles → unplanned items via the
			// shared ideas capture path (/api/suggestions/create). Auto-approved
			// (owner/co_owner, or auto-approve trips) returns an item_id we attach; a
			// queued traveler suggestion returns no id and simply isn't attached yet.
			const quickCreated: string[] = [];
			const quickRaw = data.get('new_keystones')?.toString() || '';
			for (const line of quickRaw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 10)) {
				try {
					const res = (await locals.pb.send('/api/suggestions/create', {
						method: 'POST',
						body: { trip_id: trip.id, payload: { title: line.slice(0, 120), type: 'activity' } }
					})) as { item_id?: string };
					if (res.item_id) quickCreated.push(res.item_id);
				} catch {
					// Best-effort — a failed quick-create shouldn't sink the whole pitch.
				}
			}

			const keystones = [...new Set([...existingKeystones, ...quickCreated])];

			const body: Record<string, unknown> = {
				trip: trip.id,
				title,
				pitch,
				champion: membership.id,
				status: 'candidate',
				keystones,
				phase_sketch: sketch
			};
			if (dateStart && dateEnd) {
				body.date_start = dateStart + ' 00:00:00.000Z';
				body.date_end = dateEnd + ' 00:00:00.000Z';
			}
			if (budget > 0) body.budget_per_person = budget;

			const forkOf = data.get('fork_of')?.toString() || '';
			if (forkOf) {
				try {
					const src = await locals.pb.collection('scenarios').getOne(forkOf);
					if (src.trip === trip.id) body.fork_of = forkOf;
				} catch {
					// ignore a stale fork source
				}
			}

			const created = await locals.pb.collection('scenarios').create(body);
			redirect(303, `/trips/${params.slug}/scenarios/${created.id}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to create the scenario.' });
		}
	}
};

function readValues(data: FormData) {
	return {
		title: data.get('title')?.toString() ?? '',
		pitch: data.get('pitch')?.toString() ?? '',
		date_start: data.get('date_start')?.toString() ?? '',
		date_end: data.get('date_end')?.toString() ?? '',
		budget_per_person: data.get('budget_per_person')?.toString() ?? ''
	};
}
