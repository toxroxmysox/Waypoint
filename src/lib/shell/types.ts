import type { RecordModel } from 'pocketbase';

export interface User extends RecordModel {
	email: string;
	name: string;
	avatar: string;
}
