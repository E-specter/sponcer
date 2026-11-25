import type { DomainEvent, DomainEventType, EventOf } from '@sponcer/contracts';
import { logger } from '../logger';

type Handler<T extends DomainEventType> = (event: EventOf<T>) => void | Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe<T extends DomainEventType>(type: T, handler: Handler<T>): void;
}

/** Bus en proceso (ADR-005). Un handler que falla se loguea y no afecta a los demás. */
export function createEventBus(): EventBus {
  const handlers = new Map<DomainEventType, Array<Handler<DomainEventType>>>();
  // El handler arranca de forma síncrona (hasta su primer await); sus fallos no salen de aquí.
  const run = async (h: Handler<DomainEventType>, event: DomainEvent): Promise<void> => {
    try {
      await h(event);
    } catch (e) {
      logger.error(`handler de ${event.type} falló`, e);
    }
  };

  return {
    subscribe(type, handler) {
      handlers.set(type, [
        ...(handlers.get(type) ?? []),
        handler as unknown as Handler<DomainEventType>,
      ]);
    },
    publish(event) {
      (handlers.get(event.type) ?? []).forEach((h) => void run(h, event));
    },
  };
}
