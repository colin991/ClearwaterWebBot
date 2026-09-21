# ER:LC car Server Saved Preset checks

Enabled on bot startup. The ER:LC snapshot includes spawned cars. Police, Sheriff, Fire, and DOT players who stay in a non-utility car **without loading a Server Saved Preset** from the in-game car customizer are PMed.

The PRC vehicle `Texture` field is the car preset name after you load a Server Saved Preset. Built-in packages such as `Standard`, `Unmarked`, or `Slicktop`, and paint-only names such as `Really black`, mean the car is not on a server-saved preset.

The first two snapshots are a short grace so a just-spawned car can load a preset. After that the player is PMed, and reminded again after 90 seconds if the car still has no preset. Exempt staff are skipped. Players are not kicked, jailed, or `:load`ed.
