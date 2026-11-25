// API pública del slice ingestion. Emite `ProfileIngested`.
export type { IngestionApi, IngestResult, LiveBio } from './application/ports/in/ingestion-api';
export { createIngestionModule, type IngestionModule } from './ingestion.module';
