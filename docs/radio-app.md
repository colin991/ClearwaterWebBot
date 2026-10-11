# Clearwater Radio (Windows app + radio bot)

A push-to-talk radio overlay for Windows that talks through a second Discord bot.

## Pieces

- `radio-app/`: Electron app. Frameless, always on top, styled like a handheld radio.
- `utils/radioBot.js`: the second bot. No commands. Logs in with `RADIO_BOT_TOKEN`, joins voice channel `1514128904783139018`, and rejoins if it is dropped or moved.
- `utils/radioRelay.js`: WebSocket relay at `/radio`. Apps send Opus audio while PTT is held; the bot plays it in the channel. Everyone talking in the channel (Discord users and other apps) is sent back to every app.
- `utils/radioDownloadPanel.js`: the main bot keeps a download embed in channel `1514190592005902336` with a **Download for Windows** link.
- `.github/workflows/radio-app.yml`: builds the installer on Windows. Every push to `main` that changes `radio-app/` publishes release `radio-v1.0.<run>`; installed apps download it and restart on the new version by themselves.

## Access

Members sign in with Discord from the radio (center button, or MENU → SETUP → ACCOUNT). The app opens Discord in the browser and catches the redirect on `http://127.0.0.1:53682/callback`; the relay exchanges the code with the client secret, checks the member, and hands back a signed token the app keeps. Only members of the Clearwater server who can view and connect to the radio channel get in. Every 5 minutes the relay re-checks everyone on the radio; anyone who left the server or lost access is disconnected, signed out, and their app closes. Only one person can transmit at a time; others get a busy tone.

## Radio controls

- **PTT**: hold the bound key or mouse button (works while a game is focused), or hold the PTT strip on the left edge.
- **VOL** knob: drag up/down or scroll. On the home screen the d-pad also changes volume.
- **Red headset button**: deafen yourself (stops incoming audio).
- **Gray left button**: MENU with `VOL` (listening volume), `TX VOL` (how loud you are on the radio), `MIC`, `LISTEN` (speakers or headset you hear the radio on), `PTT`, `CHANNEL`, `FX` (listening effect RADIO/POLICE/OFF; RADIO by default and never applied to what you send) and `SETUP` (`TEST` to hear your own radio voice, `ACCOUNT` to sign in or out with Discord, `UPDATE`). D-pad up/down picks a row, left/right changes VOL and FX, and the center button selects (or opens the menu from the home screen). From any menu or setup page the gray left button goes straight back to the radio screen. Device names show in full.
- `#` selects, `*` goes back. **QUIT** shuts the app off (installing a downloaded update first). The app checks for updates on launch, when reopened, and every 10 minutes; `%APPDATA%\Clearwater Radio\update.log` records any update error.

## Host setup

See `.env.example` (`RADIO_BOT_TOKEN`, `RADIO_PUBLIC_URL`, optional `RADIO_PORT`, and `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` or `RADIO_OAUTH_CLIENT_ID` + `RADIO_OAUTH_CLIENT_SECRET` for sign-in). Add `http://127.0.0.1:53682/callback` as an OAuth2 redirect on that Discord application. The radio bot needs View Channel, Connect, and Speak in the radio channel. The app connects to `ws://216.173.77.2:8102/radio` (`DEFAULT_RELAY_URL` in `radio-app/main.js`).
