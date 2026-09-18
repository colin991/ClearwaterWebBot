# Command-abuse detection

Enabled on bot startup. The ER:LC snapshot includes command logs. After ignoring history already present at startup, a new log that matches a mass command posts once to channel `1550330878360813618` and pings `@here`.

Flagged commands (not case-sensitive):

- `:heal all` / `:heal everyone` / `:heal others`
- `:bring all` / `:bing all` / `:bring others`
- `:kick all`
- `:ban all`

Single-player commands such as `:heal Player` or `:kick Cheater` are not flagged. The bot does not reverse the in-game command; it only alerts.
