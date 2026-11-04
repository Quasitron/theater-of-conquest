/// <reference lib="webworker" />
import { parseSave, serializeSave, type SaveFile } from './saveFormat';

/** Runs parseSave off the page: replaying a long game can take seconds, which would freeze the browser tab. */
self.onmessage = (e: MessageEvent<string | SaveFile>) => {
  const text = typeof e.data === 'string' ? e.data : serializeSave(e.data);
  (self as unknown as Worker).postMessage(parseSave(text));
};
