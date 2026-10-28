/**
 * End-to-end tests of the IDE: real browser, production build, the debugger
 * running in its Web Worker. They walk through the same steps as the README's
 * "find the off-by-one" demo on the Buggy Binary Search example.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

async function openIde(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('binarySearch');
}

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name, exact: typeof name === 'string' });

/** The value shown for a variable in the Variables panel. */
function variable(page: Page, name: string): Locator {
  return page.getByTestId('variables-panel').locator(`[data-variable="${name}"]`).first();
}

/** The highlighted event in the timeline (its text includes "Line N"). */
const currentEvent = (page: Page): Locator => page.locator('[aria-current="step"]');

async function startDebugging(page: Page): Promise<void> {
  await button(page, 'Debug').click();
  await expect(page.getByTitle('Current step / recorded steps')).toHaveText(/^1 \/ [\d,]+$/);
}

/** Click the breakpoint gutter of a source line. */
async function toggleBreakpoint(page: Page, line: number): Promise<void> {
  const lineNumber = page.locator('.monaco-editor .line-numbers', { hasText: new RegExp(`^${line}$`) });
  await lineNumber.scrollIntoViewIfNeeded();
  const box = await lineNumber.boundingBox();
  if (!box) throw new Error(`line ${line} is not rendered`);
  await page.mouse.click(box.x - 12, box.y + box.height / 2);
}

test('Run executes the program and shows its output', async ({ page }) => {
  await openIde(page);
  await button(page, 'Run').click();
  const console = page.getByTestId('console');
  await expect(console).toContainText('Searching for 7:  index 3');
  await expect(console).toContainText('Searching for 15: index -1');
});

test('stepping backward lands inside the call that returned -1, with correct variable names', async ({ page }) => {
  await openIde(page);
  await startDebugging(page);

  await button(page, 'Go to last step').click();
  await button(page, /Reverse step over/).click();
  await expect(currentEvent(page)).toContainText('Line 46');

  await button(page, /Reverse step into/).click();
  await expect(currentEvent(page)).toContainText('Line 38');
  await expect(page.getByRole('button', { name: /Call Stack \(2\)/ })).toBeVisible();
  await expect(variable(page, 'target')).toContainText('1');
  await expect(variable(page, 'lo')).toContainText('0');
  await expect(variable(page, 'hi')).toContainText('0');
});

test('"last change" jumps to the step that last wrote a variable', async ({ page }) => {
  await openIde(page);
  await startDebugging(page);
  await button(page, 'Go to last step').click();
  await button(page, /Reverse step over/).click();
  await button(page, /Reverse step into/).click();
  await expect(currentEvent(page)).toContainText('Line 38');

  await variable(page, 'hi').hover();
  await button(page, 'Go to the last step that changed hi').click();
  await expect(currentEvent(page)).toContainText('Line 34');
  await expect(currentEvent(page)).toContainText('hi = 0');
  // mid and value are block locals of the while body: visible here, by name.
  await expect(variable(page, 'mid')).toContainText('1');
  await expect(variable(page, 'value')).toContainText('3');
});

test('a breakpoint set before Debug stops Continue and Reverse continue on its line', async ({ page }) => {
  await openIde(page);
  await toggleBreakpoint(page, 34);
  await startDebugging(page);

  await button(page, /Continue to next breakpoint/).click();
  await expect(currentEvent(page)).toContainText('Line 34');
  const firstHit = await page.getByTitle('Current step / recorded steps').textContent();

  await button(page, /Continue to next breakpoint/).click();
  await expect(currentEvent(page)).toContainText('Line 34');
  await expect(page.getByTitle('Current step / recorded steps')).not.toHaveText(firstHit ?? '');

  await button(page, /Reverse continue/).click();
  await expect(page.getByTitle('Current step / recorded steps')).toHaveText(firstHit ?? '');
});

test('a program that never ends is recorded up to the step limit and says so', async ({ page }) => {
  await openIde(page);
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('let i = 0\nwhile true { i += 1 }');
  await button(page, 'Run').click();
  await expect(page.getByText(/Recording stopped after 1,000,000 steps/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTitle('Current step / recorded steps')).toHaveText('1,000,000 / 1,000,000');
});

test('a compile error is reported with its line', async ({ page }) => {
  await openIde(page);
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('print(1)\nlet = 5');
  await button(page, 'Run').click();
  await expect(page.getByText(/Execution Diagnostic Error \(Line 2/)).toBeVisible();
  await expect(page.getByText(/SyntaxError/)).toBeVisible();
});
