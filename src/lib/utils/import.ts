import type { TripExport } from '$lib/types';

export interface ImportValidationResult {
	valid: boolean;
	errors: string[];
	data: TripExport | null;
}

export function validateTripImport(raw: unknown): ImportValidationResult {
	const errors: string[] = [];

	if (!raw || typeof raw !== 'object') {
		return { valid: false, errors: ['Invalid JSON: not an object'], data: null };
	}

	const obj = raw as Record<string, unknown>;

	if (obj._waypoint_version !== 1) {
		errors.push(`Unsupported version: ${obj._waypoint_version}. Expected 1.`);
	}

	if (!obj.trip || typeof obj.trip !== 'object') {
		errors.push('Missing or invalid "trip" field.');
		return { valid: false, errors, data: null };
	}

	const trip = obj.trip as Record<string, unknown>;
	if (!trip.title || typeof trip.title !== 'string') errors.push('Trip title is required.');
	if (!trip.start_date || typeof trip.start_date !== 'string')
		errors.push('Trip start_date is required.');
	if (!trip.end_date || typeof trip.end_date !== 'string')
		errors.push('Trip end_date is required.');

	if (!Array.isArray(obj.phases)) errors.push('"phases" must be an array.');
	if (!Array.isArray(obj.days)) errors.push('"days" must be an array.');
	if (!Array.isArray(obj.items)) errors.push('"items" must be an array.');

	if (errors.length > 0) {
		return { valid: false, errors, data: null };
	}

	return { valid: true, errors: [], data: obj as unknown as TripExport };
}

export function generateImportSlug(title: string): string {
	const base = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);
	const suffix = Math.random().toString(36).slice(2, 6);
	return `${base}-imported-${suffix}`;
}
