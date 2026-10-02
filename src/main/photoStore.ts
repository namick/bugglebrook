import { existsSync } from 'node:fs';
import { mkdir, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { photoFileName, photoPng, uniquePhotoName } from '../shared/photo';

/**
 * Writes the player's photos to `<Pictures>/Bugglebrook/` (game design doc,
 * section 14). Validates everything that crosses IPC: the payload must be
 * PNG bytes of a sane length, and the PNG must say it is 1920x1080. Writes go to a
 * temp file first and are renamed into place, like saves. Returns the path.
 */
export class PhotoStore {
  constructor(readonly dir: string) {}

  async save(raw: unknown, when: Date = new Date()): Promise<string> {
    const bytes = photoPng(raw);
    if (bytes === null) throw new Error('Invalid photo: expected the bytes of a 1920x1080 PNG');
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
