import type PocketBase from 'pocketbase';
import type { User } from '$lib/types';

declare global {
	namespace App {
		interface Locals {
			pb: PocketBase;
			user: User | null;
		}
	}
}

export {};
