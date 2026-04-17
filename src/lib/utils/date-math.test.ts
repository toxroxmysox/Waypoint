import { describe, it, expect } from 'vitest';

// Pure date math utilities extracted for testing.
// These mirror the logic used in trips.pb.js hooks.

function generateDateRange(startDate: string, endDate: string): string[] {
	const dates: string[] = [];
	const start = new Date(startDate);
	const end = new Date(endDate);
	const current = new Date(start);

	while (current <= end) {
		dates.push(current.toISOString().split('T')[0]);
		current.setDate(current.getDate() + 1);
	}

	return dates;
}

interface Phase {
	id: string;
	start_date: string;
	end_date: string;
	order: number;
}

function findPhaseForDate(date: string, phases: Phase[]): string | null {
	// Sort by order ascending, first match wins
	const sorted = [...phases].sort((a, b) => a.order - b.order);
	for (const phase of sorted) {
		const phaseStart = phase.start_date.split('T')[0].split(' ')[0];
		const phaseEnd = phase.end_date.split('T')[0].split(' ')[0];
		if (date >= phaseStart && date <= phaseEnd) {
			return phase.id;
		}
	}
	return null;
}

function categorizeTripsByDate(
	trips: { start_date: string; end_date: string }[],
	now: string
): { active: typeof trips; upcoming: typeof trips; past: typeof trips } {
	const active = trips.filter((t) => {
		const start = t.start_date.split('T')[0];
		const end = t.end_date.split('T')[0];
		return start <= now && now <= end;
	});
	const upcoming = trips.filter((t) => t.start_date.split('T')[0] > now);
	const past = trips.filter((t) => t.end_date.split('T')[0] < now);
	return { active, upcoming, past };
}

describe('generateDateRange', () => {
	it('generates a single day', () => {
		expect(generateDateRange('2025-05-15', '2025-05-15')).toEqual(['2025-05-15']);
	});

	it('generates a week', () => {
		const dates = generateDateRange('2025-05-15', '2025-05-21');
		expect(dates).toHaveLength(7);
		expect(dates[0]).toBe('2025-05-15');
		expect(dates[6]).toBe('2025-05-21');
	});

	it('generates dates across month boundary', () => {
		const dates = generateDateRange('2025-05-30', '2025-06-02');
		expect(dates).toEqual(['2025-05-30', '2025-05-31', '2025-06-01', '2025-06-02']);
	});

	it('generates dates across year boundary', () => {
		const dates = generateDateRange('2025-12-31', '2026-01-02');
		expect(dates).toEqual(['2025-12-31', '2026-01-01', '2026-01-02']);
	});
});

describe('findPhaseForDate', () => {
	const phases: Phase[] = [
		{ id: 'p1', start_date: '2025-05-15', end_date: '2025-05-18', order: 0 },
		{ id: 'p2', start_date: '2025-05-19', end_date: '2025-05-22', order: 1 }
	];

	it('returns null when no phases exist', () => {
		expect(findPhaseForDate('2025-05-15', [])).toBeNull();
	});

	it('assigns day to correct phase', () => {
		expect(findPhaseForDate('2025-05-15', phases)).toBe('p1');
		expect(findPhaseForDate('2025-05-18', phases)).toBe('p1');
		expect(findPhaseForDate('2025-05-19', phases)).toBe('p2');
		expect(findPhaseForDate('2025-05-22', phases)).toBe('p2');
	});

	it('returns null for date outside all phases', () => {
		expect(findPhaseForDate('2025-05-14', phases)).toBeNull();
		expect(findPhaseForDate('2025-05-23', phases)).toBeNull();
	});

	it('lower order wins on overlapping phases', () => {
		const overlapping: Phase[] = [
			{ id: 'first', start_date: '2025-05-15', end_date: '2025-05-20', order: 0 },
			{ id: 'second', start_date: '2025-05-15', end_date: '2025-05-20', order: 1 }
		];
		expect(findPhaseForDate('2025-05-17', overlapping)).toBe('first');
	});
});

describe('categorizeTripsByDate', () => {
	const trips = [
		{ start_date: '2025-04-01', end_date: '2025-04-10' },
		{ start_date: '2025-05-01', end_date: '2025-05-15' },
		{ start_date: '2025-06-01', end_date: '2025-06-20' }
	];

	it('categorizes an active trip correctly', () => {
		const { active, upcoming, past } = categorizeTripsByDate(trips, '2025-05-08');
		expect(active).toHaveLength(1);
		expect(active[0].start_date).toBe('2025-05-01');
		expect(upcoming).toHaveLength(1);
		expect(past).toHaveLength(1);
	});

	it('trip starting today is active', () => {
		const { active } = categorizeTripsByDate(trips, '2025-05-01');
		expect(active[0].start_date).toBe('2025-05-01');
	});

	it('trip ending today is active', () => {
		const { active } = categorizeTripsByDate(trips, '2025-05-15');
		expect(active[0].end_date).toBe('2025-05-15');
	});

	it('categorizes all as past', () => {
		const { active, upcoming, past } = categorizeTripsByDate(trips, '2025-12-31');
		expect(active).toHaveLength(0);
		expect(upcoming).toHaveLength(0);
		expect(past).toHaveLength(3);
	});

	it('categorizes all as upcoming', () => {
		const { active, upcoming, past } = categorizeTripsByDate(trips, '2025-01-01');
		expect(active).toHaveLength(0);
		expect(upcoming).toHaveLength(3);
		expect(past).toHaveLength(0);
	});
});
