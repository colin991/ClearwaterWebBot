# ER:LC event relay

Set the game's **Events Webhook** to:

`https://www.cwpcso.com/api/erlc/events`

Restart the bot after updating it. The website must already have `BOT_API_URL`
and `BOT_API_KEY`, matching the bot's `BOT_API_KEY` and HTTP port. No ER:LC API
key or Melonly API key is needed for webhook signature verification.

## Delivery

1. The public endpoint verifies ER:LC's Ed25519 signature over the timestamp
   plus the exact request bytes, checks a five-minute freshness window and size,
   and forwards the bytes to the authenticated bot receiver.
2. The bot verifies again and atomically persists the event to
   `data/erlc-events.json` before returning acceptance.
3. The bot emits `erlcEvent(payload, eventId)` for local integrations, and sends
   the original bytes and original signature headers to Melonly's events receiver
   (`https://erlc-wh.melon.ly/`, which is where `https://melon.ly/events` redirects).
4. In-game `;` commands drag the player to an empty numbered Discord VC:
   `;ss` Mod Scene, `;ts` Traffic Stop, `;scene` Scene, `;fc` Frequency Change,
   `;civ` Civilian. Anyone else in-game within 50 studs who is already in a
   Discord VC is dragged into that same channel. If most of that group is
   already in a matching numbered VC, keep that channel and only move people
   who are not in it yet. `;team` moves Fire / Police-Sheriff / DOT to their
   team VCs and does nothing on other teams. The player must already be in a
   Discord VC. Every `;` command attempt is logged to channel `1514547037537046688`,
   including failures and the reason (not in VC, unlinked, no empty scene channel, unknown command, etc.).
5. In-game emergency calls on Police/Sheriff, Fire, or DOT speak a dispatch
   line in that team's radio channel. See `docs/erlc-call-radio.md`.
6. Failed deliveries stay queued through restarts. A worker retries every five
   seconds when eligible, using exponential backoff and Melonly's Retry-After.

The queue holds up to 128 undelivered events and the last 100 completed events.
Exact repeat requests in the retained inbox are deduplicated. Network ambiguity
can still cause duplicate downstream delivery; consumers should use event IDs.
The authenticated bot GET route returns the latest 20 records and delivery status.
The public GET route exposes only readiness and the pending count, never event
contents or credentials. Preserve `data/` when updating the bot.

## Verification

Open the public URL: `ready: true` means the website reaches the updated receiver.
Save that URL in the game, generate a real emergency call, and validate Melonly.
Its successful ingestion must be verified with a real game event; locally signed
test fixtures deliberately cannot authenticate to production.

If the bot is offline or its disk cannot save events, the relay returns 503 rather
than falsely acknowledging them. ER:LC does not document a delivery retry
guarantee, so keep the bot online. This path cannot bypass Melonly's policies or
signature-age limits: older queued events may be rejected by Melonly. Inspect
`lastStatus` and `attempts` in the protected inbox if validation remains pending.

Source: https://apidocs.erlc.gg/event-webhooks
