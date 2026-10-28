/**
 * End-to-end tests of the IDE: real browser, production build, the debugger
 * running in its Web Worker. The first ones walk through the same steps as the
 * README's "find the off-by-one" demo on the Buggy Binary Search example.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

async function openIde(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('binarySearch');
}

const button = (page: Page, name: string | RegExp): Locator => page.getByRole('button', { name, exact: typeof name === 'string' });

/** The row of a variable in the Variables panel. */
function variable(page: Page, name: string): Locator {
  return page.getByTestId('variables-panel').locator(`[data-variable="${name}"]`).first();
}

/** The highlighted event in the event list (its text includes "Line N"). */
const currentEvent = (page: Page): Locator => page.locator('[aria-current="step"]');

async function startDebugging(page: Page): Promise<void> {
  await button(page, 'Debug').click();
  await expect(page.getByTitle('Current step / recorded steps')).toHaveText(/^1 \/ [\d,]+$/);
}

/** Click the breakpoint gutter of a source line (a right click edits its condition). */
async function gutterClick(page: Page, line: number, mouseButton: 'left' | 'right' = 'left'): Promise<void> {
  const lineNumber = page.locator('.monaco-editor .line-numbers', { hasText: new RegExp(`^${line}$`) });
  // Monaco only renders the lines in view; scroll down until this one is.
  for (let i = 0; i < 20 && (await lineNumber.count()) === 0; i++) {
    await page.locator('.monaco-editor .view-lines').hover();
    await page.mouse.wheel(0, 200);
  }
  await lineNumber.scrollIntoViewIfNeeded();
  const box = await lineNumber.boundingBox();
  if (!box) throw new Error(`line ${line} is not rendered`);
  await page.mouse.click(box.x - 10, box.y + box.height / 2, { button: mouseButton });
}

/** Replace the whole program. Inserted line by line, as Monaco auto-indents typed text. */
async function replaceProgram(page: Page, lines: string[]): Promise<void> {
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.insertText(line);
  }
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
  await expect(page.getByRole('tab', { name: /Call stack\s*2/ })).toBeVisible();
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

  // `lo` was last written by its declaration, `let lo = 0`, in this call.
  await variable(page, 'lo').hover();
  await button(page, 'Go to the last step that changed lo').click();
  await expect(currentEvent(page)).toContainText('Line 20');
  await expect(currentEvent(page)).toContainText('let lo = 0');
});

test('a breakpoint set before Debug stops Continue and Reverse continue on its line', async ({ page }) => {
  await openIde(page);
  await gutterClick(page, 34);
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

test('a conditional breakpoint set in the gutter popover stops only where it holds', async ({ page }) => {
  await openIde(page);
  await gutterClick(page, 23, 'right');
  const dialog = page.getByRole('dialog', { name: 'Breakpoint on line 23' });
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('lo == hi');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.ct-breakpoint-conditional')).toHaveCount(1);

  await startDebugging(page);
  await button(page, /Continue to next breakpoint/).click();
  await expect(currentEvent(page)).toContainText('Line 23');
  const lo = await variable(page, 'lo').locator('span').nth(2).textContent();
  const hi = await variable(page, 'hi').locator('span').nth(2).textContent();
  expect(lo).toBe(hi);
});

test('the run scrubber travels by keyboard and by click', async ({ page }) => {
  await openIde(page);
  await startDebugging(page);
  const scrubber = page.getByRole('slider', { name: 'Recorded run' });
  const total = Number(await scrubber.getAttribute('aria-valuemax'));
  await scrubber.focus();
  await page.keyboard.press('End');
  await expect(scrubber).toHaveAttribute('aria-valuenow', String(total));
  await page.keyboard.press('ArrowLeft');
  await expect(scrubber).toHaveAttribute('aria-valuenow', String(total - 1));
  await page.keyboard.press('Home');
  await expect(scrubber).toHaveAttribute('aria-valuenow', '1');

  const box = (await scrubber.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => Math.abs(Number(await scrubber.getAttribute('aria-valuenow')) - total / 2))
    .toBeLessThan(total * 0.02);
});

test('hovering a variable shows its value and when it last changed', async ({ page }) => {
  await openIde(page);
  await startDebugging(page);
  await button(page, 'Go to last step').click();
  await button(page, /Reverse step over/).click();
  await button(page, /Reverse step into/).click();
  await expect(currentEvent(page)).toContainText('Line 38');

  await page.locator('.monaco-editor .view-line', { hasText: 'let lo = 0' }).getByText('lo', { exact: true }).hover();
  const hover = page.locator('.monaco-hover').filter({ hasText: 'integer' });
  await expect(hover).toContainText('integer');
  await expect(hover).toContainText('(line 20)');
});

test('a program that never ends is recorded up to the step limit and says so', async ({ page }) => {
  await openIde(page);
  await replaceProgram(page, ['let i = 0', 'while true { i += 1 }']);
  await button(page, 'Run').click();
  await expect(page.getByText(/Recording stopped after 1,000,000 steps/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTitle('Current step / recorded steps')).toHaveText('1,000,000 / 1,000,000');
});

test('a compile error is reported while typing and when running', async ({ page }) => {
  await openIde(page);
  await replaceProgram(page, ['print(1)', 'let = 5']);
  // Live diagnostics: Problems counts the error before anything runs.
  await expect(page.getByRole('tab', { name: /Problems\s*1/ })).toBeVisible();
  await expect(page.locator('.monaco-editor .squiggly-error')).toHaveCount(1);

  await button(page, 'Run').click();
  await expect(page.getByRole('tab', { name: /Problems/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('problems')).toContainText('SyntaxError · Ln 2');
  await page.getByRole('tab', { name: 'Console' }).click();
  await expect(page.getByTestId('console')).toContainText('Could not run: SyntaxError at line 2');
});

test('a share link reopens the same program', async ({ page, context }) => {
  await openIde(page);
  await replaceProgram(page, ['let greeting = "shared"', 'print(greeting)']);
  await page.getByRole('button', { name: /Share|Link copied/ }).click();
  await expect(page).toHaveURL(/#code=/);

  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.locator('.monaco-editor .view-lines')).toContainText('let greeting = "shared"');
  await expect(other.getByRole('combobox', { name: 'Example program' })).toHaveValue('shared');
  await button(other, 'Run').click();
  await expect(other.getByTestId('console')).toContainText('shared');
});
