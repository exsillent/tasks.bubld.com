import "server-only";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "tasks@bubld.com";
const region = process.env.AWS_REGION ?? "us-east-1";

let client: SESClient | null = null;
function getClient(): SESClient {
  if (!client) client = new SESClient({ region });
  return client;
}

/**
 * Best-effort email notification -- never throws. A notification failure
 * must never block the task mutation that triggered it. Logs failures so
 * they're visible in `pm2 logs`, but the caller doesn't need to handle
 * errors.
 */
export async function notifyByEmail(
  toEmails: string[],
  subject: string,
  bodyText: string,
): Promise<void> {
  const recipients = [...new Set(toEmails.filter(Boolean))];
  if (recipients.length === 0) return;

  if (!process.env.SES_FROM_EMAIL) {
    // Local dev / not-yet-configured environments: log instead of sending,
    // so the rest of the app is fully testable without AWS credentials.
    console.log(
      `[notify:dev-noop] to=${recipients.join(",")} subject="${subject}"\n${bodyText}`,
    );
    return;
  }

  try {
    await getClient().send(
      new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: recipients },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: { Text: { Data: bodyText, Charset: "UTF-8" } },
        },
      }),
    );
  } catch (err) {
    console.error("[notify] SES send failed:", err);
  }
}
