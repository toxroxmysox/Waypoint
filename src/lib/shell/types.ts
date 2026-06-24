import type { RecordModel } from 'pocketbase';

export interface User extends RecordModel {
	email: string;
	name: string;
	avatar: string;
	// #274 Onboarding spine. Per-user, once-ever complete-signal. PB serves an
	// unset date field as `''` (falsy) to the SvelteKit client — never a truthy
	// goja DateTime (that scar is hook-side only). `''`/absent → needs onboarding.
	onboarded_at?: string;
}
