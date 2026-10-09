# Poker Tournament Manager

Runs alongside a blind clock and handles the rest of a home tournament: the player list, the table draw, who owes what, eliminations, and alerts to balance or break tables. One device, no server, no accounts. The spec is in [docs/spec.md](docs/spec.md).

## Run it

```bash
npm install
npm run dev
```

Other commands:

- `npm test` runs the unit tests on the logic module.
- `npm run build` type-checks and writes the app to `dist/`.

## Use it on a laptop or tablet

`npm run build` produces `dist/index.html`, a single self-contained file. Open it in a browser by double-clicking it; it needs no network.

## Use it on a phone

A phone cannot open the file from disk the way a laptop can, so the `dist/` folder has to be served from an `https://` address (any static host works: GitHub Pages, Netlify, Cloudflare Pages).

1. Upload the contents of `dist/` to the host.
2. Open the address on the phone.
3. Add it to the home screen (Share → Add to Home Screen on iPhone, menu → Install app on Android).

After the first visit the app works with no network. The layout switches to a single column with the tabs at the bottom on screens narrower than 700 px.

## Where the data lives

The tournament is saved in the browser's storage on the device after every action, so a reload or a closed tab loses nothing. It is not shared between devices: a tournament started on the laptop does not appear on the phone. Settings → Export downloads a backup file, and Import restores it on any device.

## Layout

- `src/logic/` holds the draw, alerts, money, payouts, places, the reducer and storage, with no React imports. `logic.test.ts` covers the spec's acceptance table.
- `src/components/` holds the four screens (Setup, Run, Money, Results) and the dialogs.
- `src/store.ts` connects the reducer to the browser's storage and to React.
