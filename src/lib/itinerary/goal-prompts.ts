// Curated prompt set for the goal-capture wizard (V4_GROUP_INPUT_PRD → "Capture
// minigame"). A small core set (~8) with LIGHT location injection from the trip's
// location_summary / countries, degrading to a generic variant when the trip has
// no destination yet. Pure + deterministic → unit-tested; the route shuffles the
// returned list (once-per-session = once per page load).

export interface GoalPrompt {
	id: string;
	text: string;
}

interface PromptTemplate {
	id: string;
	/** Location-injected variant. `{place}` is replaced with the trip's place phrase. */
	located: string;
	/** Fallback when the trip has no destination yet. */
	generic: string;
	/** #403 — the short context shown above a goal that answered this prompt. */
	kicker: string;
}

const PROMPTS: PromptTemplate[] = [
	{ id: 'food', located: 'A food you have to try in {place}?', generic: 'A food you have to try?', kicker: 'Food to try' },
	{
		id: 'experience',
		located: 'An experience in {place} you’d regret missing?',
		generic: 'An experience you’d regret missing?',
		kicker: 'Can’t miss'
	},
	{
		id: 'sight',
		located: 'A place in {place} you can’t leave without seeing?',
		generic: 'A place you can’t leave without seeing?',
		kicker: 'Must see'
	},
	{
		id: 'splurge',
		located: 'One splurge in {place} that would be worth it?',
		generic: 'One splurge that would be worth it?',
		kicker: 'Worth the splurge'
	},
	{
		id: 'relax',
		located: 'How do you most want to unwind in {place}?',
		generic: 'How do you most want to unwind on this trip?',
		kicker: 'Way to unwind'
	},
	{
		id: 'memory',
		located: 'What would make {place} unforgettable?',
		generic: 'What would make this trip unforgettable?',
		kicker: 'Makes it unforgettable'
	},
	{
		id: 'local',
		located: 'Something only locals in {place} would know to do?',
		generic: 'Something off the typical tourist path?',
		kicker: 'Local find'
	},
	{
		id: 'together',
		located: 'One thing the group has to do together in {place}?',
		generic: 'One thing the group has to do together?',
		kicker: 'All together'
	}
];

/**
 * The human place phrase for prompt injection: prefer the trip's location_summary,
 * else fold its countries into a readable list, else null (→ generic prompts).
 */
export function locationPhrase(location_summary: string, countries: string[]): string | null {
	const summary = location_summary?.trim();
	if (summary) return summary;
	const named = (countries ?? []).map((c) => c?.trim()).filter(Boolean) as string[];
	if (named.length === 0) return null;
	if (named.length === 1) return named[0];
	if (named.length === 2) return `${named[0]} & ${named[1]}`;
	return `${named.slice(0, -1).join(', ')} & ${named[named.length - 1]}`;
}

/** Resolve the curated prompt set for a trip, injecting location or degrading to generic. */
export function buildGoalPrompts(location_summary: string, countries: string[]): GoalPrompt[] {
	const place = locationPhrase(location_summary, countries);
	return PROMPTS.map((p) => ({
		id: p.id,
		text: place ? p.located.replace('{place}', place) : p.generic
	}));
}

/**
 * #403 — the kicker for a goal's stored `prompt` id ("Food to try"), or '' for a
 * goal typed outside the deck or an id no longer in the set.
 */
export function promptKicker(id: string | undefined | null): string {
	return PROMPTS.find((p) => p.id === id)?.kicker ?? '';
}
