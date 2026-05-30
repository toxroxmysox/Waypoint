export interface VaultEntry {
	id: string;
	trip: string;
	encrypted_title: string;
	encrypted_body: string;
	created_by: string;
	created: string;
	updated: string;
}

export interface VaultEntryDecrypted {
	id: string;
	title: string;
	body: string;
	created_by: string;
	created: string;
}
