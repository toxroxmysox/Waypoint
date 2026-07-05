import type PocketBase from 'pocketbase';
import type { TripMember } from '$lib/collaboration/types';
import type { Item } from '$lib/itinerary/types';
import { withAvatarUrls, type MemberWithAvatar } from '$lib/collaboration/member-avatar';
import type { Scenario, ScenarioVote, ScenarioPoint, PhaseSketchSegment } from './types';
import { boardLiveDimensions, scenarioDimensions, type ConvergeDimensions } from './scenario-planning';

/** A scenario decorated with everything a board card renders — its own votes,
 *  pro/con counts, keystone labels, champion display, fork lineage, and the
 *  converge empty-slots it should show. Pure display shape (no PB types leak). */
export interface BoardScenario {
	id: string;
	title: string;
	pitch: string;
	championName: string;
	championId: string;
	forkOfTitle: string; // '' when not a fork
	dateStart: string;
	dateEnd: string;
	nights: number; // 0 when no dates
	budgetPerPerson: number; // 0 = no budget
	sketch: PhaseSketchSegment[];
	keystoneLabels: string[];
	votes: { id: string; member: string; value: ScenarioVote['value'] }[];
	proCount: number;
	conCount: number;
	status: Scenario['status'];
	dimensions: ConvergeDimensions;
	emptySlots: ConvergeDimensions;
	canManage: boolean; // caller is champion (edit/delete)
}

export interface ScenarioBoardData {
	scenarios: BoardScenario[];
	members: MemberWithAvatar[];
	/** Which dimensions are live on the board (drives whether sections render). */
	liveDimensions: ConvergeDimensions;
	/** ids of every candidate scenario that carries both dates — promotable. */
	promotableIds: string[];
}

function nightsBetween(start: string, end: string): number {
	if (!start || !end) return 0;
	const a = new Date(start.slice(0, 10) + 'T00:00:00.000Z').getTime();
	const b = new Date(end.slice(0, 10) + 'T00:00:00.000Z').getTime();
	return Math.round((b - a) / 86_400_000);
}

/**
 * Load the scenario board for a forming trip (#337). Fetches candidate scenarios
 * (expanding champion, keystones, fork_of), their votes + pros/cons, and the active
 * members for avatar stacks — then decorates each into a display-ready BoardScenario.
 * Archived/won scenarios are excluded from the live board (they live in the decision
 * record). `callerMemberId` flags the caller's own championed cards as manageable.
 */
export async function loadScenarioBoard(
	pb: PocketBase,
	tripId: string,
	callerMemberId: string
): Promise<ScenarioBoardData> {
	const scenarios = await pb.collection('scenarios').getFullList<Scenario>({
		filter: `trip = "${tripId}" && status = "candidate"`,
		sort: 'created',
		expand: 'champion.user,keystones,fork_of'
	});

	if (scenarios.length === 0) {
		return { scenarios: [], members: [], liveDimensions: emptyDims(), promotableIds: [] };
	}

	const scenarioIds = scenarios.map((s) => s.id);
	const orFilter = scenarioIds.map((id) => `scenario = "${id}"`).join(' || ');
	const [votes, points, membersRaw] = await Promise.all([
		pb.collection('scenario_votes').getFullList<ScenarioVote>({ filter: orFilter }),
		pb.collection('scenario_points').getFullList<ScenarioPoint>({ filter: orFilter }),
		pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${tripId}" && removed_at = ""`,
			expand: 'user'
		})
	]);
	const members = withAvatarUrls(pb, membersRaw as never);

	const votesByScenario: Record<string, ScenarioVote[]> = {};
	for (const v of votes) (votesByScenario[v.scenario] ??= []).push(v);
	const proByScenario: Record<string, number> = {};
	const conByScenario: Record<string, number> = {};
	for (const p of points) {
		if (p.kind === 'pro') proByScenario[p.scenario] = (proByScenario[p.scenario] ?? 0) + 1;
		else conByScenario[p.scenario] = (conByScenario[p.scenario] ?? 0) + 1;
	}

	const liveDimensions = boardLiveDimensions(scenarios);

	const board: BoardScenario[] = scenarios.map((s) => {
		const champion = s.expand?.champion;
		const championUser = champion?.expand?.user;
		const championName =
			champion?.display_name || champion?.placeholder_name || championUser?.name || 'Someone';
		const sketch = Array.isArray(s.phase_sketch) ? s.phase_sketch : [];
		const dims = scenarioDimensions(s);
		return {
			id: s.id,
			title: s.title,
			pitch: s.pitch || '',
			championName,
			championId: s.champion,
			forkOfTitle: s.expand?.fork_of?.title || '',
			dateStart: s.date_start ? s.date_start.slice(0, 10) : '',
			dateEnd: s.date_end ? s.date_end.slice(0, 10) : '',
			nights: nightsBetween(s.date_start, s.date_end),
			budgetPerPerson: s.budget_per_person > 0 ? s.budget_per_person : 0,
			sketch,
			keystoneLabels: (s.expand?.keystones ?? []).map((k: Item) => k.title),
			votes: (votesByScenario[s.id] ?? []).map((v) => ({
				id: v.id,
				member: v.member,
				value: v.value
			})),
			proCount: proByScenario[s.id] ?? 0,
			conCount: conByScenario[s.id] ?? 0,
			status: s.status,
			dimensions: dims,
			emptySlots: {
				dates: liveDimensions.dates && !dims.dates,
				budget: liveDimensions.budget && !dims.budget,
				sketch: liveDimensions.sketch && !dims.sketch,
				keystones: liveDimensions.keystones && !dims.keystones
			},
			canManage: s.champion === callerMemberId
		};
	});

	const promotableIds = scenarios.filter((s) => s.date_start && s.date_end).map((s) => s.id);

	return { scenarios: board, members, liveDimensions, promotableIds };
}

function emptyDims(): ConvergeDimensions {
	return { dates: false, budget: false, sketch: false, keystones: false };
}
