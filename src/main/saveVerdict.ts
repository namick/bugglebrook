import { SaveTooNewError, loadSaveFile } from '../game/save/migrations';
import type { SaveVerdict } from './saveStore';

/**
 * Does a save load in this build? The game's own loader decides, so main
 * never writes a save that would not open, never rotates one into a backup,
 * and spots saves from a newer game (which it must not touch).
 */
export function gameSaveVerdict(text: string): SaveVerdict {
  try {
    loadSaveFile(text);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      newer: err instanceof SaveTooNewError,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
