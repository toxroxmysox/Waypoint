// #363 — the top-of-viewport navigation progress bar's state machine.
//
// Pure (timers only, no DOM) so the show/hide rules are unit-tested; the
// component (`NavProgress.svelte`) just feeds it `start()`/`done()` from
// SvelteKit's `navigating` and paints whatever state it emits.
//
//   idle ──start──▶ waiting ──(DELAY)──▶ running ──done──▶ completing ──(COMPLETE)──▶ fading ──(FADE)──▶ idle
//                      │                                        ▲                       │
//                      └──done── idle (never shown)             └────start (re-shows)───┘
//
// The delay is the point: a navigation that resolves inside DELAY_MS never
// paints the bar at all, so fast (cached) navs don't flash.

export type NavProgressPhase = 'idle' | 'waiting' | 'running' | 'completing' | 'fading';

export interface NavProgressState {
	phase: NavProgressPhase;
	/** Painted? (opacity 1). False while idle/waiting and once fading. */
	visible: boolean;
	/** Bar width as a fraction, 0..1. Creeps toward TRICKLE_CAP while running. */
	progress: number;
	/** False when `progress` JUMPS (reset) — the component drops its width transition. */
	animate: boolean;
}

export const DELAY_MS = 150;
export const TRICKLE_MS = 200;
export const COMPLETE_MS = 200;
export const FADE_MS = 300;
export const START_PROGRESS = 0.08;
export const TRICKLE_CAP = 0.9;
/** Fraction of the remaining gap to TRICKLE_CAP closed per tick — an ease-out that never arrives. */
export const TRICKLE_RATE = 0.12;

export const IDLE: NavProgressState = {
	phase: 'idle',
	visible: false,
	progress: 0,
	animate: false
};

export function trickle(progress: number): number {
	return progress + (TRICKLE_CAP - progress) * TRICKLE_RATE;
}

export interface NavProgressController {
	start(): void;
	done(): void;
	destroy(): void;
	readonly state: NavProgressState;
}

export function createNavProgress(
	onChange: (state: NavProgressState) => void
): NavProgressController {
	let state: NavProgressState = IDLE;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let ticker: ReturnType<typeof setInterval> | null = null;

	const set = (next: NavProgressState) => {
		state = next;
		onChange(state);
	};
	const clearTimer = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
	};
	const clearTicker = () => {
		if (ticker !== null) clearInterval(ticker);
		ticker = null;
	};
	const clearAll = () => {
		clearTimer();
		clearTicker();
	};

	const run = (animate: boolean) => {
		clearAll();
		set({ phase: 'running', visible: true, progress: START_PROGRESS, animate });
		ticker = setInterval(() => {
			set({ ...state, progress: trickle(state.progress), animate: true });
		}, TRICKLE_MS);
	};

	return {
		get state() {
			return state;
		},

		start() {
			switch (state.phase) {
				case 'idle':
					set({ ...IDLE, phase: 'waiting' });
					timer = setTimeout(() => {
						timer = null;
						run(true);
					}, DELAY_MS);
					return;
				case 'completing':
				case 'fading':
					// Back-to-back nav while the last one is still finishing: it has
					// already been waited on, so re-show at once. The width jumps
					// back (no transition) rather than visibly sliding backwards.
					run(false);
					return;
				default:
					// waiting/running: the same pending span continues.
					return;
			}
		},

		done() {
			switch (state.phase) {
				case 'waiting':
					// Resolved inside the delay — never painted.
					clearAll();
					set(IDLE);
					return;
				case 'running':
					clearAll();
					set({ phase: 'completing', visible: true, progress: 1, animate: true });
					timer = setTimeout(() => {
						set({ phase: 'fading', visible: false, progress: 1, animate: true });
						timer = setTimeout(() => {
							timer = null;
							set(IDLE);
						}, FADE_MS);
					}, COMPLETE_MS);
					return;
				default:
					return;
			}
		},

		destroy() {
			clearAll();
		}
	};
}
