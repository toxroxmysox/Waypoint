import { expect, type Browser, type Page } from '@playwright/test';
import { E2E_BASE, E2E_PB_BASE } from './e2e-env';

// #401 — the Japan-shaped trip v3.3's phase/overview specs share: the
// rules-fixture's members (owner / traveler / viewer), its trip re-dated over
// REST to Tokyo Nov 18–22 + Kanazawa Nov 22–24, 2027 (Nov 22 = shared Travel Day
// with a train), one owner idea and one traveler-attributed idea in Tokyo.

const BASE = E2E_BASE;
const PB_BASE = E2E_PB_BASE;
export const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

export type JapanFx = {
	tripId: string;
	tokyo: string;
	kanazawa: string;
	days: Record<string, string>; // 'YYYY-MM-DD' → id
	train: string;
	ownerIdea: string;
	travelerIdea: string;
};

export async function token(email: string): Promise<string> {
	const res = await fetch(`${PB_BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	return ((await res.json()) as { token: string }).token;
}

export async function pb(t: string, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
	const res = await fetch(`${PB_BASE}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	expect(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(json)}`).toBe(true);
	return json;
}

export async function devLogin(browser: Browser, email: string): Promise<{ page: Page; close: () => Promise<void> }> {
	const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/api/dev/login?email=${encodeURIComponent(email)}`);
	await page.waitForURL(`${BASE}/trips`, { timeout: 15000 });
	return { page, close: () => ctx.close() };
}

export async function seedJapanTrip(SLUG: string): Promise<JapanFx> {
	const owner = await token(EMAILS.owner);
	const res = await fetch(`${PB_BASE}/api/dev/rules-fixture`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner}` },
		body: JSON.stringify({ emails: EMAILS, slug: SLUG })
	});
	expect(res.ok, `rules-fixture: ${res.status}`).toBe(true);
	const base = (await res.json()) as {
		tripId: string;
		phaseId: string;
		memberIds: { owner: string; traveler: string };
	};
	const tripId = base.tripId;
	// The fixture's extra "Test Phase" overlaps the seeded one; drop it, then re-date
	// the trip so the hooks regenerate days and retile the remaining phase.
	await pb(owner, 'DELETE', `/api/collections/phases/records/${base.phaseId}`);
	await pb(owner, 'PATCH', `/api/collections/trips/records/${tripId}`, {
		start_date: '2027-11-18 00:00:00.000Z',
		end_date: '2027-11-24 00:00:00.000Z'
	});
	const remaining = (await pb(owner, 'GET', `/api/collections/phases/records?filter=${encodeURIComponent(`trip="${tripId}"`)}`))
		.items as { id: string }[];
	expect(remaining).toHaveLength(1);
	const tokyo = remaining[0].id;
	await pb(owner, 'PATCH', `/api/collections/phases/records/${tokyo}`, { name: 'Tokyo', notes: '' });
	const kan = await pb(owner, 'POST', '/api/collections/phases/records', {
		trip: tripId,
		name: 'Kanazawa',
		start_date: '2027-11-22 00:00:00.000Z',
		end_date: '2027-11-24 00:00:00.000Z',
		order: 1
	});
	const dayList = (await pb(owner, 'GET', `/api/collections/days/records?perPage=50&filter=${encodeURIComponent(`trip="${tripId}"`)}`))
		.items as { id: string; date: string }[];
	const days: Record<string, string> = {};
	for (const d of dayList) days[d.date.slice(0, 10)] = d.id;

	const train = await pb(owner, 'POST', '/api/collections/items/records', {
		trip: tripId,
		phase: tokyo,
		day: days['2027-11-22'],
		type: 'transportation',
		title: 'Shinkansen to Kanazawa',
		status: 'planned',
		start_time: '2027-11-22 10:00:00.000Z',
		sort_order: 100,
		created_by: base.memberIds.owner
	});
	const ownerIdea = await pb(owner, 'POST', '/api/collections/items/records', {
		trip: tripId,
		phase: tokyo,
		day: '',
		type: 'activity',
		title: 'TeamLab Planets',
		status: 'unplanned',
		sort_order: 100,
		created_by: base.memberIds.owner
	});
	// Travelers suggest; an approved suggestion is an item the traveler created.
	// Seed that end state directly as the owner, attributed to the traveler.
	const travelerIdea = await pb(owner, 'POST', '/api/collections/items/records', {
		trip: tripId,
		phase: tokyo,
		day: '',
		type: 'meal',
		title: 'Tsukiji breakfast',
		status: 'unplanned',
		sort_order: 200,
		created_by: base.memberIds.traveler
	});
	const fx: JapanFx = {
		tripId,
		tokyo,
		kanazawa: kan.id as string,
		days,
		train: train.id as string,
		ownerIdea: ownerIdea.id as string,
		travelerIdea: travelerIdea.id as string
	};
	return fx;
}
