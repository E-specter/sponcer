import { callBff } from '../../../lib/api/bff';

export const listMatches = (profileId: string, cursor?: string) =>
  callBff('matches', { query: { profileId, cursor } });
