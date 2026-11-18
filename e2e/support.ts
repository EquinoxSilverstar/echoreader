import { expect, type Page } from '@playwright/test';

export async function useTestDeviceVoices(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const voices = [
      { voiceURI: 'test-natural-en-US', name: 'Test Natural Female', lang: 'en-US', default: true, localService: true },
      { voiceURI: 'test-standard-en-GB', name: 'Test Standard Male', lang: 'en-GB', default: false, localService: true },
    ];
    const speechLog: Array<{ text: string; rate: number; voice?: string }> = [];
    class TestUtterance {
      text = '';
      rate = 1;
      pitch = 1;
      voice: typeof voices[number] | null = null;
      onstart?: (event: Event) => void;
      onend?: (event: Event) => void;
      onerror?: (event: Event) => void;
      onpause?: (event: Event) => void;
      onresume?: (event: Event) => void;
      onmark?: (event: Event) => void;
      onboundary?: (event: Event) => void;
    }

    let speaking = false;
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak: (utterance: TestUtterance) => {
          speaking = true;
          speechLog.push({
            text: utterance.text,
            rate: utterance.rate,
            voice: utterance.voice?.voiceURI,
          });
          setTimeout(() => utterance.onstart?.(new Event('start')), 0);
        },
        cancel: () => { speaking = false; },
        pause: () => { speaking = false; },
        resume: () => { speaking = true; },
        get speaking() { return speaking; },
        get paused() { return !speaking; },
        onvoiceschanged: null,
      },
    });
    Object.defineProperty(window, '__echoSpeechLog', { configurable: true, value: speechLog });
  });
}

export async function enterGuestReader(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByText('Continue as a guest', { exact: true }).click();
  await expect(page.getByText(/Narrator:/)).toBeVisible();
}

export async function readSpeechLog(page: Page): Promise<Array<{ text: string; rate: number; voice?: string }>> {
  return page.evaluate(() => {
    return (window as Window & {
      __echoSpeechLog?: Array<{ text: string; rate: number; voice?: string }>;
    }).__echoSpeechLog || [];
  });
}
