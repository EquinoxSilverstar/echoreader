import { expect, test } from '@playwright/test';
import { enterGuestReader, readSpeechLog, useTestDeviceVoices } from './support';

test('user can switch between device voices and audition the selected voice', async ({ page }) => {
  await useTestDeviceVoices(page);
  await enterGuestReader(page);
  await page.getByText(/Narrator:/).click();
  await page.getByText('On this device', { exact: true }).click();

  const voiceList = page.getByRole('dialog');
  await expect(voiceList.getByText('Test Natural Female', { exact: true })).toBeVisible();
  await voiceList.getByText('Test Standard Male', { exact: true }).click();
  await expect(page.getByText(/Narrator: Test Standard Male/)).toBeVisible();
  await expect.poll(async () => (await readSpeechLog(page)).at(-1)?.voice).toBe('test-standard-en-GB');

  await voiceList.getByText('Test Natural Female', { exact: true }).click();
  await expect(page.getByText(/Narrator: Test Natural Female/)).toBeVisible();
  await expect.poll(async () => (await readSpeechLog(page)).at(-1)?.voice).toBe('test-natural-en-US');
});
