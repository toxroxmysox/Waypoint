// #503 / ADR-0025 §3 — proposals wait here between propose and commit: 15
// minutes, in memory (a restart only costs a re-propose), bound to the user and
// connection that made them. A committed proposal stays until it expires so a
// second commit (Confirm tapped *and* "yes") answers "Already saved".
import { randomBytes } from 'node:crypto';
import type { PlannedChange, Proposal } from './types';

export const PROPOSAL_TTL_MS = 15 * 60_000;
const MAX_PROPOSALS = 1000;

// globalThis-anchored so Vite HMR in dev doesn't drop proposals (as oauth/pending.ts).
const g = globalThis as unknown as { __waypointProposals?: Map<string, Proposal> };
const store = (g.__waypointProposals ??= new Map());

function sweep(now: number) {
	for (const [id, p] of store) if (p.expiresAt <= now) store.delete(id);
	for (const id of store.keys()) {
		if (store.size < MAX_PROPOSALS) break;
		store.delete(id);
	}
}

export function saveProposal(p: Omit<Proposal, 'id' | 'expiresAt'>, now = Date.now()): Proposal {
	sweep(now);
	const proposal: Proposal = { ...p, id: randomBytes(12).toString('base64url'), expiresAt: now + PROPOSAL_TTL_MS };
	store.set(proposal.id, proposal);
	return proposal;
}

export function takeProposal(id: string, userId: string, connectionId: string, now = Date.now()): Proposal | 'expired' | 'not_yours' {
	const p = store.get(id);
	if (!p || p.expiresAt <= now) return 'expired';
	if (p.userId !== userId || p.connectionId !== connectionId) return 'not_yours';
	return p;
}

export function markCommitted(id: string, changeId: string): void {
	const p = store.get(id);
	if (p) p.committedChangeId = changeId;
}

const norm = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Fields whose current value differs from the preview's `before`. A missing record: all of them. */
export function staleFields(change: PlannedChange, current: Record<string, unknown> | null): string[] {
	if (!change.before) return [];
	const fields = Object.keys(change.before);
	if (!current) return fields;
	return fields.filter((f) => norm(current[f]) !== norm(change.before![f]));
}
