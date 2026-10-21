import * as bcrypt from "bcrypt";
import { ERROR_CODES } from "@soundwithme/constants";
import { AuthService } from "../src/modules/auth/auth.service";
import { UsersService } from "../src/modules/users/users.service";
import { RealtimeHarness } from "./support/realtime-harness";

/** Sign-up by mailed link, email verification and password reset; mail is captured, never sent. */
const h = new RealtimeHarness();

beforeAll(() => h.start());
afterAll(() => h.stop());

const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let visitor = 0;

async function call<T>(path: string, cookie = "", method = "GET", body?: unknown, ip?: string) {
  const res = await fetch(`${h.baseUrl}/api/v1${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      cookie,
      "x-forwarded-for": ip ?? `198.18.${Math.floor(visitor / 250)}.${(visitor++ % 250) + 1}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { data: T; error?: { code: string } };
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { status: res.status, data: json.data, error: json.error, cookies };
}

const newEmail = () => `mail${stamp()}@example.com`;
const mailsTo = (email: string) => h.outbox.filter((m) => m.to === email);
const settle = () => new Promise((r) => setTimeout(r, 300));

/** An unverified password account as sign-up used to create them (before mailed sign-up links). */
async function legacyAccount() {
  const email = newEmail();
  const userDoc = await h.get(UsersService).create({
    username: `legacy${stamp()}`,
    displayName: "Legacy",
    email,
    passwordHash: await bcrypt.hash("first-password-1", 4),
    authMethods: ["password"],
    isGuest: false,
  });
  const login = await call("/auth/login", "", "POST", { email, password: "first-password-1" });
  return { email, userId: userDoc.id as string, cookies: login.cookies };
}

describe("Sign-up by mailed link", () => {
  it("answers the same whether or not the email is taken, and only the mailbox can finish", async () => {
    const taken = newEmail();
    await h.registerUser({ email: taken, password: "first-password-1", displayName: "First" });

    const fresh = newEmail();
    const a = await call("/auth/register", "", "POST", { email: fresh, password: "first-password-1", displayName: "New" });
    const b = await call("/auth/register", "", "POST", { email: taken, password: "other-password-2", displayName: "Again" });
    expect([a.status, b.status]).toEqual([202, 202]);
    expect(a.data).toEqual(b.data);
    expect(a.cookies).toBe(""); // nobody is signed in by step 1
    // The owner of the taken address hears about it; no second account.
    await h.mailTo(taken, "already have");

    const token = RealtimeHarness.linkToken(await h.mailTo(fresh, "Finish creating"));
    // The link alone isn't enough: whoever opens it must know the password chosen in step 1.
    const wrong = await call("/auth/register/complete", "", "POST", { token, password: "not-the-password" });
    expect(wrong.error?.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
    const done = await call<{ user: { emailVerified: boolean } }>("/auth/register/complete", "", "POST", {
      token,
      password: "first-password-1",
    });
    expect(done.status).toBe(201);
    expect(done.data.user.emailVerified).toBe(true);
    expect((await call("/auth/me", done.cookies)).status).toBe(200);
    // One account per link.
    const again = await call("/auth/register/complete", "", "POST", { token, password: "first-password-1" });
    expect(again.error?.code).toBe(ERROR_CODES.INVALID_LINK);
  });

  it("uses up a link after 5 wrong passwords", async () => {
    const email = newEmail();
    await call("/auth/register", "", "POST", { email, password: "first-password-1", displayName: "Guess" });
    const token = RealtimeHarness.linkToken(await h.mailTo(email, "Finish creating"));
    for (let n = 0; n < 5; n++) await call("/auth/register/complete", "", "POST", { token, password: `wrong-${n}` });
    const right = await call("/auth/register/complete", "", "POST", { token, password: "first-password-1" });
    expect(right.error?.code).toBe(ERROR_CODES.INVALID_LINK);
  });

  it("counts passwords sent in parallel too", async () => {
    const email = newEmail();
    await call("/auth/register", "", "POST", { email, password: "first-password-1", displayName: "Burst" });
    const token = RealtimeHarness.linkToken(await h.mailTo(email, "Finish creating"));
    const guesses = await Promise.all(
      Array.from({ length: 8 }, (_, n) => call("/auth/register/complete", "", "POST", { token, password: `wrong-${n}` })),
    );
    expect(guesses.filter((g) => g.error?.code === ERROR_CODES.INVALID_CREDENTIALS).length).toBeLessThanOrEqual(5);
    const right = await call("/auth/register/complete", "", "POST", { token, password: "first-password-1" });
    expect(right.error?.code).toBe(ERROR_CODES.INVALID_LINK);
  });

  it("never puts user-chosen text in mail to an address nobody has proven", async () => {
    const email = newEmail();
    await call("/auth/register", "", "POST", { displayName: "Visit evil.example now", email, password: "first-password-1" });
    const mail = await h.mailTo(email, "Finish creating");
    expect(`${mail.subject} ${mail.text}`).not.toContain("evil.example");
  });
});

describe("Email verification (accounts from before sign-up links)", () => {
  it("confirms the address once from the mailed link", async () => {
    const { email, cookies } = await legacyAccount();
    await call("/auth/verify-email/send", cookies, "POST");
    const token = RealtimeHarness.linkToken(await h.mailTo(email, "Confirm your email"));

    expect((await call("/auth/verify-email", "", "POST", { token })).status).toBe(200);
    const me = await call<{ user: { emailVerified: boolean } }>("/auth/me", cookies);
    expect(me.data.user.emailVerified).toBe(true);
    expect((await call("/auth/verify-email", "", "POST", { token })).error?.code).toBe(ERROR_CODES.INVALID_LINK);
    // Nothing left to resend.
    await call("/auth/verify-email/send", cookies, "POST");
    await settle();
    expect(mailsTo(email).filter((m) => m.subject.includes("Confirm"))).toHaveLength(1);
  });

  it("refuses made-up links", async () => {
    const res = await call("/auth/verify-email", "", "POST", { token: "x".repeat(43) });
    expect(res.error?.code).toBe(ERROR_CODES.INVALID_LINK);
  });

  it("keeps the password when Google signs in to an account its password holder verified while signed in", async () => {
    const { email, userId, cookies } = await legacyAccount();
    await call("/auth/verify-email/send", cookies, "POST");
    const token = RealtimeHarness.linkToken(await h.mailTo(email, "Confirm your email"));
    await call("/auth/verify-email", cookies, "POST", { token });

    const signedIn = await h.get(AuthService).loginOrRegisterWithGoogle({
      googleId: `g-${stamp()}`,
      email,
      displayName: "Legacy",
      avatarUrl: null,
    });
    expect(signedIn.user.id).toBe(userId);
    expect(signedIn.user.authMethods).toEqual(expect.arrayContaining(["password", "google"]));
    expect((await call("/auth/login", "", "POST", { email, password: "first-password-1" })).status).toBe(200);
  });

  it("takes over a pre-registered account whose link was opened by someone not signed in to it", async () => {
    const { email, userId, cookies } = await legacyAccount();
    await call("/auth/verify-email/send", cookies, "POST");
    const token = RealtimeHarness.linkToken(await h.mailTo(email, "Confirm your email"));
    expect((await call("/auth/verify-email", "", "POST", { token })).status).toBe(200);

    const signedIn = await h.get(AuthService).loginOrRegisterWithGoogle({
      googleId: `g-${stamp()}`,
      email,
      displayName: "Owner",
      avatarUrl: null,
    });
    expect(signedIn.user.id).toBe(userId);
    expect(signedIn.user.authMethods).toEqual(["google"]);
    expect((await call("/auth/login", "", "POST", { email, password: "first-password-1" })).status).toBe(401);
  });
});

describe("Password reset", () => {
  it("sets a new password from the mailed link and signs out every session", async () => {
    const email = newEmail();
    const { cookie } = await h.registerUser({ email, password: "first-password-1", displayName: "Mailer" });
    expect((await call("/auth/password/forgot", "", "POST", { email })).status).toBe(200);
    const token = RealtimeHarness.linkToken(await h.mailTo(email, "Reset"));

    expect((await call("/auth/password/reset", "", "POST", { token, password: "second-password-2" })).status).toBe(200);
    expect((await call("/auth/me", cookie)).status).toBe(401); // the old session ended
    expect((await call("/auth/login", "", "POST", { email, password: "first-password-1" })).status).toBe(401);
    expect((await call("/auth/login", "", "POST", { email, password: "second-password-2" })).status).toBe(200);
    // The link worked once.
    const again = await call("/auth/password/reset", "", "POST", { token, password: "third-password-3" });
    expect(again.error?.code).toBe(ERROR_CODES.INVALID_LINK);
  });

  it("answers the same for unknown emails, and mails one address only a few times an hour", async () => {
    const unknown = newEmail();
    expect((await call("/auth/password/forgot", "", "POST", { email: unknown })).status).toBe(200);
    await settle();
    expect(mailsTo(unknown)).toHaveLength(0);

    const email = newEmail();
    await h.registerUser({ email, password: "first-password-1", displayName: "Mailer" });
    const resets = () => mailsTo(email).filter((m) => m.subject.includes("Reset")).length;
    // One requester: 3 an hour.
    for (let n = 0; n < 4; n++) await call("/auth/password/forgot", "", "POST", { email }, "203.0.113.50");
    await settle();
    expect(resets()).toBe(3);
    // The address takes 10 an hour from everyone together...
    for (let n = 0; n < 7; n++) await call("/auth/password/forgot", "", "POST", { email }, `203.0.113.${60 + n}`);
    await settle();
    expect(resets()).toBe(10);
    // ...but someone asking again past that cap is refused,
    await call("/auth/password/forgot", "", "POST", { email }, "203.0.113.60");
    await settle();
    expect(resets()).toBe(10);
    // while first asks still get through, one per few minutes: a flood from many
    // addresses gets nowhere, yet can't use up the owner's way in ahead of time.
    for (let n = 0; n < 25; n++) await call("/auth/password/forgot", "", "POST", { email }, `198.51.100.${100 + n}`);
    await settle();
    expect(resets()).toBe(10);
    await h.redis().del(`auth:mail-budget:reset:${email}:first-ask-slot`); // the slot's minutes pass
    await call("/auth/password/forgot", "", "POST", { email }, "203.0.113.99");
    await settle();
    expect(resets()).toBe(11);
  });
});
