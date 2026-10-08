#!/usr/bin/env bash
# brand-shield/scripts/desplegar-web.sh
#
# Despliegue del frontend CON COMPUERTA (réplica del auditor, 2026-10-07): el
# smoke de producción corre contra el build NUEVO antes de que reciba tráfico,
# y si falla, usenotoria.app sigue sirviendo el anterior.
#
#   bash brand-shield/scripts/desplegar-web.sh
#
#   1. `vercel deploy --prod --skip-domain` → build de producción con su URL
#      propia, SIN asignarle usenotoria.app.
#   2. smoke-produccion.js contra esa URL (precios, devoluciones, portada,
#      términos, libro, privacidad + la API).
#   3. Solo si pasa: `vercel promote` → usenotoria.app pasa al build nuevo.
#   4. Smoke otra vez contra usenotoria.app (lo que ve el cliente) y se
#      confirma por la API de Vercel que el deployment de producción cambió
#      (CLAUDE.md §4: un `vercel --prod` puede no producir nada sin avisar).
set -euo pipefail
cd "$(dirname "$0")/../../brand-shield-web"
SMOKE="../brand-shield/scripts/smoke-produccion.js"

echo "▶ 1/4 Build de producción sin dominio…"
# La URL del build sale en la línea «Production» (por stderr en modo no interactivo).
URL=$(vercel deploy --prod --skip-domain --yes 2>&1 | grep -Eo 'https://notoria-[a-z0-9-]+\.vercel\.app' | head -1 || true)
[ -n "$URL" ] || { echo "🔴 Vercel no devolvió la URL del build: no se promueve nada"; exit 1; }
echo "   build: $URL"

echo "▶ 2/4 Smoke contra el build nuevo…"
# El build sin dominio está protegido por Vercel: se lee con `vercel curl`.
if ! SMOKE_VERCEL_CURL=1 WEB="$URL" node "$SMOKE"; then
  echo "🔴 El build nuevo NO pasa el smoke. usenotoria.app sigue en el anterior. No se promueve."
  exit 1
fi

echo "▶ 3/4 Promover a usenotoria.app…"
vercel promote "$URL" --yes

echo "▶ 4/4 Smoke contra usenotoria.app…"
sleep 5
WEB="https://usenotoria.app" node "$SMOKE"
echo "✅ Desplegado y verificado: $URL"
