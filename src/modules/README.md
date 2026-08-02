# src/modules/

> Verified against commit `3c8011f` (2026-08-01) — if this folder has
> moved since, treat contents as unconfirmed. `settings-panel/`'s
> entries below are header-comment-only; full bodies (`navigation.js`
> especially) are still pending a full read (Pass B).

Full features, built on `JLib.moduleBase` (see
`../services/module-lifecycle.js`) so header/section markup is identical
across every module rather than hand-rolled per feature. Deep
explanation: see [../../Reference.md](../../Reference.md).

| File / folder | What it is |
|---|---|
| `notification-center.js` | UI over `services/notifications.js`'s history — doesn't emit notifications itself, just lists what the core has already shown/dismissed. |
| `settings-panel/` | The full settings panel — see below. Four files, one subsystem, order in `settings-panel/.order.json`. |

## settings-panel/

*Contents confirmed only from each file's own header comment this
pass — a real read of the bodies (`navigation.js` especially, 549
lines) is still pending. Treat the descriptions below as a map of what
exists, not a full explanation of how it works — that's the gap this
whole subfolder still has in [../../Reference.md](../../Reference.md)
too.*

| File | What it is |
|---|---|
| `validator.js` | Settings Panel's own "wrong door" config validation — bounded strictly to config an author directly supplies to `settingsPanel.create()`. Each check is a confirmed silent-misbehavior path (a typo that would otherwise produce a permanently invisible feature, a dependency check that always evaluates false, two rows silently overwriting the same storage key). |
| `schema-dispatch.js` | Feature-type dispatch — given a feature definition, the current scope, and the live settings object, renders the right row (boolean/enum/number/text/action/custom). |
| `navigation.js` | *Largest file in this folder, 549 lines — Pass B target.* Core panel behavior: deep linking, breadcrumb/history navigation, content rendering, mount/unmount, `buildVariant()`/`create()`. |
| `chrome-config.js` | The shared "Panel Settings" chrome (theme/position/animations/shortcut/export-import) expressed as real schema features rather than bespoke rows. Loads last in this folder specifically — it's the final assembly point where `JLib.modules.settingsPanel` itself gets built from what the other three files registered. |
