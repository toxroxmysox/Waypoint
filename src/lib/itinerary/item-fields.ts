import type { ItemType } from '$lib/types';

export interface FieldVisibility {
	subtype: boolean;
	subtypes: string[];
	location: boolean;
	times: boolean;
	booking: boolean;
	costs: boolean;
	confirmationCodes: boolean;
	checklist: boolean;
	parentItem: boolean;
}

export const itemFieldConfig: Record<ItemType, FieldVisibility> = {
	lodging: {
		subtype: true,
		subtypes: ['hotel', 'airbnb', 'resort', 'other'],
		location: true,
		times: true,
		booking: true,
		costs: true,
		confirmationCodes: true,
		checklist: false,
		parentItem: false
	},
	transportation: {
		subtype: true,
		subtypes: ['flight', 'train', 'bus', 'car', 'other'],
		location: true,
		times: true,
		booking: true,
		costs: true,
		confirmationCodes: true,
		checklist: false,
		parentItem: true
	},
	activity: {
		subtype: true,
		subtypes: ['tour', 'museum', 'outdoor', 'entertainment', 'shopping', 'nightlife', 'spa', 'other'],
		location: true,
		times: true,
		booking: true,
		costs: true,
		confirmationCodes: true,
		checklist: false,
		parentItem: false
	},
	meal: {
		subtype: true,
		subtypes: ['breakfast', 'lunch', 'dinner', 'snack', 'coffee', 'drinks', 'other'],
		location: true,
		times: true,
		booking: false,
		costs: true,
		confirmationCodes: false,
		checklist: false,
		parentItem: false
	},
	note: {
		subtype: false,
		subtypes: [],
		location: false,
		times: false,
		booking: false,
		costs: false,
		confirmationCodes: false,
		checklist: false,
		parentItem: false
	},
	checklist: {
		subtype: false,
		subtypes: [],
		location: false,
		times: false,
		booking: false,
		costs: false,
		confirmationCodes: false,
		checklist: true,
		parentItem: false
	}
};

export const itemTypeLabels: Record<ItemType, string> = {
	lodging: 'Lodging',
	transportation: 'Transportation',
	activity: 'Activity',
	meal: 'Meal',
	note: 'Note',
	checklist: 'Checklist'
};

export const slotOptions = [
	{ value: 'morning', label: 'Morning' },
	{ value: 'afternoon', label: 'Afternoon' },
	{ value: 'evening', label: 'Evening' },
	{ value: 'anytime', label: 'Anytime' }
] as const;
