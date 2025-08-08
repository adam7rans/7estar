// Example user test script exporting default async (page, context, helpers)
import type { Page, BrowserContext } from 'playwright';

type Helpers = {
  screenshot: (name: string) => Promise<void>;
  step: (name: string, fn: () => Promise<void>) => Promise<void>;
};

export default async function run(page: Page, _context: BrowserContext, helpers: Helpers) {
  await helpers.step('open_example', async () => {
    await page.goto('https://example.com');
    await page.waitForLoadState('load');
  });
}
