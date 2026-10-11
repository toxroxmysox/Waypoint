// #503 / ADR-0025 §6 — the two write switches above PB's own rules: the server
// switch (MCP_WRITES=off removes the write tools everywhere) and the trip's
// "AI can make changes" (needs "AI can read"; viewers can't write in the app).
import { AI_OFF_NOTICE } from '../present';
import type { TripRef } from '../context';

export const AI_WRITE_OFF = 'AI changes are turned off for this trip by its owner.';
export const VIEWER_NO_WRITE = "Viewers can't change this trip.";

export function writesEnabled(env: Record<string, string | undefined>): boolean {
	return env.MCP_WRITES !== 'off';
}

/** Throws the plain reason the AI can't change this trip, or returns. */
export function assertCanWrite(ref: TripRef): void {
	if (ref.canWrite) return;
	if (!ref.open) throw new Error(AI_OFF_NOTICE);
	if (ref.role === 'viewer') throw new Error(VIEWER_NO_WRITE);
	throw new Error(AI_WRITE_OFF);
}
