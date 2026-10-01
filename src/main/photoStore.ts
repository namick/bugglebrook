import { existsSync } from 'node:fs';
import { mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { isPng, photoFileName, pngBase64, uniquePhotoName } from '../shared/photo';

/**
 * Writes the player's photos to `<Pictures>/Bugglebrook/` (game design doc,
 * section 14). Validates everything that crosses IPC: the payload must be a
 * PNG data URL of a sane size whose bytes start like a PNG. Writes go to a
 * temp file first and are renamed into place, like saves. Returns the path.
 */
export class PhotoStore {
  constructor(readonly dir: string) {}

  async save(raw: unknown, when: Date = new Date()): Promise<string> {
    const data = pngBase64(raw);
    if (data === null) throw new Error('Invalid photo: expected a PNG data URL');
    const bytes = Buffer.from(data, 'base64');
    if (!isPng(bytes)) throw new Error('Invalid photo: not a PNG');
    await mkdir(this.dir, { recursive: true });
    const name = uniquePhotoName(photoFileName(when), (n) => existsSync(join(this.dir, n)));
    const path = join(this.dir, name);
    const tmp = `${path}.tmp`;
    const file = await open(tmp, 'w');
    try {
      await file.writeFile(bytes);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(tmp, path);
    return path;
  }
}
