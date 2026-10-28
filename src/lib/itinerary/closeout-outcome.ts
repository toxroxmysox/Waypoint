import type { Item, ItemRating, ItemStatus } from './types';

// #576 — closeout resolves each item to one of three outcomes. Recommend /
// Don't recommend both mean "we did it" (status done) plus a rating; Didn't do
// replaces the old Swap/Skip (status considered, never rated).
export type CloseoutOutcome = 'recommend' | 'not_recommend' | 'didnt_do';

export function outcomeUpdate(outcome: CloseoutOutcome): {
	status: ItemStatus;
	rating: ItemRating;
} {
	switch (outcome) {
		case 'recommend':
			return { status: 'done', rating: 'recommend' };
		case 'not_recommend':
			return { status: 'done', rating: 'not_recommend' };
		case 'didnt_do':
			return { status: 'considered', rating: '' };
	}
}

export function parseOutcome(raw: unknown): CloseoutOutcome | null {
	return raw === 'recommend' || raw === 'not_recommend' || raw === 'didnt_do' ? raw : null;
}

/** `''` is a valid rating: it clears. Anything unrecognised -> null. */
export function parseRating(raw: unknown): ItemRating | null {
	return raw === '' || raw === 'recommend' || raw === 'not_recommend' ? raw : null;
}

export function itemOutcome(
	item: Pick<Item, 'status' | 'rating'>
): CloseoutOutcome | 'done_unrated' | 'pending' {
	if (item.status === 'considered') return 'didnt_do';
	if (item.status === 'done') {
		return item.rating === 'recommend' || item.rating === 'not_recommend'
			? item.rating
			: 'done_unrated';
	}
	return 'pending';
}
