import type { KeyboardEvent } from "react";

/** Identify a send key while preserving Shift+Enter for new lines. */
export function submitChatOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
    return false;

  event.preventDefault();
  return true;
}
