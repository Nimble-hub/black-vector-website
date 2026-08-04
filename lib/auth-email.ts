import { getAuthEnvironment } from "./auth-environment";

type AuthEmail = {
  to: string;
  subject: string;
  preheader: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendAuthEmail(email: AuthEmail) {
  const { runtime } = getAuthEnvironment();
  if (!runtime.RESEND_API_KEY || !runtime.AUTH_EMAIL_FROM) {
    throw new Error("Transactional email is not configured.");
  }

  const safeUrl = escapeHtml(email.actionUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${runtime.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: runtime.AUTH_EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      text: `${email.heading}\n\n${email.message}\n\n${email.actionLabel}: ${email.actionUrl}`,
      html: `<!doctype html><html><body style="margin:0;background:#05070a;color:#e7e2d6;font-family:Arial,sans-serif"><div style="display:none">${escapeHtml(email.preheader)}</div><div style="max-width:620px;margin:0 auto;padding:48px 28px"><div style="margin-bottom:34px;color:#44cad1;font:700 13px/1.2 monospace;letter-spacing:.18em">BV // BLACK VECTOR</div><h1 style="margin:0 0 18px;font-size:32px;line-height:1.08">${escapeHtml(email.heading)}</h1><p style="margin:0 0 30px;color:#9baab3;font-size:16px;line-height:1.65">${escapeHtml(email.message)}</p><a href="${safeUrl}" style="display:inline-block;padding:15px 20px;background:#44cad1;color:#031014;text-decoration:none;font:700 12px/1 monospace;letter-spacing:.12em">${escapeHtml(email.actionLabel)}</a><p style="margin-top:34px;color:#53636c;font-size:12px;line-height:1.6">If you did not request this transmission, you can safely ignore it.</p></div></body></html>`,
    }),
  });

  const result = await response.json().catch(() => null) as {
    id?: string;
    message?: string;
  } | null;
  if (!response.ok) {
    const detail = result?.message ? ` ${result.message}` : "";
    throw new Error(`Transactional email failed with status ${response.status}.${detail}`);
  }
  if (!result?.id) throw new Error("Transactional email provider did not return a message ID.");
  return { provider: "resend" as const, messageId: result.id };
}
