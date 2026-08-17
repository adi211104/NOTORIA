// brand-shield/src/lib/winansi.js
//
// Sanitizador de texto para los PDF que usan fuentes ESTÁNDAR de PDF (Times,
// Helvetica). Lo comparten el afiche de la pared y la constancia.
//
// ── El problema que resuelve ────────────────────────────────────────────────
// Esas fuentes solo cubren WinAnsi. Si le pasas a PDFKit un carácter que no está
// ahí —una estrella ★, un emoji— dibuja un **`&` literal** en su lugar. Pasó en
// el primer afiche: «2 reseñas de 3& o menos», impreso y colgado en una pared.
//
// ── Y la trampa dentro de la trampa ─────────────────────────────────────────
// La primera versión de esto filtraba por latin1 (`[^\x00-\xFF]`). **WinAnsi no
// es latin1.** CP1252 añade en el rango 0x80–0x9F justo los caracteres
// tipográficos que aparecen solos en un texto en español: comillas curvas, guion
// largo, puntos suspensivos, apóstrofo tipográfico.
//
// Con el filtro de latin1 esos caracteres se borraban en silencio. Nada se
// rompía —por eso costó verlo— pero el guion largo desaparecía del afiche, y el
// apóstrofo del nombre de un cliente llamado «Tito's» se habría borrado también.
// Un documento al que le faltan letras es peor que uno que falla del todo,
// porque nadie lo reporta.
//
// Así que el conjunto permitido es WinAnsi de verdad: latin1 MÁS los 27 extras
// de CP1252.
//
// Para meter caracteres de fuera (★ y compañía) haría falta empaquetar un .ttf
// y llamar a `doc.registerFont` — peso y mantenimiento a cambio de un adorno.

const EXTRAS_CP1252 = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ'
  + '‘’“”•–—˜™š›œžŸ';

const FUERA_DE_WINANSI = new RegExp(`[^\\x00-\\xFF${EXTRAS_CP1252}]`, 'g');

const seguro = (texto) => String(texto ?? '').replace(FUERA_DE_WINANSI, '');

module.exports = { seguro, EXTRAS_CP1252 };
