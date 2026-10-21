import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

export interface OutgoingMail {
  to: string;
  subject: string;
  /** Plain text; the HTML version is built from it (a heading, paragraphs and one button). */
  text: string;
  action?: { label: string; url: string };
}

/**
 * Sends account mail over SMTP (Gmail with an App Password, see
 * app.config.ts). Without SMTP credentials mails are written to the log
 * instead, links included, so sign-up and password reset still work
 * locally.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor(configService: ConfigService) {
    const mail = configService.get<{ host: string; port: number; user?: string; pass?: string; from: string }>("app.mail")!;
    this.from = mail.from;
    this.transport =
      mail.user && mail.pass
        ? createTransport({
            host: mail.host,
            port: mail.port,
            secure: mail.port === 465,
            auth: { user: mail.user, pass: mail.pass },
          })
        : null;
  }

  async send(mail: OutgoingMail): Promise<void> {
    const text = mail.action ? `${mail.text}\n\n${mail.action.label}: ${mail.action.url}` : mail.text;
    if (!this.transport) {
      this.logger.log(`(no SMTP configured) Mail to ${mail.to} — ${mail.subject}\n${text}`);
      return;
    }
    await this.transport.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text, html: toHtml(mail) });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function toHtml(mail: OutgoingMail): string {
  const paragraphs = mail.text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = mail.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(mail.action.url)}" style="background:#a078ff;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(mail.action.label)}</a></p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1a1b21;max-width:520px">
<h2 style="margin:0 0 16px">SoundWithMe</h2>${paragraphs}${button}</div>`;
}

/** Global: auth (and later features) send mail without importing anything. */
@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
