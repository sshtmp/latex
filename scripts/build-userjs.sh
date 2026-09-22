#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
OUT="DiscordLatexEncoder.user.js"

{
  cat <<EOF
// ==UserScript==
// @name         Discord Latex Encoder
// @namespace    https://github.com/sshtmp/discord-latex-encoder
// @version      ${VERSION}
// @description  Codificador Latin/Latex (estilo Changed) para Discord web: panel LATEX v1, live translation y badges en mensajes
// @author       sshtmp
// @match        https://discord.com/*
// @match        https://ptb.discord.com/*
// @match        https://canary.discord.com/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/sshtmp/discord-latex-encoder/main/${OUT}
// @updateURL    https://raw.githubusercontent.com/sshtmp/discord-latex-encoder/main/${OUT}
// ==/UserScript==

EOF
  echo "(function () {"
  echo '"use strict";'
  echo
  for f in core composer messages; do
    echo "/* ===== content/${f}.js ===== */"
    cat "content/${f}.js"
    echo
  done
  echo "})();"
} > "$OUT"

echo "Built ${OUT} (v${VERSION})"
