import type { RequestHandler } from './$types';
import type {
	Trip,
	Phase,
	Day,
	Item,
	TripBudget,
	TripMember,
	Expense,
	Settlement,
	TripGoal,
	GoalVote,
	Document
} from '$lib/types';
import { buildTripExport } from '$lib/portability/export';
import { fetchManualChecklists } from '$lib/itinerary/checklist-loaders';
import { codesByItem } from '$lib/documents/codes';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const trip = await locals.pb
		.collection('trips')
		.getFirstListItem<Trip>(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

	await locals.pb
		.collection('trip_members')
		.getFirstListItem(`trip = "${trip.id}" && user = "${locals.user.id}" && removed_at = ""`);

	const [phases, days, items] = await Promise.all([
		locals.pb.collection('phases').getFullList<Phase>({
			filter: `trip = "${trip.id}"`,
			sort: 'order'
		}),
		locals.pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		}),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			sort: 'day,sort_order'
		})
	]);

	// Trip/phase-scoped manual checklists + their tasks (ADR-0003 §7).
	const { checklists, tasks: checklistTasks } = await fetchManualChecklists(locals.pb, trip.id);

	// #268 / ADR-0016 — confirmation codes now live as `kind: 'code'` Documents.
	// Fetch them (oldest-first → creation order) and key by item id for the export.
	const codeDocs = await locals.pb.collection('documents').getFullList<Document>({
		filter: `trip = "${trip.id}" && kind = "code"`,
		sort: 'created'
	});
	const codesByItemId = codesByItem(codeDocs);

	// Snapshot-only sections (money ledger + goals + member key). Exported for the
	// record; import deliberately skips them — see EXPORT COVERAGE in export.ts.
	const [members, expenses, settlements, goals] = await Promise.all([
		locals.pb
			.collection('trip_members')
			.getFullList<TripMember>({ filter: `trip = "${trip.id}"`, sort: 'joined_at' }),
		locals.pb
			.collection('expenses')
			.getFullList<Expense>({ filter: `trip = "${trip.id}"`, sort: 'date' }),
		locals.pb
			.collection('settlements')
			.getFullList<Settlement>({ filter: `trip = "${trip.id}"`, sort: 'date' }),
		locals.pb
			.collection('trip_goals')
			.getFullList<TripGoal>({ filter: `trip = "${trip.id}"`, sort: 'sort_order' })
	]);

	const goalIds = goals.map((g) => g.id);
	const goalVotes =
		goalIds.length > 0
			? await locals.pb.collection('goal_votes').getFullList<GoalVote>({
					filter: goalIds.map((id) => `goal = "${id}"`).join(' || ')
				})
			: [];

	let budget = null;
	try {
		const tripBudget = await locals.pb
			.collection('trip_budgets')
			.getFirstListItem<TripBudget>(`trip = "${trip.id}"`);
		if (tripBudget) {
			budget = { categories: tripBudget.categories || [] };
		}
	} catch {
		// No budget
	}

	const exportData = buildTripExport(
		trip,
		phases,
		days,
		items,
		budget,
		checklists,
		checklistTasks,
		members,
		expenses,
		settlements,
		goals,
		goalVotes,
		codesByItemId
	);
	const filename = `waypoint-${trip.slug}-${new Date().toISOString().split('T')[0]}.json`;

	return new Response(JSON.stringify(exportData, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
