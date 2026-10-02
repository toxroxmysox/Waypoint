import type { Action } from 'svelte/action';

/**
 * #374 / #381 — the 6-digit OTP code field shared by login, invite and join.
 * Keeps the input digits-only, and submits its form once the 6th digit lands.
 *
 * The latch stops a re-fire while the field stays full (further input events at
 * 6 digits). It is released explicitly, never by the field getting shorter:
 * after a resend, iOS one-time-code autofill swaps 6 old digits for 6 new ones
 * in a single event, and that must still auto-submit. Call `release()` wherever
 * a fresh attempt starts — after the verify result returns (so a corrected code
 * auto-submits again), on resend, and on "use a different email".
 *
 *   const otp = otpAutoSubmit();
 *   <input use:otp.action={loading} … />      // param: a submit is in flight
 *   otp.release();
 */
export function otpAutoSubmit() {
	let latched = false;

	const action: Action<HTMLInputElement, boolean | undefined> = (input, busy) => {
		let loading = busy ?? false;

		function onInput() {
			input.value = input.value.replace(/\D/g, '');
			if (input.value.length === 6 && !loading && !latched) {
				latched = true;
				input.form?.requestSubmit();
			}
		}

		input.addEventListener('input', onInput);
		return {
			update(next) {
				loading = next ?? false;
			},
			destroy() {
				input.removeEventListener('input', onInput);
			}
		};
	};

	return {
		action,
		release() {
			latched = false;
		}
	};
}
