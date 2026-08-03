import type { KeyboardEvent } from "react";

/** Submit a chat composer with Enter while preserving Shift+Enter for new lines. */
export function submitChatOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
    return;

  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
