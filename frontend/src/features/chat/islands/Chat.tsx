import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { MAX_CHAT_MESSAGE, SendMessageRequest, type Message } from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { messageOf } from '../../../components/ui/errors';
import { formatDate } from '../../../lib/labels';
import { olderMessages, sendMessage } from '../api/chat';
import { subscribeMessages } from '../api/realtime';

interface Props {
  matchId: string;
  myProfileId: string;
  otherHandle: string;
  /** Más reciente primero (como devuelve la API). */
  initial: Message[];
  nextCursor: string | null;
}

export default function Chat({ matchId, myProfileId, otherHandle, initial, nextCursor }: Props) {
  const [messages, setMessages] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribeMessages(matchId, (m) =>
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev])),
      ),
    [matchId],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send(e: SubmitEvent) {
    e.preventDefault();
    const parsed = SendMessageRequest.safeParse({ senderProfileId: myProfileId, body: text });
    if (!parsed.success)
      return setError('Escribe un mensaje (máximo ' + MAX_CHAT_MESSAGE + ' caracteres).');
    setSending(true);
    setError(null);
    try {
      const sent = await sendMessage(matchId, parsed.data);
      setMessages((prev) => [sent, ...prev]);
      setText('');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSending(false);
    }
  }

  async function loadOlder() {
    if (!cursor) return;
    try {
      const page = await olderMessages(matchId, cursor);
      setMessages((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  const chronological = [...messages].reverse();

  return (
    <section className="stack" aria-label={`Chat con @${otherHandle}`}>
      {cursor && (
        <button type="button" className="btn btn-secondary" onClick={loadOlder}>
          Cargar mensajes anteriores
        </button>
      )}
      <div className="chat card" role="log" aria-live="polite" aria-label="Historial de mensajes">
        {chronological.length === 0 && (
          <p className="muted">Aún no hay mensajes. Saluda primero.</p>
        )}
        {chronological.map((m) => {
          const mine = m.senderProfileId === myProfileId;
          return (
            <div key={m.id} className={`bubble ${mine ? 'bubble-mine' : ''}`}>
              <span className="sr-only">{mine ? 'Tú' : `@${otherHandle}`}: </span>
              {m.body}
              <div className="small muted">{formatDate(m.createdAt)}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} noValidate>
        <div className="field">
          <label htmlFor="chat-text">Mensaje</label>
          <textarea
            id="chat-text"
            value={text}
            maxLength={MAX_CHAT_MESSAGE}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className="btn" disabled={sending}>
          Enviar
        </button>
      </form>
    </section>
  );
}
