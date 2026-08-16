import type PocketBase from 'pocketbase';
import type { User } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			pb: PocketBase;
			user: User | null;
		}

		/**
		 * Shallow-routing state (#365). `sheet` is the open-overlay DEPTH, not a
		 * boolean: BottomSheet pushes one history entry per open sheet so back /
		 * iOS edge-swipe closes the top sheet instead of navigating the page out
		 * from under it, and nested sheets each own their own entry.
		 */
		interface PageState {
			sheet?: number;
		}
	}
}

export {};
