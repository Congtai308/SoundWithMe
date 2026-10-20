import { ERROR_CODES } from "@soundwithme/constants";
import { AuthService } from "../src/modules/auth/auth.service";
import { MailService, type OutgoingMail } from "../src/modules/mail/mail.service";
import { RealtimeHarness } from "./support/realtime-harness";

/** Email verification and password reset, with outgoing mail captured instead of sent. */
const h = new RealtimeHarness();
const outbox: OutgoingMail[] = [];

beforeAll(async () => {
  await h.start();
  jest.spyOn(h.get(MailService), "send").mockImplementation(async (mail) => {
    outbox.push(mail);
  });
});
afterAll(() => h.stop());

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let visitor = 0;

async function call<T>(path: string, cookie = "", method = "GET", body?: unknown) {
  const res = await fetch(`${h.baseUrl}/api/v1${path}`, {
    method,
    headers: { "content-type": "application/json", cookie, "x-forwarded-for": `198.18.7.${(visitor++ % 250) + 1}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data: T; error?: { code: string } };
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { status: res.status, data: json.data, error: json.error, cookies };
}

/** The token in the newest mail's button sent to `email`. */
function lastLinkTo(email: string): string {
  const mail = [...outbox].reverse().find((m) => m.to === email);
  const url = mail?.action?.url;
  if (!url) throw new Error(`no link mailed to ${email}`);
  return new URL(url).searchParams.get("token")!;
}

async function register() {
  const email = `mail${stamp()}@example.com`;
  const res = await call<{ user: { id: string; emailVerified: boolean } }>("/auth/register", "", "POST", {
    displayName: "Mailer",
    email,
    password: "first-password-1",
  });
  return { email, cookies: res.cookies, user: res.data.user };
}

const mailCount = (email: string) => outbox.filter((m) => m.to === email).length;
const until = async (check: () => boolean) => {
  for (let n = 0; n < 50 && !check(); n++) await new Promise((r) => setTimeout(r, 20));
};

describe("Email verification", () => {
  it("mails a link at sign-up that confirms the address once", async () => {
    const { email, cookies, user } = await register();
    expect(user.emailVerified).toBe(false);
    await until(() => mailCount(email) === 1);
    const token = lastLinkTo(email);

    expect((await call("/auth/verify-email", "", "POST", { token })).status).toBe(200);
    const me = await call<{ user: { emailVerified: boolean } }>("/auth/me", cookies);
    expect(me.data.user.emailVerified).toBe(true);
    // Used links are gone (an already-verified account just gets INVALID_LINK for a stranger's replay).
    expect((await call("/auth/verify-email", "", "POST", { token })).error?.code).toBe(ERROR_CODES.INVALID_LINK);
    // Nothing left to resend.
    await call("/auth/verify-email/send", cookies, "POST");
    expect(mailCount(email)).toBe(1);
  });

  it("refuses made-up links", async () => {
    const res = await call("/auth/verify-email", "", "POST", { token: "x".repeat(43) });
    expect(res.error?.code).toBe(ERROR_CODES.INVALID_LINK);
  });

  it("lets Google sign in to a verified account without touching its password", async () => {
    const { email, user } = await register();
    await until(() => mailCount(email) === 1);
    await call("/auth/verify-email", "", "POST", { token: lastLinkTo(email) });

    const signedIn = await h.get(AuthService).loginOrRegisterWithGoogle({
      googleId: `g-${stamp()}`,
      email,
      displayName: "Mailer",
      avatarUrl: null,
    });
    expect(signedIn.user.id).toBe(user.id);
    expect(signedIn.user.authMethods).toEqual(expect.arrayContaining(["password", "google"]));
    expect((await call("/auth/login", "", "POST", { email, password: "first-password-1" })).status).toBe(200);
  });
});

describe("Password reset", () => {
  it("sets a new password from the mailed link and signs out every session", async () => {
    const { email, cookies } = await register();
    expect((await call("/auth/password/forgot", "", "POST", { email })).status).toBe(200);
    const token = lastLinkTo(email);

    const reset = await call("/auth/password/reset", "", "POST", { token, password: "second-password-2" });
    expect(reset.status).toBe(200);
    expect((await call("/auth/me", cookies)).status).toBe(401); // the old session ended
    expect((await call("/auth/login", "", "POST", { email, password: "first-password-1" })).status).toBe(401);
    const fresh = await call<{ user: { emailVerified: boolean } }>("/auth/login", "", "POST", {
      email,
      password: "second-password-2",
    });
    expect(fresh.status).toBe(200);
    expect(fresh.data.user.emailVerified).toBe(true); // opening the mailed link proved the address

    // The link worked once.
    const again = await call("/auth/password/reset", "", "POST", { token, password: "third-password-3" });
    expect(again.error?.code).toBe(ERROR_CODES.INVALID_LINK);
  });

  it("answers the same for unknown emails, and mails one address only a few times an hour", async () => {
    const unknown = `nobody${stamp()}@example.com`;
    const res = await call("/auth/password/forgot", "", "POST", { email: unknown });
    expect(res.status).toBe(200);
    expect(mailCount(unknown)).toBe(0);

    const { email } = await register(); // sign-up mail: 1 of 3
    await until(() => mailCount(email) === 1);
    for (let n = 0; n < 4; n++) expect((await call("/auth/password/forgot", "", "POST", { email })).status).toBe(200);
    expect(mailCount(email)).toBe(3);
  });
});
