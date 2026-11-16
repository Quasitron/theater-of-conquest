import { describe, it, expect } from 'vitest';
import { WHATS_NEW } from '../../src/ui/whatsNew';

describe("What's New entries", () => {
  it('have unique ids and text, and are listed newest first', () => {
    expect(new Set(WHATS_NEW.map((e) => e.id)).size).toBe(WHATS_NEW.length);
    const key = (v: string) => v.split('.').map(Number);
    for (let i = 1; i < WHATS_NEW.length; i++) {
      const [a, b] = [key(WHATS_NEW[i - 1].version), key(WHATS_NEW[i].version)];
      expect(a[0] * 1e6 + a[1] * 1e3 + a[2]).toBeGreaterThanOrEqual(b[0] * 1e6 + b[1] * 1e3 + b[2]);
    }
    for (const e of WHATS_NEW) expect(e.text.length).toBeGreaterThan(0);
  });

  it('only name pictures that exist', () => {
    const files = Object.keys((import.meta as unknown as { glob: (p: string) => Record<string, unknown> }).glob('/public/art/whatsnew/*')).map((p) => p.split('/').pop());
    for (const e of WHATS_NEW) if (e.image) expect(files).toContain(e.image.src);
  });
});
