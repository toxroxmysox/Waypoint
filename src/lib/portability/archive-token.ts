import { randomBytes } from 'crypto';

export function generateArchiveToken(): string {
	return randomBytes(32).toString('hex');
}
