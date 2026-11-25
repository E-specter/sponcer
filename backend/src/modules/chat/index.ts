// API pública del slice chat. Emite `MessageSent`; consume `MatchCreated` (solo con el MatchReader mock).
export type { ChatApi } from './application/ports/in/chat-use-cases';
export type { MatchReader } from './application/ports/out/chat-ports';
export type { MatchRef } from './domain/match-ref';
export { createChatModule, type ChatModule } from './chat.module';
