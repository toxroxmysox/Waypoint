// Locked palette (M1.5 spec): phase colors restricted to accent tokens.
// Hex values mirror src/routes/layout.css @theme so storage stays plain hex.
export const phasePalette = [
	{ name: 'moss', hex: '#3e5a3a' },
	{ name: 'clay', hex: '#a5593a' },
	{ name: 'gold', hex: '#c89b3c' },
	{ name: 'sky', hex: '#3b6ba5' }
] as const;
