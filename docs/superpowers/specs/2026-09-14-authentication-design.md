# Authentication experience

Nadhir keeps maps and Survival available to everyone. Accounts add personal zones, alert preferences and role-controlled administration. This milestone makes identity visible and completes email/password and Google entry, verification and recovery within the existing Supabase session model.

## Experience

Signed-out headers offer Sign in. Signed-in headers show an initial and name, with email, account navigation and sign out in the dropdown. Mobile and desktop share the same actions. Settings identifies the account and its sign-in methods and offers password recovery.

The existing `/auth` route contains sign-in, signup, forgotten-password, verification and new-password states. Google precedes the email form. New passwords require eight characters and confirmation; existing passwords retain compatibility. Every asynchronous action has pending, error and success feedback. Resends have a cooldown. Recovery requests do not reveal whether an address exists. Links preserve the validated internal destination, never authentication tokens.

Only a verified recovery session enables new-password entry. Expired, reused or invalid links offer a fresh recovery request. OAuth cancellation returns a usable sign-in screen. Successful authentication returns to the requested private page. Successful sign-out clears private cached data and returns home.

## Visual references

- [Outseta login](https://mobbin.com/screens/151353e9-b560-478a-8e27-95a16e71610a): Google, divider, email/password, visibility and recovery.
- [GitBook recovery](https://mobbin.com/flows/efe62bb2-dbee-40fe-9b34-58fb7794b891): dedicated new-password and confirmation form.
- [Grok account](https://mobbin.com/screens/0a385c2f-c64e-428e-9f96-1242851a5910): visible identity and sign-in methods.

Adapt these patterns to Nadhir's colors and typography. Use 44px controls, 16px form inputs, keyboard focus, live feedback and RTL-compatible layout. Supply English, French and Arabic copy with key parity for the existing unreviewed Kabyle locale.

## Operations and verification

Google must be configured in Supabase and the Google Auth Platform before it is reported operational. Production recovery needs a configured email sender. Verify those separately from UI implementation; no credentials belong in code or logs. Test real local Supabase sessions, recovery transitions, invalid links, private return paths, mobile layout and account-menu updates. Run CI checks and independent security review before presenting the PR.
