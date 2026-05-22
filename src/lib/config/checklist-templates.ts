export interface ChecklistTemplate {
	name: string;
	description: string;
	items: string[];
}

export const checklistTemplates: ChecklistTemplate[] = [
	{
		name: 'Packing',
		description: 'Common items to pack for a trip',
		items: [
			'Passport / ID',
			'Phone charger',
			'Adapter / converter',
			'Toiletries',
			'Medications',
			'Comfortable walking shoes',
			'Weather-appropriate clothing',
			'Sunscreen',
			'Reusable water bottle',
			'Snacks'
		]
	},
	{
		name: 'Grocery',
		description: 'Grocery run for a trip rental',
		items: [
			'Water',
			'Coffee / tea',
			'Breakfast items',
			'Snacks',
			'Fruits',
			'Lunch supplies',
			'Dinner ingredients',
			'Drinks',
			'Paper towels',
			'Trash bags'
		]
	},
	{
		name: 'To Book',
		description: 'Things to book before departure',
		items: [
			'Flights',
			'Accommodation',
			'Car rental',
			'Travel insurance',
			'Restaurant reservations',
			'Activity tickets',
			'Airport transfer'
		]
	}
];
