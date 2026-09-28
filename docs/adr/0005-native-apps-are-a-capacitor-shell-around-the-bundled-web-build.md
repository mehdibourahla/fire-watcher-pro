# Native apps are a Capacitor shell around the bundled web build

The Android and iOS apps exist for what the PWA cannot do reliably: alerts that arrive (iOS web
push needs a home-screen install almost nobody does; Android needs a high-importance channel),
a Survival Pack the OS will not evict, Current Commune from background location, and presence
in the stores. They are the same React code as the web app, built in TanStack Start SPA mode and
shipped inside a Capacitor shell, with native plugins for push, location and storage. The app
calls https://nadhir.app and Supabase remotely; nothing it needs to open is fetched at launch.

## Considered Options

- **Expo / React Native rewrite** (the original spec's choice). Rejected: a second UI in four
  languages with RTL, maintained by one person, would drift from the web app within weeks —
  and Survival Mode's wording rules would have to be enforced twice.
- **Capacitor pointing at the live URL.** Rejected: it cannot open with no network, which breaks
  Survival Mode's zero-fresh-data rule, and Apple rejects thin web wrappers.

## Consequences

Web code must not assume it is served by the Start server: server functions, relative `/api`
calls and the session cookie all need a native path. Background work that must run while the
WebView is not alive (Current Commune) is written natively, in Swift and Kotlin, not in React.
