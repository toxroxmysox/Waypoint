import { describe, it, expect, vi } from 'vitest';
import type { ActionResult } from '@sveltejs/kit';
import { optimisticSubmit, nextVote } from './optimistic-submit';

// Minimal harness around the SubmitFunction contract: call it with `cancel`,
// then (if not cancelled) call the returned callback with a result + update.
function harness() {
	const state = { override: null as boolean | null, busy: false };
	const notifyError = vi.fn();
	const settle = vi.fn(() => {
		state.busy = false;
		state.override = null;
	});
	const submit = optimisticSubmit({
		busy: () => state.busy,
		apply: () => {
			state.busy = true;
			state.override = true;
		},
		settle,
		errorMessage: 'nope',
		notifyError
	});
	function fire() {
		const cancel = vi.fn();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const after = submit({ cancel } as any) as
			| ((o: { result: ActionResult; update: (o?: unknown) => Promise<void> }) => Promise<void>)
			| undefined;
		return { cancel, after };
	}
	return { state, notifyError, settle, fire };
}

describe('optimisticSubmit', () => {
	it('applies the override synchronously on submit', () => {
		const h = harness();
		h.fire();
		expect(h.state.override).toBe(true);
		expect(h.state.busy).toBe(true);
	});

	it('on success: awaits update({reset:false}) BEFORE dropping the override', async () => {
		const h = harness();
		const { after } = h.fire();
		const order: string[] = [];
		h.settle.mockImplementation(() => {
			order.push('settle');
			h.state.override = null;
			h.state.busy = false;
		});
		const update = vi.fn(async () => {
			order.push('update');
		});
		await after!({ result: { type: 'success', status: 200 }, update });
		expect(update).toHaveBeenCalledWith({ reset: false });
		expect(order).toEqual(['update', 'settle']);
		expect(h.notifyError).not.toHaveBeenCalled();
		expect(h.state.override).toBeNull();
	});

	it.each([
		['failure', { type: 'failure', status: 500, data: { error: 'x' } }],
		['error', { type: 'error', error: new Error('offline') }]
	] as const)('on %s: reverts + toasts, never calls update', async (_n, result) => {
		const h = harness();
		const { after } = h.fire();
		const update = vi.fn(async () => {});
		await after!({ result: result as ActionResult, update });
		expect(update).not.toHaveBeenCalled();
		expect(h.notifyError).toHaveBeenCalledWith('nope');
		expect(h.state.override).toBeNull();
		expect(h.state.busy).toBe(false);
	});

	it('cancels a second submit while the first is in flight (no double-toggle)', () => {
		const h = harness();
		h.fire();
		const second = h.fire();
		expect(second.cancel).toHaveBeenCalledOnce();
		expect(second.after).toBeUndefined();
	});

	it('settles even if update throws', async () => {
		const h = harness();
		const { after } = h.fire();
		const update = vi.fn(async () => {
			throw new Error('boom');
		});
		await expect(after!({ result: { type: 'success', status: 200 }, update })).rejects.toThrow('boom');
		expect(h.settle).toHaveBeenCalledOnce();
		expect(h.state.busy).toBe(false);
	});
});

describe('nextVote', () => {
	it('tapping a different option selects it', () => {
		expect(nextVote<'love' | 'like'>('like', 'love')).toBe('love');
		expect(nextVote<'love'>(null, 'love')).toBe('love');
	});
	it('tapping your current vote clears it', () => {
		expect(nextVote('love', 'love')).toBeNull();
	});
});
