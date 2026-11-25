import { IgHandle } from '@sponcer/contracts';
import { DomainError } from '../../../shared/errors';
import { err, ok, type Result } from '../../../shared/result';

export function normalizeHandle(raw: string): Result<string, DomainError> {
  const parsed = IgHandle.safeParse(raw);
  return parsed.success
    ? ok(parsed.data)
    : err(new DomainError('VALIDATION_ERROR', 'Handle de Instagram inválido'));
}
