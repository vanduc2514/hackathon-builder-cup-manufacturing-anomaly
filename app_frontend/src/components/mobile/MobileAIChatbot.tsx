import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../types/mobile';
import MobileHeader from './MobileHeader';
import { CHAT_SUGGESTIONS, mockReply } from './mobileData';

interface MobileAIChatbotProps {
  messages: ChatMessage[];
  initials: string;
  activeCount: number;
  onAppend: (msg: ChatMessage) => void;
}

/** ChatGPT-style helper that knows the technician's work orders, manuals and past repairs. */
export default function MobileAIChatbot({
  messages,
  initials,
  activeCount,
  onAppend,
}: MobileAIChatbotProps): React.ReactElement {
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({
        top: chatRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages.length, typing]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || typing) return;
    onAppend({ id: `u-${Date.now()}`, role: 'user', text: q });
    setDraft('');
    setTyping(true);
    setTimeout(() => {
      const r = mockReply(q);
      onAppend({ id: `a-${Date.now()}`, role: 'assistant', ...r });
      setTyping(false);
    }, 1100);
  };

  const onlyWelcome = messages.length <= 1;

  return (
    <div className="m-chat-view">
      <MobileHeader title="AI Helper" subtitle="Ask about specs, steps or any alert" initials={initials} />
      <div className="m-chat" ref={chatRef}>
        <div className="m-glass m-card m-row" style={{ gap: 10, padding: 12 }}>
          <span className="m-li-icon" style={{ width: 34, height: 34 }}>
            <span className="material-symbols-outlined">neurology</span>
          </span>
          <div className="m-col" style={{ gap: 4, flex: 1 }}>
            <span className="m-li-title" style={{ fontSize: 13 }}>What I can see</span>
            <div className="m-row" style={{ flexWrap: 'wrap', gap: 5 }}>
              <span className="m-chip indigo plain">{activeCount} active jobs</span>
              <span className="m-chip plain">OEM manuals</span>
              <span className="m-chip plain">8D reports</span>
              <span className="m-chip plain">Live sensors</span>
            </div>
          </div>
        </div>

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="m-bubble user">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="m-ai-row">
              <span className="m-ai-av">
                <span className="material-symbols-outlined ms-fill">auto_awesome</span>
              </span>
              <div className="m-bubble ai m-glass" style={{ borderRadius: '20px 20px 20px 6px', maxWidth: '86%' }}>
                {m.text}
                {m.citation && (
                  <div>
                    <span className="m-cite">
                      <span className="material-symbols-outlined">menu_book</span>
                      {m.citation}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {typing && (
          <div className="m-ai-row">
            <span className="m-ai-av">
              <span className="material-symbols-outlined ms-fill">auto_awesome</span>
            </span>
            <div className="m-bubble ai m-glass" style={{ borderRadius: '20px 20px 20px 6px' }}>
              <span className="m-typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        )}

        {onlyWelcome && (
          <>
            <div className="m-label" style={{ marginTop: 4 }}>Try asking</div>
            <div className="m-suggest">
              {CHAT_SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <form
        className="m-composer m-glass"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          id="m-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything…"
          aria-label="Message AI Helper"
        />
        <button type="button" className="m-ghost-icon" aria-label="Voice input">
          <span className="material-symbols-outlined">mic</span>
        </button>
        <button type="submit" className="m-send" disabled={!draft.trim() || typing} aria-label="Send" id="m-chat-send">
          <span className="material-symbols-outlined">arrow_upward</span>
        </button>
      </form>
    </div>
  );
}
