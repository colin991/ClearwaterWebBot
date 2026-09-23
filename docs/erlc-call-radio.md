# ER:LC call radio

When an in-game emergency call starts, the bot joins that team's radio and speaks a short dispatch line. Other call types are ignored.

## Channels

- **LEO** (Police / Sheriff): `1514128904783139018`
- **Fire:** `1514128961951760515`
- **DOT:** `1514130037052407932`

## What gets announced

**LEO**

- Server cash-register, house, and ATM robberies: beep, then `{call} reported by {roblox user} at {location} nearby units please attach.`
- 911 calls: beep, then `{caller input} reported at {location} any nearby units please attach.`

**Fire**

- Structure fires: FD tone, then attention station 48 / engine-ladder-medic 48.
- 911 calls: FD tone, then `{caller input} reported at {location} available apparatus please attach.`

**DOT**

- Every in-game call: `{call input} reported at {location} nearby trucks please respond.` (no tone)

The LEO beep is `assets/priority-beep.mp3` (same as priority start). The FD tone is `assets/fd-tone.ogg`. Speech is Edge Guy at 1.15x.

Calls are read from the ER:LC event webhook and from `EmergencyCalls` on the regular server snapshot. Existing calls at bot start are not replayed. Restart the bot host after deploying.
