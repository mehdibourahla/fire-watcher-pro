import { describe, expect, it } from "vitest";
import { signupCredentials } from "./auth-flow";
import {
  authMode,
  callbackDestination,
  createRecoveryProof,
  passwordProblem,
} from "./auth-flow";

describe("authentication flow boundaries", () => {
  it("sends full_name consumed by ensure_profile_for_new_user without changing passwords", () => {
    const credentials = signupCredentials(
      " person@example.com ",
      " pass phrase ",
      " Mehdi ",
      "https://nadhir.app/auth",
    );
    expect(credentials.email).toBe("person@example.com");
    expect(credentials.password).toBe(" pass phrase ");
    expect(credentials.options.data).toEqual({ full_name: "Mehdi" });
    expect(credentials.options.emailRedirectTo).toBe("https://nadhir.app/auth");
  });
  it("rejects arbitrary modes and never forwards provider tokens", () => {
    expect(authMode("reset")).toBe("reset");
    expect(authMode("admin")).toBe("signin");
    expect(
      callbackDestination("/alerts", "access_token=secret&type=recovery"),
    ).toBe("/alerts");
    expect(callbackDestination("/alerts", "details")).toBe("/alerts#details");
  });
  it("requires a recovery event for the same validated user", () => {
    const proof = createRecoveryProof();
    expect(proof.allows("alice")).toBe(false);
    proof.observe("SIGNED_IN", "alice");
    expect(proof.allows("alice")).toBe(false);
    proof.observe("PASSWORD_RECOVERY", "alice");
    expect(proof.allows("alice")).toBe(true);
    expect(proof.allows("bob")).toBe(false);
    proof.observe("SIGNED_OUT", null);
    expect(proof.allows("alice")).toBe(false);
  });
  it("invalidates recovery when the active identity changes or it is consumed", () => {
    const proof = createRecoveryProof();
    proof.observe("PASSWORD_RECOVERY", "alice");
    proof.observe("SIGNED_IN", "bob");
    expect(proof.allows("alice")).toBe(false);
    proof.observe("PASSWORD_RECOVERY", "bob");
    proof.clear();
    expect(proof.allows("bob")).toBe(false);
  });
  it("enforces new password requirements without imposing them on old signins", () => {
    expect(passwordProblem("12345678", "12345678")).toBe(null);
    expect(passwordProblem("123456", "123456")).toBe("authKit.passwordShort");
    expect(passwordProblem("12345678", "87654321")).toBe(
      "authKit.passwordMismatch",
    );
  });
});
