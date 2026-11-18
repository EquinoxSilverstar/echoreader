import { expect, test } from '@playwright/test';
import { enterGuestReader, readSpeechLog, useTestDeviceVoices } from './support';

test('playback can start, pause, and resume at a selected speed', async ({ page }) => {
  await useTestDeviceVoices(page);
  await enterGuestReader(page);

  await page.getByRole('button', { name: 'Play narration' }).click();
  await expect(page.getByRole('button', { name: 'Pause narration' })).toBeVisible();
  await expect.poll(async () => (await readSpeechLog(page)).length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Pause narration' }).click();
  await expect(page.getByRole('button', { name: 'Play narration' })).toBeVisible();
  await page.getByRole('button', { name: 'Set narration speed to 1.25x' }).click();
  await page.getByRole('button', { name: 'Play narration' }).click();
  await expect.poll(async () => (await readSpeechLog(page)).at(-1)?.rate).toBe(1.25);
});
