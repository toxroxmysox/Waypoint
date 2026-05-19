export function titleCase(s: string): string {
	return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTime(t: string): string {
	if (!t) return '';
	const timePart = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
	const [h, m] = timePart.split(':');
	const hour = parseInt(h, 10);
	const ampm = hour >= 12 ? 'PM' : 'AM';
	const h12 = hour % 12 || 12;
	return `${h12}:${m} ${ampm}`;
}

export function timeToDatetime(time: string): string {
	if (!time) return '';
	return `1970-01-01 ${time}:00.000Z`;
}

export function datetimeToTime(dt: string): string {
	if (!dt) return '';
	const match = dt.match(/(\d{2}:\d{2})/);
	return match ? match[1] : '';
}
