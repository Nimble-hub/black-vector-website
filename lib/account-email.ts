export const EMAIL_REQUIRED_CONVERSATION_ID = "system-email-required";
export const EMAIL_REQUIRED_MESSAGE_ID = "00000000-0000-4000-a000-000000000001";
export const EMAIL_REQUIRED_NOTICE_TITLE = "Contact email required";

export function hasDeliverableEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return Boolean(normalized) && !normalized.endsWith(".invalid");
}

export function hasVerifiedContactEmail(user: {
  email: string;
  emailVerified: boolean;
}) {
  return user.emailVerified && hasDeliverableEmail(user.email);
}

export function safeInternalReturnTo(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/account";
  }
  return value;
}
