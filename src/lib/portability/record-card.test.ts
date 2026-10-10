import { describe, it, expect } from 'vitest';
import { recordCardFields } from './record-card';

const base = { type: 'activity' as const, title: 'T', location_name: 'Kohler', description: '' };

describe('recordCardFields (#436)', () => {
	it('passes a single-day item through, meta is the place', () => {
		const f = recordCardFields(
			{ ...base, start_time: '2026-10-01 09:00:00.000Z', end_time: '2026-10-01 11:30:00.000Z' },
			'2026-10-01 00:00:00.000Z'
		);
		expect(f.end_time).toBe('2026-10-01 11:30:00.000Z');
		expect(f.meta).toBe('Kohler');
	});
	it('a multi-day item keeps its start on the rail, drops the later-day end, says how long', () => {
		const f = recordCardFields(
			{
				...base,
				type: 'lodging',
				start_time: '2026-10-01 15:00:00.000Z',
				end_time: '2026-10-03 11:00:00.000Z',
				end_date: '2026-10-03 00:00:00.000Z'
			},
			'2026-10-01 00:00:00.000Z'
		);
		expect(f.start_time).toBe('2026-10-01 15:00:00.000Z');
		expect(f.end_time).toBe('');
		expect(f.meta).toBe('Kohler · through Sat Oct 3');
	});
	it('a note carries its description in the body, not the meta', () => {
		const f = recordCardFields({ ...base, type: 'note', location_name: '', description: 'Bring cash\nmore' }, '2026-10-01');
		expect(f.meta).toBe('');
	});
	it('an empty end_date is not multi-day', () => {
		const f = recordCardFields({ ...base, end_date: '', end_time: '2026-10-01 11:00:00.000Z' }, '2026-10-01');
		expect(f.end_time).toBe('2026-10-01 11:00:00.000Z');
	});
});
