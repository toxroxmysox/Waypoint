// A flight's default title and its place line (#435, CARD_SYSTEM D2, #463).
// Title = `{number} to {city}`; the place line is the route `MKE → DEN`, with the
// stored number in front only when the title doesn't already say it.

const SEP = ' · ';

/** `ua1234` -> `UA 1234`. Anything that isn't carrier + digits is trimmed and uppercased. */
export function formatFlightNumber(raw: string): string {
	const s = raw.replace(/\s+/g, '').toUpperCase();
	const m = /^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/.exec(s);
	return m ? `${m[1]} ${m[2]}` : s;
}

/**
 * The title the flight lookup writes: `UA 1234 to Denver`; the airport code when
 * no city is known; `Flight to Denver` when there's no number.
 */
export function flightTitle(input: { number: string; city: string; code: string }): string {
	const number = formatFlightNumber(input.number);
	const dest = input.city.trim() || input.code.trim();
	if (number && dest) return `${number} to ${dest}`;
	if (number) return number;
	if (dest) return `Flight to ${dest}`;
	return 'Flight';
}

const squash = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/**
 * The place line of a flight. `route` is the composed `MKE → DEN` (or the airport
 * labels). The stored number leads it only when the title doesn't contain it, so
 * new flights (number in the title) print it once and legacy ones keep it.
 */
export function flightPlaceLine(input: { title: string; flight_number?: string; route: string }): string {
	const number = (input.flight_number ?? '').trim();
	if (!number || squash(input.title).includes(squash(number))) return input.route;
	return [number, input.route].filter(Boolean).join(SEP);
}
