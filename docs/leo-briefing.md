# LEO briefing

`/briefing` is Discord **Administrator** only (command permission and a runtime check). Use it in the Clearwater Discord server while you are in a voice channel.

On run the bot:

1. Drags in-game **Police** and **Sheriff** players who are already in a Discord voice channel into **your** voice channel.
2. Sends `:m A server wide LEO briefing is now starting please do not start any roleplay that LEO is needed please go to the police station if you are LEO`
3. Starts a **20 minute** peace timer (`:pt 1200`)
4. Loads the **BREIFING WALLS** map layout (`:loadlayout BREIFING WALLS`)
5. DMs you a panel to **load/unload BREIFING ROAD BLOCKS** and **End briefing**

**End briefing** unloads **BREIFING WALLS** and **BREIFING ROAD BLOCKS**, then sends `:m The server wide LEO briefing has now ended normal roleplay can start`.

Those layout names must exist on the ER:LC private server map-save list, matching the in-game titles. The in-game commands are `:loadlayout [Name]` and `:unloadlayout [Name]`. Runtime state is `data/leo-briefing.json` (Git-ignored). Restart the bot after deploying so `/briefing` registers.
