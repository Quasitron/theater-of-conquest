import { parseSave, serializeSave, type SaveFile } from './saveFormat';

export type ParseResult = ReturnType<typeof parseSave>;

/**
 * Like parseSave, but the work (parsing, replaying the history) happens in a background worker so the page stays
 * responsive while a big game loads. Without Worker support, or if the worker fails, it falls back to parseSave itself.
 */
export function parseSaveAsync(input: string | SaveFile): Promise<ParseResult> {
  const inline = () => parseSave(typeof input === 'string' ? input : serializeSave(input));
  if (typeof Worker === 'undefined') return Promise.resolve(inline());
  return new Promise<ParseResult>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./parseSaveWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      return resolve(inline());
    }
    worker.onmessage = (e: MessageEvent<ParseResult>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(inline());
    };
    worker.postMessage(input);
  });
}
