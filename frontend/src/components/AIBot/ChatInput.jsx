import {
  ArrowUp,
  Plus,
  CornerDownLeft,
} from 'lucide-react';

export default function ChatInput({
  draft,
  setDraft,
  onSend,
  isTyping,
  textareaRef,
}) {
  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend(draft);
    }
  };

  const canSend = draft.trim().length > 0 && !isTyping;

  return (
    <form
      className="ai-bot-composer"
      onSubmit={(event) => {
        event.preventDefault();

        if (canSend) {
          onSend(draft);
        }
      }}
    >
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Milo anything..."
        rows={1}
        aria-label="Message"
        data-testid="input-message"
      />

      <div className="ai-bot-composer-footer">
        <button
          className="ai-bot-add-button"
          type="button"
          aria-label="Add attachment or tool"
          data-testid="button-add-tool"
        >
          <Plus size={17} strokeWidth={1.8} />
        </button>

        <span className="ai-bot-hint">
          <CornerDownLeft size={12} />
          Enter to send
        </span>

        <button
          className="ai-bot-send"
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          data-testid="button-send-message"
        >
          <ArrowUp size={17} strokeWidth={2.2} />
        </button>
      </div>
    </form>
  );
}