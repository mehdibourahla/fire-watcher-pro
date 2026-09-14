import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const baseUrl = new URL(process.env.SUPABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(baseUrl.hostname) ||
  !["http:", "https:"].includes(baseUrl.protocol) ||
  baseUrl.username ||
  baseUrl.password
)
  throw new Error("Auth integration requires a loopback Supabase URL");

const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!anonKey || !serviceKey)
  throw new Error("Local auth test keys are missing");

const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const target = new URL(
        input instanceof Request ? input.url : String(input),
      );
      if (target.origin !== baseUrl.origin)
        throw new Error("Nonlocal auth request refused");
      return fetch(input, { ...init, redirect: "error" });
    },
  },
};
const admin = createClient(baseUrl.href, serviceKey, options);
const clients: SupabaseClient[] = [];
const fixtureIds = new Set<string>();
const passed: string[] = [];
let stage = "initialization";

function client() {
  const result = createClient(baseUrl.href, anonKey!, options);
  clients.push(result);
  return result;
}

function requireResult(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function pass(label: string) {
  passed.push(label);
  console.log(`PASS ${label}`);
}

let failed = false;
try {
  const email = `auth-kit-${crypto.randomUUID()}@example.test`;
  const password = `${crypto.randomUUID()}Aa9!`;
  const newPassword = `${crypto.randomUUID()}Bb8!`;
  stage = "public signup";
  const signupClient = client();
  const signup = await signupClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: "Local authentication fixture" } },
  });
  if (signup.data.user?.id) fixtureIds.add(signup.data.user.id);
  requireResult(!signup.error && signup.data.user, stage);
  const userId = signup.data.user.id;
  pass(stage);

  stage = "password signin and email identity";
  const loginClient = client();
  const login = await loginClient.auth.signInWithPassword({ email, password });
  requireResult(
    !login.error && login.data.session && login.data.user?.id === userId,
    stage,
  );
  const identities = await loginClient.auth.getUserIdentities();
  requireResult(
    !identities.error &&
      identities.data?.identities.some(
        (identity) =>
          identity.provider === "email" && identity.user_id === userId,
      ),
    stage,
  );
  pass(stage);

  stage = "signup token verification";
  const confirmation = await admin.auth.admin.generateLink({
    type: "signup",
    email: `auth-kit-confirm-${crypto.randomUUID()}@example.test`,
    password,
  });
  if (confirmation.data.user?.id) fixtureIds.add(confirmation.data.user.id);
  requireResult(
    !confirmation.error &&
      confirmation.data.properties &&
      confirmation.data.user,
    stage,
  );
  const confirmed = await client().auth.verifyOtp({
    token_hash: confirmation.data.properties.hashed_token,
    type: "signup",
  });
  requireResult(
    !confirmed.error &&
      confirmed.data.session &&
      confirmed.data.user?.id === confirmation.data.user.id,
    stage,
  );
  pass(stage);

  stage = "recovery token and recovery event";
  const recovery = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  requireResult(!recovery.error && recovery.data.properties, stage);
  const recoveryClient = client();
  let recoveryEvent = false;
  const subscription = recoveryClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recoveryEvent = true;
  });
  const recovered = await recoveryClient.auth.verifyOtp({
    token_hash: recovery.data.properties.hashed_token,
    type: "recovery",
  });
  subscription.data.subscription.unsubscribe();
  requireResult(
    !recovered.error &&
      recovered.data.session &&
      recovered.data.user?.id === userId &&
      recoveryEvent,
    stage,
  );
  pass(stage);

  stage = "replayed recovery token rejected";
  const replay = await client().auth.verifyOtp({
    token_hash: recovery.data.properties.hashed_token,
    type: "recovery",
  });
  requireResult(replay.error && !replay.data.session, stage);
  pass(stage);

  stage = "invalid recovery token rejected";
  const invalid = await client().auth.verifyOtp({
    token_hash: crypto.randomUUID().replaceAll("-", ""),
    type: "recovery",
  });
  requireResult(invalid.error && !invalid.data.session, stage);
  pass(stage);

  stage = "weak new password rejected";
  const weak = await recoveryClient.auth.updateUser({ password: "x" });
  requireResult(weak.error, stage);
  pass(stage);

  stage = "new password saved";
  const updated = await recoveryClient.auth.updateUser({
    password: newPassword,
  });
  requireResult(!updated.error && updated.data.user?.id === userId, stage);
  pass(stage);

  stage = "old password rejected after recovery";
  const oldLogin = await client().auth.signInWithPassword({ email, password });
  requireResult(oldLogin.error && !oldLogin.data.session, stage);
  pass(stage);

  stage = "new password signin and signout";
  const newClient = client();
  const newLogin = await newClient.auth.signInWithPassword({
    email,
    password: newPassword,
  });
  requireResult(!newLogin.error && newLogin.data.user?.id === userId, stage);
  const signedOut = await newClient.auth.signOut();
  requireResult(!signedOut.error, stage);
  const session = await newClient.auth.getSession();
  requireResult(!session.error && !session.data.session, stage);
  pass(stage);
} catch {
  failed = true;
  console.error(`FAIL ${stage}; sensitive server details omitted`);
} finally {
  for (const sessionClient of clients) {
    const signedOut = await sessionClient.auth.signOut().catch(() => null);
    if (!signedOut || signedOut.error) {
      failed = true;
      console.error("FAIL session cleanup");
    }
  }
  for (const id of fixtureIds) {
    const removed = await admin.auth.admin.deleteUser(id).catch(() => null);
    if (!removed || removed.error) {
      failed = true;
      console.error("FAIL fixture cleanup");
      continue;
    }
    const absent = await admin.auth.admin.getUserById(id).catch(() => null);
    if (!absent?.error || absent.data.user) {
      failed = true;
      console.error("FAIL fixture deletion verification");
    }
  }
  if (!failed)
    console.log(
      `PASS fixture cleanup (${fixtureIds.size} created accounts removed)`,
    );
}

console.log(
  `Auth integration: ${passed.length} checks passed; ${failed ? "FAILED" : "PASSED"}.`,
);
console.log(
  "Limitations: local auth only; admin-generated tokens bypass SMTP. Email delivery, Google OAuth, browser callbacks and password confirmation UI are not covered.",
);
process.exitCode = failed ? 1 : 0;
