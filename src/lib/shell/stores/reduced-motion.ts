import { readable } from 'svelte/store';

export const reducedMotion = readable(false, (set) => {
	if (typeof window === 'undefined' || typeof matchMedia === 'undefined') return;

	const mql = matchMedia('(prefers-reduced-motion: reduce)');
	set(mql.matches);

	function onChange(e: MediaQueryListEvent) {
		set(e.matches);
	}

	mql.addEventListener('change', onChange);
	return () => mql.removeEventListener('change', onChange);
});
