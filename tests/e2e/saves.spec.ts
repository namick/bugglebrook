import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clickSlot, launchApp, uiAt, waitForScene } from './app';

// The pre-release review's save and robustness items, driven through the
// real app: P-01 (a save that will not open is locked, never destroyed),
// P-02 (failed saves show a sign and retry), P-11 and P-12 (the last save
// on quit, Cmd+Q included), and P-13 (a crash still saves).

const savesDir = (userData: string): string => join(userData, 'saves');
const slotFile = (userData: string, n: number): string => join(savesDir(userData), `slot-${n}.json`);
/** The tick a slot's save file was written at. */
const savedTick = (userData: string, n: number): number =>
  (JSON.parse(readFileSync(slotFile(userData, n), 'utf8')) as { world: { tick: number } }).world.tick;
const logText = (userData: string): string => {
  try {
    return readFileSync(join(userData, 'logs', 'main.log'), 'utf8');
  } catch {
    return '';
  }
};

/** Press a sign and drag it with the real mouse to a client point (the menu's clock frozen). */
async function dragSign(page: Page, slot: number, to: { x: number; y: number }): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__bb!.menuSettled()), { timeout: 20_000 }).toBe(true);
  const from = (await page.evaluate((s) => window.__bb!.slotButtonClient(s), slot))!;
  await page.evaluate(() => window.__bb!.freezeMenu(true));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await expect.poll(() => page.evaluate((s) => window.__bb!.sign(s)?.pressed, slot)).toBe(true);
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 16, from.y + ((to.y - from.y) * i) / 16);
    await page.waitForTimeout(20);
  }
  await expect.poll(() => page.evaluate((s) => window.__bb!.sign(s)?.dragging, slot)).toBe(true);
}

test('a slot whose save will not open shows a padlock, refuses a click, and is never touched (P-01)', async () => {
  const bb0 = await launchApp();
  const userData = bb0.userData;
  await bb0.close({ keepUserData: true });
  mkdirSync(savesDir(userData), { recursive: true });
  // Slot 2: a save from a newer game (a rollback). Slot 3: broken, with no backup.
  const newer = '{"version": 999, "world": {"from": "the future"}}';
  writeFileSync(slotFile(userData, 2), newer);
  writeFileSync(join(savesDir(userData), 'slot-2.bak.json'), newer);
  writeFileSync(slotFile(userData, 3), '{"version": 6, "world": ');
  const before = (): Record<string, string> =>
    Object.fromEntries(
      readdirSync(savesDir(userData))
        .sort()
        .map((f) => [f, readFileSync(join(savesDir(userData), f), 'utf8')]),
    );
  const untouched = before();

  let bb = await launchApp(userData);
  try {
    const { page } = bb;
    await waitForScene(page, 'menu');
    expect(await page.evaluate(() => window.__bb!.slotLocks())).toEqual([null, 'newer', 'broken']);
    // Many menu visits change nothing (they used to set the save aside and empty the slot).
    for (let i = 0; i < 3; i++) await page.evaluate(() => window.__bb!.listSlots());
    await bb.close({ keepUserData: true });
    bb = await launchApp(userData);
    await waitForScene(bb.page, 'menu');
    expect(await bb.page.evaluate(() => window.__bb!.slotLocks())).toEqual([null, 'newer', 'broken']);

    // The real mouse clicks the padlocked sign: it shakes no, and the menu stays.
    await expect
      .poll(() => bb.page.evaluate(() => window.__bb!.menuSettled()), { timeout: 20_000 })
      .toBe(true);
    const at = (await bb.page.evaluate(() => window.__bb!.slotButtonClient(1)))!;
    await bb.page.mouse.move(at.x, at.y, { steps: 3 });
    await bb.page.mouse.click(at.x, at.y);
    await expect.poll(() => bb.page.evaluate(() => window.__bb!.sign(1)?.refusals)).toBe(1);
    await bb.page.waitForTimeout(500);
    expect(await bb.page.evaluate(() => window.__bb!.scene())).toBe('menu');
    expect(before()).toEqual(untouched);

    // The broken one can go in the bin: its file is moved aside, never deleted, and the slot is free.
    const bin = await uiAt(bb.page, 'bin');
    await dragSign(bb.page, 2, { x: bin.x, y: bin.y - 60 });
    await bb.page.mouse.up();
    await bb.page.evaluate(() => window.__bb!.menuFrames(100));
    await bb.page.evaluate(() => window.__bb!.freezeMenu(false));
    await expect
      .poll(async () => (await bb.page.evaluate(() => window.__bb!.listSlots())).map((s) => s.exists), {
        timeout: 15_000,
      })
      .toEqual([false, true, false]);
    expect(readFileSync(join(savesDir(userData), 'slot-3.aside-1.json'), 'utf8')).toBe(
      untouched['slot-3.json'],
    );
    // The newer game's save is still exactly as it was.
    expect(readFileSync(slotFile(userData, 2), 'utf8')).toBe(newer);
    expect(readFileSync(join(savesDir(userData), 'slot-2.bak.json'), 'utf8')).toBe(newer);
  } finally {
    await bb.close();
  }
});

