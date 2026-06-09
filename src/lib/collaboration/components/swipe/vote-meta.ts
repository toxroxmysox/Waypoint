import type { VoteValue } from '$lib/collaboration/voting';

/**
 * Compass dressing for the four vote options. Colors mirror the shipped
 * VoteButtons voice (Love = moss solid, Like = moss tint, Flexible = neutral,
 * Pass = clay tint). `dir` is the compass bearing for the rose + aria-label.
 */
export interface VoteMeta {
	label: string;
	glyph: string;
	/** compass bearing, e.g. 'N' */
	dir: 'N' | 'E' | 'S' | 'W';
	/** button classes when not active */
	btn: string;
	/** dot color class for peek/spread */
	dot: string;
}

export const VOTE_META: Record<VoteValue, VoteMeta> = {
	love: {
		label: 'Love',
		glyph: '♥',
		dir: 'N',
		btn: 'bg-moss text-paper border-moss',
		dot: 'bg-moss'
	},
	like: {
		label: 'Like',
		glyph: '+',
		dir: 'E',
		btn: 'bg-moss-tint text-moss border-moss/40',
		dot: 'bg-moss-soft'
	},
	flexible: {
		label: 'Flexible',
		glyph: '~',
		dir: 'S',
		btn: 'bg-surface text-ink border-line',
		dot: 'bg-ink-muted'
	},
	dislike: {
		label: 'Pass',
		glyph: '–',
		dir: 'W',
		btn: 'bg-clay/10 text-clay border-clay/40',
		dot: 'bg-clay'
	}
};
