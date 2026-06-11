import type { ItemType } from '$lib/types';
import type { ItemFormData } from './components/ItemFormFields';
import { titleCase } from '$lib/shell/format';
import { defaultRequiresBooking } from './booking-projection';

export interface FieldVisibility {
	subtype: boolean;
	subtypes: string[];
	location: boolean;
	times: boolean;
	endDate: boolean;
	booking: boolean;
	costs: boolean;
	confirmationCodes: boolean;
	checklist: boolean;
	parentItem: boolean;
}

const itemFieldConfig: Record<ItemType, FieldVisibility> = {
	lodging: {
		subtype: true,
		subtypes: ['hotel', 'airbnb', 'resort', 'other'],
		location: true,
		times: true,
		endDate: true,
		booking: true,
		costs: true,
		confirmationCodes: true,
		checklist: false,
		parentItem: false
	},
	transportation: {
		subtype: true,
		subtypes: ['train', 'bus', 'car', 'other'],
		location: true,
		times: true,
		endDate: true,
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
		endDate: true,
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
		endDate: false,
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
		endDate: true,
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
		endDate: false,
		booking: false,
		costs: false,
		confirmationCodes: false,
		checklist: true,
		parentItem: false
	},
	flight: {
		subtype: false,
		subtypes: [],
		location: true,
		times: true,
		endDate: true,
		booking: true,
		costs: true,
		confirmationCodes: true,
		checklist: false,
		parentItem: false
	}
};

const itemTypeLabels: Record<ItemType, string> = {
	lodging: 'Lodging',
	transportation: 'Transportation',
	activity: 'Activity',
	meal: 'Meal',
	note: 'Note',
	checklist: 'Checklist',
	flight: 'Flight'
};

export interface FieldValidation {
	title: { required: boolean; maxLength: number };
	cost_estimate_usd: { min: number };
	reservation_url: { pattern: 'url' };
}

export interface FieldDefaults {
	subtype: string;
	status: string;
	booked: boolean;
	free_cancellation: boolean;
	cost_estimate_usd: number;
}

export interface FieldLabels {
	typeLabel: string;
	subtypeLabel: string;
	subtypeOptions: { value: string; label: string }[];
}

export interface FieldConfig {
	type: ItemType;
	visibility: FieldVisibility;
	validation: FieldValidation;
	defaults: FieldDefaults;
	labels: FieldLabels;
}

const SHARED_VALIDATION: FieldValidation = {
	title: { required: true, maxLength: 200 },
	cost_estimate_usd: { min: 0 },
	reservation_url: { pattern: 'url' }
};

export function getFieldConfig(type: ItemType): FieldConfig {
	const visibility = itemFieldConfig[type];
	const subtypes = visibility.subtypes;

	return {
		type,
		visibility,
		validation: SHARED_VALIDATION,
		defaults: {
			subtype: subtypes.length > 0 ? subtypes[0] : '',
			status: 'planned',
			booked: false,
			free_cancellation: false,
			cost_estimate_usd: 0
		},
		labels: {
			typeLabel: itemTypeLabels[type],
			subtypeLabel: 'Type',
			subtypeOptions: subtypes.map((v) => ({ value: v, label: titleCase(v) }))
		}
	};
}

export function buildEmptyFormData(type: ItemType): ItemFormData {
	const { defaults } = getFieldConfig(type);
	return {
		type,
		subtype: defaults.subtype,
		title: '',
		description: '',
		day: '',
		phase: '',
		start_time: '',
		end_time: '',
		end_date: '',
		location_name: '',
		location_address: '',
		location_coords: null,
		google_place_id: '',
		booked: defaults.booked,
		reservation_url: '',
		free_cancellation: defaults.free_cancellation,
		cost_estimate_usd: defaults.cost_estimate_usd,
		requires_booking: defaultRequiresBooking(type),
		confirmation_codes: [],
		assigned_to: [],
		status: defaults.status,
		linked_goal_ids: []
	};
}

