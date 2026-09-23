# Campaña de video — qué vive aquí y qué no

Los **guiones** de los siete videos de campaña, en git desde el **2026-09-22**.

Hasta ese día vivían solo en `C:\Users\Taller\Downloads\notoria-videos\guiones`, y eso
era un problema por dos motivos distintos:

- 🔴 **`Downloads` se limpia sola.** Es el mismo aviso que §3 de `CLAUDE.md` da para el
  `certificado.p12`. Los guiones llevan dentro el porqué de cada frase —qué se retiró,
  contra qué se comprobó y cuándo—, o sea que perderlos no es perder texto: es perder
  las razones, que es lo caro de rehacer.
- 🔴 **Son material que afirma cosas sobre el producto**, y §15 gobierna lo que el
  producto puede prometer. Un guión fuera del repo es una promesa que nadie revisa
  cuando el producto cambia — y eso ya pasó: el resumen dejó de ser semanal el 09/09
  y el guión 3 siguió diciendo «lunes» once días.

## Qué está en git

| | |
|---|---|
| `guiones/guion-*.txt` | los siete guiones, con su prompt de imagen, de video, el negativo y el montaje |
| `guiones/LEEME.txt` | el índice de los siete y las seis reglas de Kling aprendidas a golpes |
| `guiones/montaje.txt` | los comandos de ffmpeg, y §7 lo que de ellos NO corre en esta PC |
| `guiones/anexo-multishot.txt` | el experimento de Kling 3.0 Multi-Shot, descartado |

## Qué NO está, y dónde está

Las **imágenes** se quedan fuera, por decisión del dueño («solo los guiones»):

- `1a.png … 7b.png` — las tarjetas de cierre. **Se regeneran** con
  `node marca/hacer-tarjeta.js`, así que no hace falta versionarlas.
- `inicio-*.png` — los primeros fotogramas que se le dan a Kling. ⚠️ **Estos NO se
  regeneran**: salieron de un modelo de imagen y no hay semilla guardada. Si se pierden,
  se vuelven a generar y no van a ser los mismos. Viven en la carpeta de `Downloads`.
- Los clips y los montajes finales.

## La herramienta de las tarjetas

```bash
node marca/hacer-tarjeta.js 8a.png "línea 1" "línea 2"            # tarjeta de problema
node marca/hacer-tarjeta.js 8b.png "línea 1" "línea 2" --cierre   # tarjeta de cierre
```

🔴 **No es el `hacer-tarjeta.py` de antes.** Ese no corre en la PC del taller —no hay
Python, usaba `fc-match` y cargaba el logo de una ruta de la máquina anterior—. El
porqué completo está en la cabecera de `marca/hacer-tarjeta.js`, incluida la
consecuencia de que cambie la tipografía.

## La regla que dejó el 2026-09-22

⚠️ **Al corregir una frase de campaña, la lista de sitios incluye las IMÁGENES.** Seis
tarjetas seguían imprimiendo lo que ya se había quitado de la voz —«Y a las 3. Y a las
4», «cada lunes», «te avisa el mismo día»— y nadie lo vio porque **un PNG no aparece en
ningún `grep`**. Es el mismo fallo que el `og-image` del 19/09, en otro soporte.
