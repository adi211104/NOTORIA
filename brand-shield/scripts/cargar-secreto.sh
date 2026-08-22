#!/usr/bin/env bash
# brand-shield/scripts/cargar-secreto.sh
#
# Carga un secreto en Railway pidiendolo por teclado, sin que pase por la linea
# de comandos ni por la pantalla.
#
#   bash scripts/cargar-secreto.sh META_APP_SECRET
#   bash scripts/cargar-secreto.sh CULQI_SECRET_KEY 24     # con longitud esperada
#
# POR QUE EXISTE. Cargar secretos a mano ha fallado tres veces por el mismo tipo
# de motivo, y siempre con un error que apunta a otra cosa:
#
#   1. En PowerShell, el pipe hacia un ejecutable nativo antepone un BOM UTF-8
#      invisible. Una llave de Culqi quedo de 25 caracteres en vez de 24 y
#      devolvia 401 exactamente igual que si estuviera revocada.
#   2. `echo` agrega un salto de linea que `printf '%s'` no agrega.
#   3. Copiar el comando desde un chat o un panel puede arrastrar caracteres de
#      control invisibles: `bash: $'\302\226printf': command not found` es un
#      U+0096 pegado delante del comando.
#
# Este script quita el BOM, los saltos y los espacios de los extremos, avisa si
# quedan caracteres raros en medio, y NO carga nada si algo no cuadra. Ademas el
# secreto no queda en el historial de bash, porque nunca se escribe como
# argumento.
#
# ⚠️ `--skip-deploys` NO se usa a proposito: sin redespliegue la variable no
# llega al contenedor en marcha y todo parece cargado sin estarlo.

set -euo pipefail

VARIABLE="${1:-}"
LARGO_ESPERADO="${2:-}"

if [ -z "$VARIABLE" ]; then
  echo "Uso: bash scripts/cargar-secreto.sh <NOMBRE_VARIABLE> [largo esperado]" >&2
  exit 1
fi

# railway se enlaza POR CARPETA: hay que estar en brand-shield/, no en la raiz
# del repo, que esta enlazada a otro proyecto.
cd "$(dirname "$0")/.."

printf 'Pega el valor de %s y pulsa Enter (no se vera en pantalla):\n> ' "$VARIABLE"
read -rs SECRETO
printf '\n'

# BOM UTF-8, retornos de carro, saltos y espacios de los extremos.
SECRETO="$(printf '%s' "$SECRETO" | sed -e 's/^\xEF\xBB\xBF//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | tr -d '\r\n')"

if [ -z "$SECRETO" ]; then
  echo "Vacio. No se carga nada." >&2
  exit 1
fi

LARGO="${#SECRETO}"

# Cualquier cosa fuera de ASCII imprimible es un caracter que se colo al copiar.
if printf '%s' "$SECRETO" | LC_ALL=C grep -q '[^[:print:]]'; then
  echo "El valor trae caracteres no imprimibles (se colaron al copiar). No se carga nada." >&2
  exit 1
fi

if [ -n "$LARGO_ESPERADO" ] && [ "$LARGO" -ne "$LARGO_ESPERADO" ]; then
  echo "Mide $LARGO caracteres y se esperaban $LARGO_ESPERADO. No se carga nada." >&2
  exit 1
fi

echo "Valor limpio: $LARGO caracteres. Cargando en Railway (dispara redespliegue)..."
printf '%s' "$SECRETO" | railway variable set "$VARIABLE" --stdin --service api

echo
echo "Cargado. El redespliegue tarda 1-2 minutos."
echo "Para comprobarlo DENTRO del contenedor, sin imprimir el valor:"
echo "  railway ssh --service api \"node -e \\\"const v=process.env.$VARIABLE;console.log(v?v.length+' caracteres':'NO PUESTA')\\\"\""
