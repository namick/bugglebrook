import { _electron as electron, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { EntityView } from '../../src/game/sim';
import type { TestHook } from '../../src/renderer/src/debug/testHook';

export type { TestHook, EntityView };

export interface Launched {
  app: ElectronApplication;
  page: Page;
  userData: string;
  errors: string[];
  close(options?: { keepUserData?: boolean }): Promise<void>;
}

const root = resolve(import.meta.dirname, '../..');

/**
 * Launch the built app (out/) in test mode with an isolated userData dir.
 * Pass an existing `userData` to relaunch into the same saves.
 */
export async function launchApp(userData?: string): Promise<Launched> {
  const dir = userData ?? mkdtempSync(join(tmpdir(), 'bugglebrook-e2e-'));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  // Some hosts (editors built on Electron) leak this; it turns Electron into plain Node.
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [root],
    env: { ...env, BUGGLEBROOK_TEST: '1', BUGGLEBROOK_USER_DATA: dir },
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.waitForFunction(() => window.__bb !== undefined);
  return {
    app,
    page,
    userData: dir,
    errors,
    async close(options = {}) {
      await app.close();
      if (!options.keepUserData) rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function waitForScene(page: Page, scene: 'menu' | 'world'): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__bb!.scene())).toBe(scene);
}

/** Click a menu slot card with the real mouse. */
export async function clickSlot(page: Page, slot: number): Promise<void> {
  await waitForScene(page, 'menu');
  const pos = await page.evaluate((s) => window.__bb!.slotButtonClient(s), slot);
  expect(pos).not.toBeNull();
  await page.mouse.click(pos!.x, pos!.y);
  await waitForScene(page, 'world');
}

export const entities = (page: Page): Promise<EntityView[]> => page.evaluate(() => window.__bb!.entities());

export const entity = (page: Page, id: number): Promise<EntityView | null> =>
  page.evaluate((i) => window.__bb!.entity(i), id);
