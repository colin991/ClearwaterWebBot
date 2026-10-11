# Clearwater Radio (Windows app + radio bot)

A push-to-talk radio overlay for Windows that talks through a second Discord bot.

## Pieces

- `radio-app/`: Electron app. Frameless, always on top, styled like a handheld radio.
- `utils/radioBot.js`: the second bot. No commands. Logs in with `RADIO_BOT_TOKEN`, joins voice channel `1514128904783139018`, and rejoins if it is dropped or moved.
- `utils/radioRelay.js`: WebSocket relay at `/radio`. Apps send Opus audio while PTT is held; the bot plays it in the channel. Everyone talking in the channel (Discord users and other apps) is sent back to every app.
- `utils/radioDownloadPanel.js`: the main bot keeps a download embed in channel `1514190592005902336` with a **Download for Windows** link.
- `.github/workflows/radio-app.yml`: builds the installer on Windows. Every push to `main` that changes `radio-app/` publishes release `radio-v1.0.<run>`; installed apps download it and restart on the new version by themselves.

## Access

Members sign in with Discord from the radio (center button, or MENU → SETUP → ACCOUNT). The app opens Discord in the browser and catches the redirect on `http://127.0.0.1:53682/callback`; the relay exchanges the code with the client secret, checks the member, and hands back a signed token the app keeps. Only members of the Clearwater server who can view and connect to the radio channel get in. Every 5 minutes the relay re-checks everyone on the radio; anyone who left the server or lost access is disconnected, signed out, and their app closes. Only one radio can transmit at a time on each channel; others get a busy tone.

## Radio controls

The radio looks like a handheld: volume and channel knobs on top, a color screen (zone, channel, date and time, latest message), P1/P2 keys, a navigation ring with OK and back, and a lettered keypad.

- **PTT**: hold the bound key or mouse button (works while a game is focused), or hold the long PTT bar on the left edge.
- **VOL** knob: drag up/down or scroll. On the home screen the navigation ring also changes volume.
- **CH** knob: click to switch channel. CH 1 is the Discord radio channel; CH 2 is **Special Response Team** and CH 3 is **Frequency Change**; both are radio-to-radio only and never reach Discord (they work even when the bot is out of voice). The radio remembers your last channel.
- **Red side button** (under PTT): deafen yourself (stops incoming audio).
- **P1**: MENU with `VOL` (listening volume), `TX VOL` (how loud you are on the radio), `MIC`, `LISTEN` (speakers or headset you hear the radio on), `PTT`, `CHANNEL`, `MSGS`, `FX` (listening effect RADIO/POLICE/OFF; RADIO by default and never applied to what you send) and `SETUP` (`TEST` to hear your own radio voice, `ACCOUNT` to sign in or out with Discord, `UPDATE`). Up/down picks a row, left/right changes VOL, CHANNEL and FX, and OK selects (or opens the menu from the home screen). From any menu page P1 goes straight back to the radio screen. Device names show in full.
- **P2**: MESSAGES. Text messages go to everyone on your current channel; the newest shows on the home screen for 2 minutes. `+ NEW MESSAGE` offers quick replies (10-4, COPY, EN ROUTE, ON SCENE, NEED BACKUP, CODE 4, STANDBY) or `TYPE A MESSAGE` to type on your keyboard (Enter sends, Esc cancels; on the keypad 0 is a space, `*` deletes and `#` sends). Messages are up to 140 characters and are not saved after the app closes.
- **One voice at a time**: only one radio can transmit per channel (the radio shows `BUSY` and their name). Talking in the Discord radio channel does not block the radios.
- **In the Discord channel**: if you are already sitting in the Discord radio voice channel, your app mutes itself (`IN VC` on the screen) so you don't hear everything twice. It turns back on when you leave or switch channels. Nothing changes in Discord.
- **Panic**: press the blue **EMER** button on the radio, or type `;panic [location]` in game chat. Every signed-in radio flashes red for 10 seconds with who it is and where, and plays the panic sound twice (`radio-app/renderer/panic-sound.js`). Without a typed location the bot looks the player up in the live ER:LC player list (EMER uses the member's linked Roblox account or their Discord name) and shows their street or postal. One EMER press per radio every 15 seconds. ER:LC events or emergency calls marked as a panic also trigger it; ER:LC's public API has no panic-button event. The bot logs `Radio: panic from …` or `Radio: EMER from …` each time.
- `#` and OK select, `*` and the back key go back. **QUIT** shuts the app off (installing a downloaded update first). The app checks for updates on launch, when reopened, and every 10 minutes; `%APPDATA%\Clearwater Radio\update.log` records any update error.

## Host setup

See `.env.example` (`RADIO_BOT_TOKEN`, `RADIO_PUBLIC_URL`, optional `RADIO_PORT`, and `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` or `RADIO_OAUTH_CLIENT_ID` + `RADIO_OAUTH_CLIENT_SECRET` for sign-in). Add `http://127.0.0.1:53682/callback` as an OAuth2 redirect on that Discord application. The radio bot needs View Channel, Connect, and Speak in the radio channel. The app connects to `ws://216.173.77.2:8102/radio` (`DEFAULT_RELAY_URL` in `radio-app/main.js`).
