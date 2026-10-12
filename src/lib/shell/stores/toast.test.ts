import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { toast } from './toast';

describe('toast action (#401 Undo)', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		toast.dismiss();
		vi.useRealTimers();
	});

	it('show with action exposes it and run dismisses', () => {
		const run = vi.fn();
		toast.show('Planned on Fri 19', 'success', { action: { label: 'Undo', run } });
		const t = get(toast)!;
		expect(t.action?.label).toBe('Undo');
		toast.runAction();
		expect(run).toHaveBeenCalledOnce();
		expect(get(toast)).toBeNull();
	});

	it('action toast lasts 6000ms', () => {
		toast.show('Planned on Fri 19', 'success', { action: { label: 'Undo', run: () => {} } });
		vi.advanceTimersByTime(5999);
		expect(get(toast)).not.toBeNull();
		vi.advanceTimersByTime(1);
		expect(get(toast)).toBeNull();
	});

	it('a plain toast keeps its 3000ms and has no action', () => {
		toast.show('Notes saved');
		expect(get(toast)!.action).toBeUndefined();
		vi.advanceTimersByTime(3000);
		expect(get(toast)).toBeNull();
	});
});
