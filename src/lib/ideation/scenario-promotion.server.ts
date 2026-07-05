import type PocketBase from 'pocketbase';

/**
 * Trigger the promotion cascade (#337, spec §Promotion). The heavy lifting — dating
 * the trip, turning the sketch into real phases, seeding the budget, minting the
 * IMMUTABLE decision record, archiving the losers — runs SERVER-SIDE in an admin
 * context (backend/pb_hooks/scenarios.pb.js → POST /api/scenarios/promote). It must:
 *   - write `decisions`, whose client create rule is null (DENY_ALL) — only the
 *     admin-context hook may mint one (spec: "created by hook at promotion");
 *   - flip the status of LOSING scenarios championed by others (the champion-only
 *     edit gate would 403 a caller-context write).
 *
 * So the cascade can't run through the caller's authed client record-by-record. This
 * calls the hook route via `pb.send` — the request-scoped client's own base + auth
 * token (never a raw fetch to a public base; the SSR-via-tunnel / token-mismatch
 * scar). The caller (owner/co_owner) is re-authorized inside the hook.
 */
export async function promoteScenario(
	pb: PocketBase,
	tripId: string,
	scenarioId: string
): Promise<void> {
	await pb.send('/api/scenarios/promote', {
		method: 'POST',
		body: { trip_id: tripId, scenario_id: scenarioId }
	});
}