test('a save that fails puts a cloud up, retries on its own, and the cloud goes when saving works (P-02)', async () => {
  // A read-only folder makes the save fail for real. Windows and root ignore the mode.
  test.skip(process.platform === 'win32' || process.getuid?.() === 0, 'needs POSIX permissions');
  const bb = await launchApp();
  const dir = savesDir(bb.userData);
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.evaluate(() => window.__bb!.saveNow());
    expect(await page.evaluate(() => window.__bb!.saveTrouble())).toMatchObject({
      shown: false,
      failures: 0,
    });
    chmodSync(dir, 0o500);
    await page.evaluate(() => window.__bb!.saveNow());
    const trouble = await page.evaluate(() => window.__bb!.saveTrouble());
    expect(trouble).toMatchObject({ shown: true, visible: true, failures: 1 });
    expect(trouble.reason).toMatch(/EACCES|EPERM|permission/i);
    // The reason goes in the log file.
    await expect.poll(() => logText(bb.userData)).toMatch(/Save: autosave of slot 0 failed \(1 in a row\)/);
    // It tries again on its own after 5 s, and fails again: the cloud stays.
    await expect
      .poll(() => page.evaluate(() => window.__bb!.saveTrouble().failures), { timeout: 20_000 })
      .toBe(2);
    expect(await page.evaluate(() => window.__bb!.saveTrouble().visible)).toBe(true);
    // The disk is fine again: the next retry works and the cloud goes.
    chmodSync(dir, 0o755);
    await expect
      .poll(() => page.evaluate(() => window.__bb!.saveTrouble()), { timeout: 30_000 })
      .toMatchObject({ shown: false, visible: false, failures: 0 });
    await expect.poll(() => logText(bb.userData)).toContain('Save: saving works again');
    expect(existsSync(slotFile(bb.userData, 1))).toBe(true);
  } finally {
    chmodSync(dir, 0o755);
    await bb.close();
  }
});

test('quitting the app (Cmd+Q, the dock, app.quit) saves the last moments first and then quits (P-11, P-12)', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.evaluate(() => window.__bb!.saveNow());
    const saved = savedTick(bb.userData, 1);
    // Play on well past the last save; the autosave is still 30 s away.
    await page.evaluate(() => window.__bb!.step(600));
    const tick = await page.evaluate(() => window.__bb!.tick());
    expect(tick).toBeGreaterThanOrEqual(saved + 600);
    const closed = bb.app.waitForEvent('close');
    // What Cmd+Q does on macOS. One call: the app must not need a second press.
    void bb.app.evaluate(({ app }) => app.quit()).catch(() => undefined);
    await closed;
    expect(savedTick(bb.userData, 1)).toBeGreaterThanOrEqual(tick);
    expect(logText(bb.userData)).toContain('Saving before quit');
  } finally {
    await bb.close().catch(() => undefined);
  }
});

test('a crash still saves the world before the oops screen (P-13)', async () => {
  const bb = await launchApp();
  try {
    const { page } = bb;
    await clickSlot(page, 0);
    await page.evaluate(() => window.__bb!.saveNow());
    const saved = savedTick(bb.userData, 1);
    await page.evaluate(() => window.__bb!.step(600));
    await page.evaluate(() => window.__bb!.crash());
    await expect.poll(() => page.evaluate(() => window.__bb!.oops().shown)).toBe(true);
    await expect.poll(() => savedTick(bb.userData, 1)).toBeGreaterThanOrEqual(saved + 600);
  } finally {
    await bb.close();
  }
});
