# Clearwater Radio (Windows app + radio bot)

A push-to-talk radio overlay for Windows that talks through a second Discord bot.

## Pieces

- `radio-app/`: Electron app. Frameless, always on top, styled like a handheld radio.
- `utils/radioBot.js`: the second bot. No commands. Logs in with `RADIO_BOT_TOKEN`, joins voice channel `1514128904783139018`, and rejoins if it is dropped or moved.
- `utils/radioRelay.js`: WebSocket relay at `/radio`. Apps send Opus audio while PTT is held; the bot plays it in the channel. Everyone talking in the channel (Discord users and other apps) is sent back to every app.
- `utils/radioDownloadPanel.js`: the main bot keeps a download embed in channel `1514190592005902336` with a **Download for Windows** link and a **Get my radio key** button.
- `.github/workflows/radio-app.yml`: builds the installer on Windows. Every push to `main` that changes `radio-app/` publishes release `radio-v1.0.<run>`; installed apps download it and restart on the new version by themselves.

## Access

The **Get my radio key** button gives a member a personal key (relay address + signed Discord ID). The relay only lets them in if they are in the server and can view and connect to the radio channel. Only one person can transmit at a time; others get a busy tone.

## Radio controls

- **PTT**: hold the bound key or mouse button (works while a game is focused), or hold the PTT strip on the left edge.
- **VOL** knob: drag up/down or scroll. On the home screen the d-pad also changes volume.
- **Red headset button**: deafen yourself (stops incoming audio).
- **Gray left button**: MENU with `VOL`, `MIC`, `PTT`, `CHANNEL`, `FX` (radio effect LIGHT/OFF) and `SETUP` (`HEADSET`, `TEST` to hear your own radio voice, `KEY` to paste your radio key, `UPDATE`). D-pad up/down picks a row, left/right changes VOL and FX.
- `#` selects, `*` goes back. **QUIT** shuts the app off.

## Host setup

See `.env.example` (`RADIO_BOT_TOKEN`, `RADIO_PUBLIC_URL`, optional `RADIO_PORT`). The radio bot needs View Channel, Connect, and Speak in the radio channel.
