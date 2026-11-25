// API pública del slice matching. Emite `MatchCreated`.
export type { MatchingApi } from './application/ports/in/matching-api';
export type { MatchRecord } from './domain/candidate';
export { createMatchingModule, type MatchingModule } from './matching.module';
