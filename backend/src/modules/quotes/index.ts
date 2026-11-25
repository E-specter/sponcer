// API pública del slice quotes. Emite `QuoteStatusChanged`.
export type { QuotesApi } from './application/ports/in/quotes-use-cases';
export { createQuotesModule, type QuotesModule } from './quotes.module';
