import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

const SCRYPT_KEYLEN = 64;

export function hashVaultPassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
	return `${salt}:${hash}`;
}

export function verifyVaultPassword(password: string, stored: string): boolean {
	const [salt, hash] = stored.split(':');
	if (!salt || !hash) return false;
	const hashBuf = Buffer.from(hash, 'hex');
	const derivedBuf = scryptSync(password, salt, SCRYPT_KEYLEN);
	return timingSafeEqual(hashBuf, derivedBuf);
}
