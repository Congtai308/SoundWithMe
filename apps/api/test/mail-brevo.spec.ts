import type { ConfigService } from "@nestjs/config";
import { MailService, parseAddress } from "../src/modules/mail/mail.service";

/** Where SMTP is blocked (Render's free plan), mail goes through Brevo's HTTPS API. */
const configWith = (mail: Record<string, unknown>) =>
  ({ get: () => ({ host: "smtp.gmail.com", port: 465, from: "SoundWithMe <me@example.com>", ...mail }) }) as unknown as ConfigService;

const mail = { to: "listener@example.com", subject: "Xác minh email", text: "Chào bạn", action: { label: "Xác minh", url: "https://x.test/v?t=1" } };

describe("MailService with Brevo", () => {
  afterEach(() => jest.restoreAllMocks());

  it("posts the mail to Brevo's API with the key and the verified sender", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
    await new MailService(configWith({ brevoApiKey: "xkeysib-test", user: "me@example.com", pass: "x" })).send(mail);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init!.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
    const body = JSON.parse(init!.body as string);
    expect(body.sender).toEqual({ name: "SoundWithMe", email: "me@example.com" });
    expect(body.to).toEqual([{ email: "listener@example.com" }]);
    expect(body.textContent).toContain("https://x.test/v?t=1");
    expect(body.htmlContent).toContain('href="https://x.test/v?t=1"');
  });

  it("fails loudly when Brevo refuses, so the caller can report it", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response('{"code":"unauthorized"}', { status: 401 }));
    await expect(new MailService(configWith({ brevoApiKey: "xkeysib-bad" })).send(mail)).rejects.toThrow(/401/);
  });

  it("only logs without any credentials", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    await new MailService(configWith({})).send(mail);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("parseAddress", () => {
  it.each([
    ["SoundWithMe <me@example.com>", { name: "SoundWithMe", email: "me@example.com" }],
    ['"Sound With Me" <me@example.com>', { name: "Sound With Me", email: "me@example.com" }],
    ["me@example.com", { email: "me@example.com" }],
    ["<me@example.com>", { email: "me@example.com" }],
  ])("%s", (value, expected) => expect(parseAddress(value)).toEqual(expected));
});
