# Clearwater Radio (Windows app + radio bot)

A push-to-talk radio overlay for Windows that talks through a second Discord bot.

## Pieces

- `radio-app/`: Electron app. Frameless, always on top, styled like a handheld radio.
- `utils/radioBot.js`: the second bot. No commands. Logs in with `RADIO_BOT_TOKEN`, joins voice channel `1514128904783139018`, and rejoins if it is dropped or moved.
- `utils/radioRelay.js`: WebSocket relay at `/radio`. Apps send Opus audio while PTT is held; the bot plays it in the channel. Everyone talking in the channel (Discord users and other apps) is sent back to every app.
- `utils/radioDownloadPanel.js`: the main bot keeps a download embed in channel `1514190592005902336` with a **Download for Windows** link.
- `.github/workflows/radio-app.yml`: builds the installer on Windows. Every push to `main` that changes `radio-app/` publishes release `radio-v1.0.<run>`; installed apps download it and restart on the new version by themselves.

## Access

When the radio opens without a sign-in (first launch, or an expired or revoked one) it opens Discord sign-in in the browser by itself; if that window is closed, OK tries again (or MENU → SETUP → ACCOUNT). The app opens Discord in the browser and catches the redirect on `http://127.0.0.1:53682/callback`; the relay exchanges the code with the client secret, checks the member, and hands back a signed token the app keeps. Only members of the Clearwater server who can view and connect to the radio channel get in. Every 5 minutes the relay re-checks everyone on the radio; anyone who left the server or lost access is disconnected, signed out, and their app closes. Only one radio can transmit at a time on each channel; others get a busy tone.

## Radio controls

The radio looks like a handheld: volume and channel knobs on top, a color screen (zone, channel, date and time, and the units on your channel), a settings (gear) key and a home key, a navigation ring with OK and back, and a lettered keypad.

- **PTT**: hold the bound key or mouse button (works while a game is focused), or hold the long PTT bar on the left edge.
- **VOL** knob: drag up/down or scroll. On the home screen the navigation ring also changes volume.
- **CH** knob: click to switch channel. CH 1 is the Discord radio channel; CH 2 is **Special Response Team** and CH 3 is **Frequency Change**; both are radio-to-radio only and never reach Discord (they work even when the bot is out of voice). The radio remembers your last channel.
- **Red side button** (under PTT): deafen yourself (stops incoming audio).
- **Gear key** (top left of the keys, was P1): SETTINGS with `VOL` (listening volume), `TX VOL` (how loud you are on the radio), `MIC`, `LISTEN` (speakers or headset you hear the radio on), `PTT`, `CHANNEL`, `WHO` (everyone on each channel, app radios and the Discord radio voice channel together, marked APP, DISCORD VC or APP + VC), `FX` (listening effect RADIO/POLICE/OFF; RADIO by default and never applied to what you send) and `SETUP` (`TEST` to hear your own radio voice, `ACCOUNT` to sign in or out with Discord, `UPDATE`). Up/down picks a row, left/right changes VOL, CHANNEL and FX, and OK selects (or opens the menu from the home screen). From any settings page the gear key goes straight back to the radio screen. Device names show in full.
- **Home key** (was P2): back to the radio screen from anywhere. On the radio screen it opens the full list of units on every channel (the same list as SETTINGS → WHO). The radio screen itself lists the units on your channel, marked APP, VC or APP+VC.
- **One voice at a time**: only one radio can transmit per channel (the radio shows `BUSY` and their name). Talking in the Discord radio channel does not block the radios.
- **In the Discord channel**: if you are already sitting in the Discord radio voice channel, your app mutes itself (`IN VC` on the screen) so you don't hear everything twice, and push-to-talk does nothing (it shows `IN DISCORD VC`), so you talk in Discord instead. If you join mid-transmission, it stops. It all turns back on when you leave or switch channels. Nothing changes in Discord.
- **Panic**: press the blue **EMER** button on the radio, or type `;panic [location]` in game chat. Every signed-in radio flashes red for 10 seconds with who it is and where, plays the panic sound twice (`radio-app/renderer/panic-sound.js`), and a voice says "<unit> panic at postal <postal>" (Windows' built-in text to speech, on the radios only, never in Discord). The unit number is the player's ER:LC callsign, or for EMER a number at the start of their Discord nickname ("1A-12 | Name"); without one the voice says their name. Without a typed location the bot looks the player up in the live ER:LC player list (EMER uses the member's linked Roblox account or their Discord name) and shows their street or postal. One EMER press per radio every 15 seconds. ER:LC events or emergency calls marked as a panic also trigger it; ER:LC's public API has no panic-button event. The bot logs `Radio: panic from …` or `Radio: EMER from …` each time.
- **POWER** (SETTINGS row after FX): `AUTO` (default) runs in low power on PCs with 4 or fewer CPU cores or 4 GB or less memory, `LOW` always, `FULL` never. Low power uses a lighter Opus encoder and no listening-effect oversampling, and updates the mic lamp less often. In every mode the listening effect and its static only run while they can be heard.
- **Auto-close**: if nobody presses PTT or touches the radio for 20 minutes, it shows `CLOSING IN 60s` and then shuts off; any key keeps it on.
- `#` and OK select, `*` and the back key go back. **QUIT** shuts the app off (installing a downloaded update first). The app checks for updates on launch, when reopened, and every 10 minutes; `%APPDATA%\Clearwater Radio\update.log` records any update error.

## Web radio (phones)

`cwpcso.com/radio` (`radio.html`, `radio-web.js`, `radio-web.css`) is the same radio in a browser, with Clearwater branding: channel buttons, a big hold-to-talk button (Space on a keyboard), EMER, volume, mute and the units on your channel. Sign-in is the website's Discord sign-in. Clearwater members who don't have website access get a radio-only cookie that opens nothing else on the site. The page asks `/api/bot/radio` for a radio key; that asks the bot (`/api/radio/web-session`), which returns a key and the relay's secure address. The relay checks Clearwater membership as usual, and one radio per member still applies, so signing in on a phone signs the desktop app out.

HTTPS pages can't use the relay's plain `ws://` address, so the bot starts a free Cloudflare quick tunnel to its own port on boot (`utils/radioTunnel.js` downloads `cloudflared` into `data/bin`) and hands out its `wss://` address. The address changes when the bot restarts; the website always asks for the current one. Set `RADIO_WEB_URL=wss://…/radio` to use your own HTTPS domain instead, or `RADIO_WEB_TUNNEL=off` to turn it off. The page needs WebCodecs audio: current Chrome, Edge, Android browsers and Safari on iOS 26 or newer. Keep the page open on a phone; it reconnects when you come back to it.

## Host setup

See `.env.example` (`RADIO_BOT_TOKEN`, `RADIO_PUBLIC_URL`, optional `RADIO_PORT`, and `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` or `RADIO_OAUTH_CLIENT_ID` + `RADIO_OAUTH_CLIENT_SECRET` for sign-in). Add `http://127.0.0.1:53682/callback` as an OAuth2 redirect on that Discord application. The radio bot needs View Channel, Connect, and Speak in the radio channel. The app connects to `ws://216.173.77.2:8102/radio` (`DEFAULT_RELAY_URL` in `radio-app/main.js`).
