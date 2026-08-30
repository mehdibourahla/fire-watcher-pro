# Broadcast Alerts fan out at the platform, not at the origin

Mass alerting (the AMBER epic) needs to reach every subscriber of an area within
seconds. Real alerting systems (WEA/EU-Alert, FCM/APNs topics) publish one message
per area and let the distribution network fan out; the origin never loops over
recipients. We adopted that: one Broadcast Alert = one CAP object → one FCM send
per affected commune-and-language topic (`v1.commune.<code>.<lang>`) plus one
message per wilaya Telegram channel (coarser by design — channel membership is
not a Subscription). Clients cannot join FCM topics directly: the client obtains
a registration token and a thin backend endpoint proxies topic subscribe and
unsubscribe through the FCM Admin API, re-called by the client on token refresh;
the server stores nothing durable per subscriber — FCM holds the topic mapping. The same topics serve the future native mobile apps unchanged, which is
the main reason FCM won over raw Web Push/VAPID. Per-recipient delivery queues are
deferred until channels that inherently need them (SMS, email).

Trade-off accepted: Google's FCM becomes the delivery spine of a civil-safety
tool. Mitigations: every channel renders the CAP object so channels are swappable,
Telegram is an independent second spine, and a VAPID path can be added behind the
same publish step if FCM ever becomes unacceptable.
