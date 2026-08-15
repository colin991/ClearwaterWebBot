# Clearwater Phone

Floating **Clearwater** phone overlay for ER:LC on desktop. Always-on-top, frameless, toggle with **F8** (fallback **Alt+A**). Drag the status bar to move.

## Apps

| App | What it does |
|-----|----------------|
| **Wallet** | Send, receive, and request economy money from panel members |
| **Marketplace** | Storefront, products, employees, and payouts |
| **Find My** | Share in-game location with trusted contacts (per-person toggle) |
| **Mail** | Clearwater Mail — compose/receive; marketplace receipts |
| **Messages** | Message contacts and friends |
| **Maps** | Fastest route to a Clearwater destination |

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
- **Members download from Clearwater Internet → Phone** (`/internet/phone`) — `ClearwaterPhone.exe` (portable; double-click to open).
- Rebuild the Windows portable with `cd anchor-phone && npm run dist`, then copy `dist/ClearwaterPhone.exe` to `downloads/` (or run `downloads/rebuild-exe.sh`).
- Local demo data is stored in the app (`localStorage`). Live panel wallet/messages can be wired to Clearwater Internet APIs later.
- Hide with **F8**; quit from the OS taskbar / dock menu.
