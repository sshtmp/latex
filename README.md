# Latex

Latin/Latex (Changed-style) encoder for Discord web.

## Install (Tampermonkey)

Open with Tampermonkey installed and accept:

**https://raw.githubusercontent.com/sshtmp/latex/main/Latex.user.js**

## Features

- **LATEX v1** panel in the composer (encoding cycle, live translation, message translation)
- **LATEX v1** panel on message hover toolbar
- `(latex)` / `(latin)` badge on translated messages, before `(edited)`

## Extension (optional)

MV3 manifest in `manifest.json`.

## Tests

```bash
cd test
npm install
npm test
```

## Build userscript

```bash
./scripts/build-userjs.sh
```

Outputs `Latex.user.js` at the repo root.
