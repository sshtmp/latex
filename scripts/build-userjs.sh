#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
OUT="Latex.user.js"

{
  cat <<EOF
// ==UserScript==
// @name         Latex
// @namespace    https://github.com/sshtmp/latex
// @version      ${VERSION}
// @description  Latin/Latex (Changed-style) encoder for Discord web
// @author       sshtmp
// @match        https://discord.com/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/sshtmp/latex/main/${OUT}
// @updateURL    https://raw.githubusercontent.com/sshtmp/latex/main/${OUT}
// ==/UserScript==

EOF
  echo "(function () {"
  echo '"use strict";'
  echo
  for f in core composer messages; do
    cat "src/${f}.js"
    echo
  done
  echo "})();"
} > "$OUT"

echo "Built ${OUT} (v${VERSION})"
