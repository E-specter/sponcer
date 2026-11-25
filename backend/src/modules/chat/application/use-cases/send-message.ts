import { randomUUID } from 'node:crypto';
import type { Message } from '@sponcer/contracts';
import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import { err, ok } from '../../../../shared/result';
import type { ProfilesApi } from '../../../profiles';
import { isParticipant } from '../../domain/match-ref';
import type { SendMessage } from '../ports/in/chat-use-cases';
import type { MatchReader, MessageRepository, RealtimeGateway } from '../ports/out/chat-ports';

export const makeSendMessage =
  (d: {
    matches: MatchReader;
    messages: MessageRepository;
    realtime: RealtimeGateway;
    profiles: ProfilesApi;
    bus: EventBus;
    now: () => Date;
    newId?: () => string;
  }): SendMessage =>
  async (userId, matchId, req) => {
    const match = await d.matches.findById(matchId);
    if (!match) return err(new DomainError('NOT_FOUND', 'Match no encontrado'));
    const allowed =
      isParticipant(match, req.senderProfileId) &&
      (await d.profiles.isOwner(req.senderProfileId, userId));
    if (!allowed) return err(new DomainError('FORBIDDEN', 'No participas en este match'));

    const message: Message = {
      id: (d.newId ?? randomUUID)(),
      matchId,
      senderProfileId: req.senderProfileId,
      body: req.body,
      createdAt: d.now().toISOString(),
    };
    await d.messages.add(message);
    await d.realtime.publish(message);
    d.bus.publish({
      type: 'MessageSent',
      messageId: message.id,
      matchId,
      senderProfileId: message.senderProfileId,
    });
    return ok(message);
  };
