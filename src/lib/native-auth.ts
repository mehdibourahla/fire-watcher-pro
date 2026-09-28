import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

type NativeAuthPlugin = {
  browse(options: { url: string }): Promise<{ url: string }>;
  apple(options: {
    nonce: string;
  }): Promise<{ idToken: string; givenName?: string; familyName?: string }>;
};

const NativeAuth = registerPlugin<NativeAuthPlugin>("NativeAuth");
const CALLBACK = "app.nadhir://auth/callback";

export const appleSignInAvailable = () => Capacitor.getPlatform() === "ios";

export function signInCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "cancelled"
  );
}

// Google refuses OAuth inside a WebView, so the page opens in the system sign-in browser
export async function nativeGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: CALLBACK, skipBrowserRedirect: true },
  });
  if (error) throw error;
  const { url } = await NativeAuth.browse({ url: data.url });
  const params = new URL(url).searchParams;
  const code = params.get("code");
  if (!code)
    throw new Error(params.get("error_description") ?? "oauth_no_code");
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

export async function nativeApple(): Promise<void> {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const { idToken, givenName, familyName } = await NativeAuth.apple({ nonce });
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: idToken,
    nonce,
  });
  if (error) throw error;
  // Apple shares the name only on the first authorization
  const fullName = [givenName, familyName].filter(Boolean).join(" ");
  if (fullName) {
    const { error: nameError } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });
    if (nameError) throw nameError;
  }
}
