# No evacuation routing until spread prediction and live road status both exist

Nadhir does not compute or display evacuation routes — not as a v2, but until two gates
pass: a fire-spread model with demonstrated predictive skill, and live road status from
authorities. A fire overlay on OSM routing looks like the obvious feature and is the
dangerous one: a road can be geometrically open yet burning by arrival, and hours-stale
detections make the overlay confidently wrong. Until both gates pass, the app shows
observed fire with its age, Open Areas as unrouted map facts, and Standing Guidance —
the user routes, informed. Reject any PR adding "navigation with a fire layer"; it
reopens this decision, it does not implement it.
