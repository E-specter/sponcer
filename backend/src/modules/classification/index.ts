// API pública del slice classification. Emite `ProfileClassified`; consume `ProfileIngested` y `ProfileDeclaredDataChanged`.
export type { BackfillResult, ClassificationApi } from './application/ports/in/classification-api';
export { createClassificationModule, type ClassificationModule } from './classification.module';
