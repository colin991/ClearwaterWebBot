# Vehicle server-saved preset checks

Enabled on bot startup. The ER:LC snapshot includes spawned vehicles. Police, Sheriff, Fire, and DOT players who stay in a non-utility car without a **named server livery** are PMed in-game.

A texture counts as a server-saved preset when it is a custom livery name (for example `Clearwater PD`). Stock values such as `Standard` and Roblox paint names such as `Really black` do not count.

The first two snapshots are a short grace so a just-spawned car can load a preset. After that the player is PMed, and reminded again after 90 seconds if they still have no preset. Exempt staff are skipped. Players are not kicked, jailed, or `:load`ed.
