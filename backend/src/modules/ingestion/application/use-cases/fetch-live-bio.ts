import { ok } from '../../../../shared/result';
import { normalizeHandle } from '../normalize-handle';
import type { IngestionApi } from '../ports/in/ingestion-api';
import type { InstagramSource } from '../ports/out/instagram-source';

export const makeFetchLiveBio =
  (d: { source: InstagramSource }): IngestionApi['fetchLiveBio'] =>
  async (rawHandle) => {
    const handle = normalizeHandle(rawHandle);
    if (!handle.ok) return handle;
    const live = await d.source.fetchLiveBio(handle.value);
    if (!live.ok) return live;
    const { biography, isPrivate, isBusiness } = live.value;
    return ok({ biography, isPrivate, isBusiness });
  };
