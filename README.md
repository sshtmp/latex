# Discord Latex Encoder

Codificador Latin/Latex (inspirado en [Changed](https://store.steampowered.com/app/349330/Changed/)) para el cliente web de Discord.

## Instalar (Tampermonkey)

Abre este enlace con Tampermonkey instalado y acepta la instalación:

**https://raw.githubusercontent.com/sshtmp/discord-latex-encoder/main/DiscordLatexEncoder.user.js**

## Características

- Panel **LATEX v1** en el composer:
  - Encoding: Disabled → Latin → Latex
  - Live translation on/off (off = traduce solo al enviar)
  - Message translation on/off (auto-traduce mensajes latex entrantes)
- Panel **LATEX v1** en la toolbar de hover del mensaje
- Badge `(latex)` / `(latin)` en mensajes traducidos, antes de `(edited)`

## Extensión (opcional)

Manifest V3 clásico en `manifest.json` (Chrome/Firefox about:debugging → Load temporary add-on).

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

Genera `DiscordLatexEncoder.user.js` en la raíz (lo que sirve el `@downloadURL` de GitHub).
