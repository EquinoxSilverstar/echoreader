import { expect, test } from '@playwright/test';
import { enterGuestReader, useTestDeviceVoices } from './support';

test('guest mode keeps cloud narration unavailable and device narration available', async ({ page }) => {
  await useTestDeviceVoices(page);
  await enterGuestReader(page);
  await page.getByText(/Narrator:/).click();

  await expect(page.getByText('Choose a narrator')).toBeVisible();
  await page.getByText('Natural (cloud)', { exact: true }).click();
  await expect(page.getByText('Sign in to use cloud narration')).toBeVisible();
  await expect(page.getByText(/Cloud narration requires an EchoReader account/)).toBeVisible();

  await page.getByText('On this device', { exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Test Natural Female', { exact: true })).toBeVisible();
});
