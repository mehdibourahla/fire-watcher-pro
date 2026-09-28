# Current Commune is resolved on the device

Background location serves one purpose: follow the commune the phone is in, so Broadcast
Alerts reach a person where they are. The phone resolves its position against a bundled
commune outline file and subscribes itself to that commune's FCM topic through the native
Firebase SDK. No coordinate and no commune code is sent to Nadhir — not even through the
topic-subscribe endpoint the web app uses — so the server cannot learn where anyone is.

## Considered Options

- **Send coordinates to the server for radius alerts** ("fire within 10 km of you"). Rejected:
  it makes Nadhir a location-tracking system, contradicts the Subscription's no-personal-data
  rule, and is exactly what store review scrutinises for background location. Commune
  granularity is what Broadcast Alerts already target (ADR-0004).

## Consequences

Location is sampled coarsely (iOS significant-change, Android low-power updates): a commune is
kilometres wide, so GPS precision buys nothing but battery drain and review friction. The
commune outline file ships with the app and is refreshed with app releases or the Survival
Pack; a stale outline can only misplace someone near a commune border, which the neighbouring
commune's ring targeting already covers.
