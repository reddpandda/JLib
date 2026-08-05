# JLib — Onboarding

> Verified against `3c8011f` + Pass B (2026-08-02) — if `src/` has moved
> since, treat contents as unconfirmed.
>
> **Links to:** API.md ×2
>
> This is the fast, illustrated on-ramp — the actual order a first script touches
> things in, with just enough example to see the shape of each call. Every
> function here has its full, uncondensed entry in **[API.md](API.md)** — this
> document teaches, that one is the reference you come back to.

## 1. Register your script

The first line of real code in almost any script that uses JLib. Everything namespace-scoped refuses to operate until this has run.

```js
JLib.registerScript({ namespace: 'myWalmartScript' });
```

Forget it, and any Settings Panel or `JLib.cache` call will `console.warn` and quietly do nothing instead of throwing — that warning is telling you to add this line.

## 2. Build a module

A module is one panel in your script's dashboard. `moduleBase.create` builds the definition; `registerModule` adds it. You almost always call both together:

```js
JLib.registerModule(JLib.moduleBase.create({
  id: 'links', label: 'Quick Links',
  onMount(view) {
    view.header('Quick Links');
    view.section('Bookmarks', body => { /* build your content here */ });
  },
}));
```

Register a second module later, and the dashboard automatically switches from a single-shell layout to a menu-driven one — nothing else in your code has to change.

## 3. Put content in it

The building blocks a settings section is actually made of — one button, one row at a time:

```js
JLib.elements.button.button('Refresh', () => location.reload());

toggleRow('Hide ads', 'Removes sponsored tiles', settings.hideAds, (v) => {
  settings.hideAds = v;
  store.save(undefined, settings);
});

dropdownRow('Theme', '', [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
], settings.theme, onChange);
```

For anything outside a settings row, `JLib.dom.el` is the plain building block underneath almost everything else:

```js
el('div', { className: 'my-badge' }, ['NEW']);
```

## 4. Save a setting

Define what you're storing once, get load/save for free:

```js
const store = JLib.storage.createStore(
  [{ id: 'hideAds', default: true }, { id: 'darkMode', default: false }],
  { storageKeyPrefix: 'myScript_settings' }
);
const settings = store.load();
if (settings.hideAds) { /* ... */ }
```

## 5. React to the page

For "run this the moment something specific shows up" — the single most common userscript need:

```js
JLib.triggers.watch('loadMore', '.load-more-btn', (el) => el.click());
```

For "handle clicks on things that don't exist yet":

```js
JLib.events.on(document, 'click', '.product-tile', (e, tile) => {
  console.log(tile.dataset.id);
});
```

## 6. Notify the user

Set up once, call anywhere after:

```js
const notifications = JLib.notifications.create();

notifications.notify('Saved!', { level: 'success', staleAfter: { type: 'default' } });
```

## 7. Persist non-setting data

For anything that isn't a user-facing setting — a parsed page index, a cached lookup:

```js
await JLib.cache.set('parsedPageIndex', expensiveData);
// later, on a fresh page load:
const data = await JLib.cache.get('parsedPageIndex');
```

## 8. Theme it to match the page

The one-call shortcut for "make this element I built visually belong to the page it's on":

```js
JLib.superProvider.css.apply(myBadge, { color: true });
```

## 9. Render

Call this exactly once, at the very end of your script:

```js
JLib.scheduleRender();
```

That's a complete first script — register, build a module, fill it, save a setting, react to the page, notify, cache, theme, render. Everything past this point is [API.md](API.md)'s job: what else exists, and exactly what each call returns.
