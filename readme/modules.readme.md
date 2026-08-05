# src/modules/

> Verified against `3c8011f` + Pass B (2026-08-02) — if this folder has
> moved since, treat contents as unconfirmed. Every file below,
> including all of `settings-panel/`, has now been fully read.
>
> **Links to:** Architecture.md ×2

Full features, built on `JLib.moduleBase` (see
`../services/module-lifecycle.js`) so header/section markup is identical
across every module rather than hand-rolled per feature. Deep
explanation: see [../../Architecture.md](../../Architecture.md).

| File / folder | What it is |
|---|---|
| `notification-center.js` | UI over `services/notifications.js`'s history — doesn't emit notifications itself, just lists what the core has already shown/dismissed. |
| `settings-panel/` | The full settings panel — see below. Four files, one subsystem, order in `settings-panel/.order.json`. |

## settings-panel/

All four files build onto a shared, intentionally private `JLib._sp`
namespace — not part of the public API a userscript author calls
directly. Full reasoning for each in
[../../Architecture.md](../../Architecture.md).

| File | What it is |
|---|---|
| `validator.js` | Settings Panel's own "wrong door" config validation — bounded strictly to config an author directly supplies to `settingsPanel.create()`. Each check is a confirmed silent-misbehavior path (a typo that would otherwise produce a permanently invisible feature, a dependency check that always evaluates false, two rows silently overwriting the same storage key). |
| `schema-dispatch.js` | Feature-type dispatch — given a feature definition, the current scope, and the live settings object, renders the right row (boolean/enum/number/text/action/custom). |
| `navigation.js` | Largest file in the folder (549 lines). Deep linking, a real breadcrumb/history stack (full view-snapshot restore, not just tree-parent), export/import, tokenized search past an 8-feature threshold, and `mount()`/`buildVariant()` tying it together into one per-instance state object every extracted function shares by reference. |
| `chrome-config.js` | The shared "Panel Settings" chrome (theme/language/animations/position/shortcut/export-import) expressed as real schema features rather than bespoke rows. Loads last in this folder specifically — it's the final assembly point where `JLib.modules.settingsPanel` itself gets built from what the other three files registered. |
