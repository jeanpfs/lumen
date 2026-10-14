# Pages per target: UX restructure (design)

Status: approved in chat on 2026-10-07 (sections 1-3). Supersedes the global "Controlling" target of the M2b UI.

## 1. Problem

The app keeps one global target (`state.target`) chosen in a header picker. Color and Modes are top-level tabs that act on it; the group page has its own controls that ignore it. Inside a group the header can show a different strip or group, "Change color" silently changes the global target and jumps tabs, and "Color" in the menu can open on something the user was not looking at. What the app is controlling is implicit and can diverge from what the screen shows.

## 2. Decisions (user)

- Color and Modes are parts of each group and each strip, not global tabs.
- Group and strip pages have tabs: **General · Color · Modes**.
- Every strip has its own page, including strips that belong to a group.
- Main navigation: **Home · Settings** only.
- No global header (no target picker, no global power button).

## 3. Screens and routes

| Route | Screen |
|---|---|
| `#home` | Home: groups and loose strips as cards (name, presumed state, power). A card opens its page. Page actions: Add strip, New group. |
| `#group/<id>[/general\|color\|modes]` | Group page. Default tab `general`. |
| `#strip/<id>[/general\|color\|modes]` | Strip page. Default tab `general`. |
| `#settings` | Settings: theme and "Strip types". Nothing per strip. |
| `#types` | Strip types (reached from Settings). |
| `#add[/<stripId>]` | Setup wizard (full screen); an id recalibrates. |

Unknown ids show "not found" with a way back. The old `#color` and `#modes` routes fall back to `#home`. Back from a strip opened from a group returns to that group; otherwise to Home.

Page header (fixed above the tabs): name, pencil (rename), trash (delete / remove), power button, state and one "presumed state" marker. On phones the tabs sit at the top and scroll horizontally.

Shell: sidebar with Home and Settings. On phones, a bar with Home, a central "Add" and Settings. The "Bluetooth unavailable" banner stays at the top of the page.

## 4. Tabs

### Group, General
Member list: select, color dot, name + link badge + "own color" chip, power switch, move up/down, remove. Tapping the name opens the strip page. The color dot opens that strip's **Color** tab. The batch bar (Turn on, Turn off, Follow the group, Remove) appears only with a selection. The note about the 6 live links stays. "Add strips" opens the existing sheet.

### Strip, General
Link status with "Try again". Groups the strip belongs to (tap opens the group; add / remove). Everything that is per strip in Settings today moves here: channel order, recalibrate, family, white, useful minimum brightness. Rename and remove are the header icons.

### Color (group or strip)
The existing color screen (wheel, brightness, values folded under Details, presets, favorites) acting on the page's own target. For a strip that belongs to a group a segment **Follow the group | Own color** appears: choosing Own color enables the wheel and sets the override; going back to Follow the group sends the group's color again. The in-row color panel of the group list is removed.

### Modes (group or strip)
The existing interface-only screen with its notice; nothing is sent.

## 5. State and code

- Remove `state.target`, `setTarget`, the saved target in `localStorage` (old data is ignored; no migration) and the header target picker.
- Color and Modes components receive `target: TargetRef` as a prop instead of reading a global.
- The app tint (`--live-rgb`, `--live-strength`) follows the color of the current page's target (neutral on Home and Settings).
- `router.ts`: new route union and parser (`group` and `strip` with optional tab), tests for parsing, escaping and the legacy fallbacks.
- New components: target page (header + tabs), group General, strip General, Color tab, Modes tab. Shell reduced to sidebar / phone bar / banner. Settings loses the per-strip cards.
- Unchanged: presumed-state model, sender, backend commands, wizard.

## 6. Errors

An unreachable strip shows its state and "Try again" in General and a notice at the top of the Color tab; controls stay enabled (commands are queued by the pool). A group with unreachable members shows the same summary in its header.

## 7. Tests

- Router parse / round trip / legacy fallbacks.
- Color tab sends to the right target: a group with overridden members, a loose strip, a strip in a group.
- Follow the group / Own color toggle sends the expected commands.
- Group General: reorder, remove, batch bar visibility, tapping a name opens the strip.
- Strip General: rename, remove with confirmation, channel order, recalibrate, groups.
- Navigation has exactly two entries and no header target control.
- Existing Settings per-strip tests move to the strip page; wizard and store tests unchanged except where they referenced the global target.

## 8. Out of scope

Swiping between tabs, deep links from Home to a tab, real effects in Modes, any backend change.
