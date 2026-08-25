/**
 * Body scroll-lock for overlays (#373).
 *
 * While a BottomSheet or the DocumentLightbox is open, the page behind it must
 * not scroll — not by scroll-chaining off the end of the sheet's own content,
 * and not by touch-dragging the backdrop.
 *
 * WHY THE FIXED-BODY PATTERN, not `overflow: hidden`:
 * iOS Safari does not reliably stop touch scrolling on a `overflow: hidden`
 * body — the classic symptom is the page behind an overlay still rubber-banding
 * under a drag. Pinning the body with `position: fixed` and a negative `top`
 * offset is the pattern that actually holds there. The cost is that the browser
 * forgets the scroll position, so we save and restore it ourselves.
 *
 * REFERENCE COUNTED: overlays nest (a sheet can open the lightbox, a confirm
 * can sit over a sheet). Only the first lock pins the body and only the last
 * unlock releases it, so an inner overlay closing cannot un-pin the page while
 * an outer one is still up.
 *
 * NAVIGATION SAFETY: an overlay can unmount because the app navigated (a link
 * inside a sheet, a form action redirect). Restoring the old scroll offset then
 * would fight SvelteKit's own scroll handling and drop the user mid-page on a
 * route they just arrived at. The pathname captured at lock time is compared at
 * unlock, and the restore is skipped when it has changed.
 */

let lockCount = 0;
let savedScrollY = 0;
let savedPathname = '';

/** Test seam — resets module state between unit tests. */
export function __resetScrollLock(): void {
	lockCount = 0;
	savedScrollY = 0;
	savedPathname = '';
}

export function isBodyScrollLocked(): boolean {
	return lockCount > 0;
}

export function lockBodyScroll(): void {
	if (typeof document === 'undefined') return;

	lockCount += 1;
	if (lockCount > 1) return;

	savedScrollY = window.scrollY;
	savedPathname = window.location.pathname;

	const body = document.body;
	body.style.position = 'fixed';
	body.style.top = `-${savedScrollY}px`;
	body.style.left = '0';
	body.style.right = '0';
	body.style.width = '100%';
	body.style.overflow = 'hidden';
	body.dataset.scrollLocked = 'true';
}

export function unlockBodyScroll(): void {
	if (typeof document === 'undefined') return;
	if (lockCount === 0) return;

	lockCount -= 1;
	if (lockCount > 0) return;

	const body = document.body;
	body.style.position = '';
	body.style.top = '';
	body.style.left = '';
	body.style.right = '';
	body.style.width = '';
	body.style.overflow = '';
	delete body.dataset.scrollLocked;

	// Same page as when we locked → put the reader back where they were.
	// Different page → the navigation owns the scroll position, leave it alone.
	if (window.location.pathname === savedPathname) {
		window.scrollTo(0, savedScrollY);
	}
}
