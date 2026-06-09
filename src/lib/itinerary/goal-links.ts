// #78 — Item↔Goal link reconciliation. The link lives goal-side on
// `trip_goals.items` (so "anyone can link" writes the GOAL record, never the
// item — travelers still can't edit items). Both the item create and edit flows
// funnel their "Addresses goal(s)" selection through here.
import type PocketBase from 'pocketbase';
import type { TripGoal } from './types';

/**
 * Reconcile which of a trip's goals link `itemId` against the desired set.
 * Adds the item to newly-selected goals and removes it from de-selected ones;
 * untouched goals are left alone. Writes only goal records.
 *
 * @param pb authenticated PocketBase client (PB rules/hooks gate the writes)
 * @param tripId the trip whose goals are in scope
 * @param itemId the item being linked
 * @param selectedGoalIds goal ids the item should be linked to after this call
 */
export async function syncGoalLinks(
	pb: PocketBase,
	tripId: string,
	itemId: string,
	selectedGoalIds: string[]
): Promise<void> {
	const goals = await pb.collection('trip_goals').getFullList<TripGoal>({
		filter: `trip = "${tripId}"`,
		fields: 'id,items'
	});

	const desired = new Set(selectedGoalIds);
	for (const goal of goals) {
		const linked = (goal.items ?? []).includes(itemId);
		if (desired.has(goal.id) && !linked) {
			// PB relation-append modifier — leaves other links on the goal intact.
			await pb.collection('trip_goals').update(goal.id, { 'items+': itemId });
		} else if (!desired.has(goal.id) && linked) {
			await pb.collection('trip_goals').update(goal.id, { 'items-': itemId });
		}
	}
}
