# Why URL Shorteners Exist

A URL shortener maps a long destination URL to a short, opaque code and
redirects visitors from the short form to the original. The mechanism is
trivial; the reasons it's worth building a service around it are not.

## The core problem

Long URLs are hostile to constrained mediums: SMS, print, verbal
communication, QR codes, character-limited social posts. They're also opaque
to click measurement — a raw link gives no visibility into who clicked, when,
or from where, unless that tracking is built in at the destination.

A shortener solves both problems in one primitive: it gives you a short,
shareable handle, and because every click passes through your own redirect
endpoint first, you get a measurement point for free.

## Real-world use case

Marketing and growth teams are the primary consumers. A campaign runs the
same destination page across email, SMS, paid social, and print — each
channel gets its own short link, and click volume per channel becomes
directly comparable without touching the destination page at all. This is
the scenario the platform in this repository is designed around: multiple
organizations (tenants), each running their own campaigns, needing
per-tenant link management and analytics without visibility into each
other's data.

## Why not just use a public shortener

Public services (bit.ly and similar) work fine for individual use, but
break down at the point an organization needs:

- Custom domains and branded short links
- Programmatic link creation via API rather than a web form
- Analytics data it owns and can query directly, rather than exporting from
  a third party
- Access control — who on the team can create, edit, or view analytics for
  which links

Once those requirements exist, the shortener stops being a utility and
becomes internal infrastructure — which is the case for a platform serving
multiple tenants, each wanting the same guarantees independently.
