import { describe, it, expect } from 'vitest';
import { encryptText, decryptText } from './crypto';

describe('crypto', () => {
	it('round-trips encrypt then decrypt', async () => {
		const plaintext = 'Hotel safe code: 4829';
		const password = 'my-trip-password';

		const encrypted = await encryptText(plaintext, password);
		expect(encrypted).not.toBe(plaintext);

		const decrypted = await decryptText(encrypted, password);
		expect(decrypted).toBe(plaintext);
	});

	it('returns different ciphertext each time (random salt/iv)', async () => {
		const plaintext = 'Same input';
		const password = 'same-password';

		const a = await encryptText(plaintext, password);
		const b = await encryptText(plaintext, password);
		expect(a).not.toBe(b);
	});

	it('throws on wrong password', async () => {
		const encrypted = await encryptText('secret', 'correct-password');
		await expect(decryptText(encrypted, 'wrong-password')).rejects.toThrow();
	});

	it('handles empty string', async () => {
		const encrypted = await encryptText('', 'password');
		const decrypted = await decryptText(encrypted, 'password');
		expect(decrypted).toBe('');
	});

	it('handles unicode content', async () => {
		const plaintext = 'Confirmation: Hôtel de la Paix #4829';
		const password = 'trip-pass';

		const decrypted = await decryptText(
			await encryptText(plaintext, password),
			password
		);
		expect(decrypted).toBe(plaintext);
	});
});
