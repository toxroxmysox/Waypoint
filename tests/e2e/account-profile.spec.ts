import { test, expect } from '@playwright/test';

// /account ("Profile") — #104. The dev-login user (E2E_TEST_EMAIL) owns the
// avatar + name being edited here; all self-edits, no rule change.
const BASE = 'http://localhost:4173';

// A small but real PNG so the cropper's <img> decodes with a natural size.
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR42mP8z8BQz0AEYBxVSFvO1AABz3o7gwAAAABJRU5ErkJggg==',
	'base64'
);

test.describe('Account / Profile (#104)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('reachable from the /trips home header', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const link = page.locator('a[href="/account"]').first();
		await expect(link).toBeVisible();
		await link.click();
		await page.waitForURL('**/account');
		await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
	});

	test('display name edits and persists', async ({ page }) => {
		await page.goto(`${BASE}/account`);
		await page.locator('#name').fill('Renamed Tester');
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect(page.getByText('Name saved')).toBeVisible();

		await page.reload();
		await expect(page.locator('#name')).toHaveValue('Renamed Tester');
	});

	test('avatar uploads through the cropper, renders, and removes', async ({ page }) => {
		await page.goto(`${BASE}/account`);

		// Picking a file opens the crop sheet (progressive enhancement).
		await page.setInputFiles('input[type=file][name="avatar"]', {
			name: 'pic.png',
			mimeType: 'image/png',
			buffer: PNG
		});
		await expect(page.getByText('Position your photo')).toBeVisible();

		// Save → crop to 512² webp → form action → sheet closes, avatar renders.
		await page.getByRole('button', { name: 'Save photo' }).click();
		await expect(page.getByText('Position your photo')).toBeHidden();

		const avatar = page.locator('main img').first();
		await expect(avatar).toBeVisible();
		await expect(avatar).toHaveAttribute('src', /\.webp(\?|$)/);

		// Remove → back to the initials fallback (no <img> in the card).
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect(page.getByText('Photo removed')).toBeVisible();
		await expect(page.locator('main img')).toHaveCount(0);
	});

	test('mobile responsive at 375px', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/account`);
		const main = page.locator('main').first();
		const box = await main.boundingBox();
		expect(box).toBeTruthy();
		expect(box!.width).toBeLessThanOrEqual(375);
	});
});
