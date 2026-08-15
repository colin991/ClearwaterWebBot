# Clearwater Phone

Floating **Clearwater** phone overlay for ER:LC on desktop. Always-on-top, frameless, toggle with **F8** (fallback **Alt+A**). Drag the status bar to move.

## Apps

| App | What it does |
|-----|----------------|
| **Wallet** | Live Clearwater credits — transactions, send, and request (same as Internet) |
| **Find My** | Share your ER:LC location with friends you choose |
| **Messages** | The same DMs as Clearwater Internet |
| **Maps** | Liberty County map from ER:LC — tap a spot to route from your in-game position |

Icons and wallpaper are original Clearwater designs (not copies of third-party phone UIs).

## Run (dev)

```bash
cd anchor-phone
npm install
npm start
```

## Windows portable build

```bash
npm run dist
```

Output: `anchor-phone/dist/ClearwaterPhone.exe` — download and run alongside Roblox. No install required.

## Notes

- Overlay sits above games; it does **not** inject into Roblox.
- Sign in with Discord from Settings so Wallet, Messages, Maps, and Find My use your Clearwater Internet account.
- Rebuild the Windows portable with `cd anchor-phone && npm run dist`, then copy `dist/ClearwaterPhone.exe` to `downloads/` (or run `downloads/rebuild-exe.sh`).
- Hide with **F8**; quit from the OS taskbar / dock menu.
