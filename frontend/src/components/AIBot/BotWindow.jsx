import { ArrowUp, Bot, X } from 'lucide-react';
import Message from './Message';
import ChatInput from './ChatInput';

function initialsFor(name) {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ avatar, botName, className }) {
  const isImage = avatar?.startsWith('http') || avatar?.startsWith('data:');

  return (
    <div className={`ai-bot-avatar ${className}`} aria-hidden="true">
      {isImage ? <img src={avatar} alt="" /> : avatar || initialsFor(botName)}
    </div>
  );
}

export default function BotWindow({
  botName,
  greeting,
  avatar,
  suggestions,
  messages,
  isTyping,
  draft,
  setDraft,
  onSend,
  onClose,
  messagesEndRef,
  textareaRef,
}) {
  const hasConversation = messages.length > 0;

  return (
    <section className="ai-bot-panel" aria-label={`${botName} chat`}>
      <header className="ai-bot-header">
        <div className="ai-bot-identity">
          <Avatar avatar={avatar} botName={botName} className="ai-bot-avatar-header" />
          <div>
            <p className="ai-bot-name" data-testid="text-bot-name">{botName}</p>
            <p className="ai-bot-status"><span /> Usually replies right away</p>
          </div>
        </div>
        <button
          className="ai-bot-icon-button"
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          data-testid="button-close-chat"
        >
          <X size={18} strokeWidth={1.8} />
        </button>
      </header>

      <div className="ai-bot-messages" aria-live="polite">
        {!hasConversation ? (
          <div className="ai-bot-welcome">
  <div className="ai-bot-welcome-mark" aria-hidden="true">
    <Bot size={24} strokeWidth={1.7} />
  </div>

  <p className="ai-bot-eyebrow">Your farming assistant</p>

  <h2>
    Hello! I'm {botName} 👋
  </h2>

  <p className="ai-bot-welcome-copy">
    I can help you with crop advice, mandi prices, weather,
    and smarter farming decisions .
  </p>

  <div className="ai-bot-suggestions" aria-label="Suggested prompts">
  {suggestions.slice(0, 4).map((suggestion, index) => (
    <button
      className="ai-bot-suggestion"
      key={suggestion}
      type="button"
      onClick={() => onSend(suggestion)}
      data-testid={`button-suggestion-${index}`}
    >
      <span className="ai-bot-suggestion-icon" aria-hidden="true">
        {["🍅", "🌦️", "🌾", "💰"][index]}
      </span>

      <span className="ai-bot-suggestion-content">
        <span className="ai-bot-suggestion-title">
          {suggestion}
        </span>

        <span className="ai-bot-suggestion-description">
          {[
            "Check today's mandi rates",
            "Check rain and forecast",
            "Get advice for your crops",
            "Find better markets to sell"
          ][index]}
        </span>
      </span>

      <span className="ai-bot-suggestion-arrow">
        <ArrowUp size={14} strokeWidth={1.8} />
      </span>
    </button>
  ))}
</div>
</div>
        ) : (
          <div className="ai-bot-thread">
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                avatar={avatar}
                botName={botName}
              />
            ))}
            {isTyping && (
  <div
    className="ai-bot-message-row assistant"
    data-testid="status-typing"
  >
    <div className="ai-bot-thinking">
      <div className="ai-bot-thinking-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      <span>Milo is thinking</span>
    </div>
  </div>
)}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatInput
        draft={draft}
        setDraft={setDraft}
        onSend={onSend}
        isTyping={isTyping}
        textareaRef={textareaRef}
      />
      <p className="ai-bot-disclaimer">AI can make mistakes. Check important details.</p>
    </section>
  );
}