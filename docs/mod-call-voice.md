# Mod-call voice routing

On startup the bot watches ER:LC `ModCalls` every five seconds after each pass. Existing accepted history is ignored; newly accepted calls resolve Caller and Moderator to Discord members using linked Roblox IDs, with a unique name match as fallback.

Both members must already be in voice in the configured Discord server. The bot moves them to the first empty available room: `1514131750559813733`, `1514131852393320519`, or `1514131887914745906`. It checks permissions and room capacity and reserves a selected room while gateway state settles. Calls retry for up to five minutes when no room or member is available. An incomplete second move attempts to restore the caller's original channel.

Human joins to `1535453333177761813` queue the spoken message: “A Staff Member will be with you soon. Please wait,” then leave. Mute/deafen changes and bot joins do not trigger it. The greeting waits up to one minute for another active voice session to finish, and temporarily pauses/resumes dispatch radio when needed. Playback requires working TTS, Connect, and Speak. Moving members requires Move Members and room access. The bot cannot connect disconnected Discord users.
