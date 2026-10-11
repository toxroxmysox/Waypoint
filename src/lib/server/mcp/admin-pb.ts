// #502 — PocketBase clients for the MCP server. A tool call runs as the connected
// user, so PB's own rules decide what they can read (ADR-0024 §1). The user's PB
// token is minted here by superuser impersonation, kept in memory, and never
// leaves the server: Claude only ever holds Waypoint's opaque OAuth token.
import type PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import { createPb } from '$lib/shell/pb';

const IMPERSONATE_S = 900;

let admin: Promise<PocketBase> | null = null;
const users = new Map<string, { pb: PocketBase; exp: number }>();

async function authAdmin(): Promise<PocketBase> {
	const pb = createPb();
	await pb.collection('_superusers').authWithPassword(env.PB_ADMIN_EMAIL!, env.PB_ADMIN_PASSWORD!);
	return pb;
}

/** Cached superuser client; re-authenticates once its token stops being valid. */
export async function adminPb(): Promise<PocketBase> {
	if (admin) {
		const pb = await admin.catch(() => null);
		if (pb?.authStore.isValid) return pb;
	}
	admin = authAdmin();
	admin.catch(() => (admin = null));
	return admin;
}

/** A client authenticated as `userId`, valid ≥60 s from now. */
export async function userPb(userId: string): Promise<PocketBase> {
	const hit = users.get(userId);
	if (hit && hit.exp - Date.now() > 60_000) return hit.pb;
	const pb = await (await adminPb()).collection('users').impersonate(userId, IMPERSONATE_S);
	users.set(userId, { pb, exp: Date.now() + IMPERSONATE_S * 1000 });
	return pb;
}
