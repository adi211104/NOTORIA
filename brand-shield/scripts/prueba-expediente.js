// brand-shield/scripts/prueba-expediente.js
//
// El expediente de una reseña (I8). Sin BD, sin red y sin IA.
//
//   node scripts/prueba-expediente.js
//
// ── QUÉ SE VIGILA ───────────────────────────────────────────────────────────
//
// Dos cosas, y la segunda es la que de verdad importa.
//
// 1. La aritmética del contexto: cuántas reseñas entraron alrededor, cuántas
//    llevaban señal, y cómo se movió la ficha. Con la trampa de siempre —`null`
//    no es `0`—: en un documento que puede acabar en una denuncia, decir «la
//    ficha no se movió» cuando lo cierto es «no lo medimos» es una afirmación
//    falsa con nuestro membrete encima.
//
// 2. 🔴 EL LÍMITE. El producto arma la evidencia y explica el procedimiento; no
//    da asesoría legal y NO afirma que una reseña sea falsa ni que nadie haya
//    cometido un delito. Eso lo determinan la plataforma o la autoridad. Es la
//    misma regla que ya gobierna al detector, que dice «comportamiento anómalo»
//    y jamás «reseña falsa».
//
//    Esa regla vive en el TEXTO del PDF, así que se comprueba leyendo el fuente
//    del generador: ninguna prueba de comportamiento la vería. Si alguien
//    «mejora» el documento poniéndolo más contundente, esto es lo único que lo
//    va a frenar — y un PDF con el logo de Notoria acusando de extorsión a una
//    persona identificable sería un problema nuestro, no del cliente.

const fs = require('fs');
const path = require('path');

const { armar, contexto, VENTANA_DIAS } = require('../src/lib/expediente');
const { generarExpediente } = require('../src/utils/expediente.pdf');

const RAIZ = path.join(__dirname, '..');
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

let ok = 0, fallos = 0;
const check = (nombre, condicion, detalle = '') => {
  if (condicion) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fallos++; console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};
const titulo = (t) => console.log(`\n${t}`);

const d = (s) => new Date(s);
const CENTRO = '2026-03-14T10:00:00Z';
const resena = {
  plataforma: 'GOOGLE', rating: 1,
  texto: 'Pesimo, no vuelvo.', autorNombre: 'Juan P.', autorResenasTotal: 2,
  fechaResena: d(CENTRO), detectadaEn: d('2026-03-14T14:00:00Z'),
  esSospechosa: true, motivoSospecha: 'texto duplicado', respondida: false, sinEstrella: null,
};

const correr = async () => {
  // ═══════════════════════════════════════════════════════════════════════════
  titulo('1. La ventana: qué entra y qué no');

  const dentroYFuera = [
    resena,
    { rating: 1, fechaResena: d('2026-03-14T12:00:00Z'), esSospechosa: true, motivoSospecha: 'texto duplicado' },
    { rating: 2, fechaResena: d('2026-03-15T09:00:00Z'), esSospechosa: false },
    { rating: 5, fechaResena: d('2026-03-11T09:00:00Z'), esSospechosa: false },
    // Fuera de la ventana de 7 días por los dos lados
    { rating: 1, fechaResena: d('2026-02-01T09:00:00Z'), esSospechosa: true, motivoSospecha: 'x' },
    { rating: 1, fechaResena: d('2026-05-01T09:00:00Z'), esSospechosa: true, motivoSospecha: 'x' },
  ];
  const c = contexto(resena, dentroYFuera, []);
  check(`la ventana es de ${VENTANA_DIAS} días a cada lado`, VENTANA_DIAS === 7);
  check('cuenta solo las de la ventana (4 de 6)', c.enVentana === 4, `contó ${c.enVentana}`);
  check('separa las negativas (3 de ≤2★)', c.negativasEnVentana === 3, `contó ${c.negativasEnVentana}`);
  check('cuenta las que llevaron señal, sin concluir nada', c.conSenal === 2, `contó ${c.conSenal}`);
  check('agrupa los motivos sin repetirlos', c.motivos.length === 1 && c.motivos[0] === 'texto duplicado');

  const sinFecha = contexto(resena, [{ rating: 1 }], []);
  check('una reseña sin fecha no se cuela en la ventana', sinFecha.enVentana === 0);

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('2. 🔴 null no es 0: la ficha «no medida» no es la ficha «que no se movió»');

  const snaps = [
    { tomadoEn: d('2026-03-13T08:00:00Z'), ratingActual: 4.4, totalResenas: 210 },
    { tomadoEn: d('2026-03-16T08:00:00Z'), ratingActual: 4.2, totalResenas: 214 },
  ];
  const conSnaps = contexto(resena, dentroYFuera, snaps);
  check('toma el snapshot anterior al día de la reseña',
    conSnaps.antes && conSnaps.antes.rating === 4.4);
  check('y el primero posterior', conSnaps.despues && conSnaps.despues.rating === 4.2);
  check('calcula la variación de rating', conSnaps.deltaRating === -0.2, String(conSnaps.deltaRating));
  check('y la de volumen', conSnaps.deltaResenas === 4, String(conSnaps.deltaResenas));

  const cero = contexto(resena, dentroYFuera, []);
  check('SIN snapshots el delta es null, no 0', cero.deltaRating === null && cero.deltaResenas === null,
    'un 0 afirmaría que la ficha no se movió, que es una afirmación distinta de «no lo sabemos»');
  const soloAntes = contexto(resena, dentroYFuera, [snaps[0]]);
  check('con una sola medición tampoco se inventa un delta', soloAntes.deltaRating === null);
  check('pero sí se informa la medición que sí existe', soloAntes.antes !== null && soloAntes.despues === null);

  // Un snapshot con fecha corrupta no puede tumbar el documento.
  const corrupto = contexto(resena, dentroYFuera, [{ tomadoEn: 'no-es-fecha', ratingActual: 3 }, ...snaps]);
  check('un snapshot con fecha inválida se ignora en vez de reventar',
    corrupto.deltaRating === -0.2);

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('3. Lo que el expediente afirma sobre la reseña');

  const exp = armar({
    negocio: { nombre: 'Don Tito', direccion: 'Av. X 1', googlePlaceId: 'ChIJx' },
    resena, delPeriodo: dentroYFuera, snapshots: snaps,
  });
  check('sin negocio o sin reseña devuelve null, no un objeto a medias',
    armar({ negocio: null, resena }) === null && armar({ negocio: {}, resena: null }) === null);
  check('conserva el texto exacto', exp.resena.texto === 'Pesimo, no vuelvo.');
  check('guarda la fecha de PUBLICACIÓN y la de CAPTURA por separado',
    !!exp.resena.fechaResena && !!exp.resena.capturadaEn,
    'la de captura es lo que acredita que el texto estaba publicado ese día');
  check('`sinEstrella` viaja para no presentar como dato de la plataforma una estrella que derivamos',
    armar({ negocio: { nombre: 'x' }, resena: { ...resena, sinEstrella: true }, delPeriodo: [], snapshots: [] })
      .resena.sinEstrella === true);
  check('una reseña sin señal no arrastra motivo',
    armar({ negocio: { nombre: 'x' }, resena: { ...resena, esSospechosa: false }, delPeriodo: [], snapshots: [] })
      .resena.motivoSeñal === null);
  check('un autor sin conteo de reseñas es null, no 0',
    armar({ negocio: { nombre: 'x' }, resena: { ...resena, autorResenasTotal: null }, delPeriodo: [], snapshots: [] })
      .resena.autorResenasTotal === null,
    'un 0 diría «cuenta nueva», que es justo la señal que no podemos afirmar');

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('4. 🔴 EL LÍMITE: el documento no acusa a nadie');

  const pdfSrc = leer('src/utils/expediente.pdf.js');
  const libSrc = leer('src/lib/expediente.js');

  // Frases que el documento NO puede llegar a imprimir nunca. Se buscan en el
  // texto que se dibuja, no en los comentarios: por eso se limpian primero.
  const sinComentarios = pdfSrc.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const PROHIBIDAS = [
    'resena es falsa', 'reseña es falsa', 'resena falsa',
    'extorsionando', 'delincuente', 'estafador',
    'comprobamos que', 'certificamos que la resena',
  ];
  for (const frase of PROHIBIDAS) {
    check(`el PDF nunca imprime «${frase}»`, !sinComentarios.toLowerCase().includes(frase.toLowerCase()));
  }

  check('el PDF imprime la advertencia de alcance', pdfSrc.includes('ALCANCE DE ESTE DOCUMENTO'));
  check('dice explícitamente que NO es asesoría legal',
    /NO constituye asesoria legal/i.test(pdfSrc));
  check('dice explícitamente que NO afirma que la reseña sea falsa',
    /NO afirma que la resena sea falsa/i.test(pdfSrc));
  check('llama «señal» a lo del detector, no «prueba»',
    /senal de comportamiento anomalo/i.test(pdfSrc) && !/prueba de que la resena/i.test(sinComentarios));
  check('y aclara que una señal no determina falsedad',
    /no determina que la resena sea falsa/i.test(pdfSrc));
  check('la librería documenta el límite para quien la toque después',
    libSrc.includes('NO afirma que una reseña sea falsa'));

  // Las dos puertas, que es la corrección de fondo de la guía: para un chantaje
  // de un particular INDECOPI no es el sitio.
  check('el PDF distingue la vía penal de la de INDECOPI',
    /articulo 200 del Codigo Penal/i.test(pdfSrc) && /Decreto Legislativo 1044/i.test(pdfSrc));
  check('y no manda a INDECOPI por el chantaje de un particular',
    !/extorsion[^.]{0,80}INDECOPI/i.test(sinComentarios));

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('5. WinAnsi: nada que PDFKit no pueda dibujar');

  // ★ y → salen como un "&" literal con las fuentes estándar. Ya pasó en el
  // primer afiche de la pared.
  const cadenas = sinComentarios.match(/'[^'\n]{4,}'|`[^`\n]{4,}`/g) || [];
  const conRaros = cadenas.filter((c) => /[★→←…“”‘’—–]/.test(c));
  check('ninguna cadena del PDF lleva caracteres fuera de WinAnsi',
    conRaros.length === 0, conRaros.slice(0, 3).join(' | '));
  check('el generador pasa el texto por `seguro()`', pdfSrc.includes("require('../lib/winansi')"));

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('6. El PDF se genera en los casos límite');

  const pdf = await generarExpediente(exp);
  check('caso completo', pdf.length > 2000, `${pdf.length} bytes`);

  const sinTexto = await generarExpediente(armar({
    negocio: { nombre: 'X' },
    resena: { ...resena, texto: null, autorNombre: null, autorResenasTotal: null },
    delPeriodo: [], snapshots: [],
  }));
  check('reseña de 1★ SIN texto y sin autor (el patrón de bot más común)', sinTexto.length > 1500);

  const largo = await generarExpediente(armar({
    negocio: { nombre: 'X' },
    resena: { ...resena, texto: 'palabra '.repeat(400) },
    delPeriodo: [], snapshots: [],
  }));
  check('un texto larguísimo no rompe el documento', largo.length > 2000);

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('7. La ruta no deja pedir la reseña de otro');

  const ruta = leer('src/api/routes/negocio.routes.js');
  check('el negocio se resuelve con `dondeNegocio` (alcance y pertenencia)',
    /expediente[\s\S]{0,600}dondeNegocio/.test(ruta));
  check('🔴 y la reseña se filtra además por `negocioId`',
    /findFirst\(\{\s*where:\s*\{\s*id:\s*req\.params\.resenaId,\s*negocioId:\s*negocio\.id/.test(ruta),
    'filtrar solo por id dejaría pedir la reseña de una ficha ajena pasando el negocio propio');

  // ═══════════════════════════════════════════════════════════════════════════
  titulo('8. El código verificable (2026-09-20)');

  // 🔴 Lo que convierte el PDF en un documento contrastable. Sin esto es un
  // archivo que cualquiera edita: se le cambia el texto de la reseña o la fecha
  // y no hay forma de notarlo.
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-prueba-expediente';
  process.env.DOCUMENTOS_SECRET = process.env.DOCUMENTOS_SECRET || 'secreto-de-prueba-documentos';
  const ec = require('../src/lib/expedienteCodigo');
  const constancia = require('../src/lib/constancia');

  const negocioX = { nombre: 'Cevicheria El Muelle', googlePlaceId: 'ChIJprueba' };
  const resenaX = {
    rating: 1, autor: 'Juan P.',
    texto: '  Pesimo   servicio,\n no vuelvo  ',
    fechaResena: new Date('2026-08-15'),
    capturadaEn: new Date('2026-08-15T22:00:00Z'),
  };
  const codigo = ec.emitirCodigo({ negocio: negocioX, resena: resenaX });
  const v = ec.verificarCodigo(codigo);

  check('el código emitido se verifica', v.valida === true, v.motivo);
  check('y devuelve lo que se firmó',
    v.datos.negocio === 'Cevicheria El Muelle' && v.datos.rating === 1 && v.datos.autor === 'Juan P.');
  check('conserva la fecha en que NOSOTROS la vimos',
    v.datos.capturadaEn.getTime() === resenaX.capturadaEn.getTime(),
    'acredita que el texto estaba publicado ese día aunque después lo borren');

  // La huella es lo que ata el documento a SU contenido.
  check('la huella del texto sobrevive al reflow del PDF',
    ec.huellaTexto('Pesimo servicio, no vuelvo') === v.datos.huellaTexto,
    'el PDF recompone los saltos de línea: un salto de más no puede cambiar la huella');
  check('pero cambia si cambia UNA palabra',
    ec.huellaTexto('Pesimo servicio, si vuelvo') !== v.datos.huellaTexto);
  check('y distingue mayúsculas y tildes, que sí son contenido',
    ec.huellaTexto('Pesimo servicio, no vuelvo') !== ec.huellaTexto('Pésimo servicio, no vuelvo'));

  check('un código alterado se rechaza por FIRMA',
    ec.verificarCodigo(`${codigo.slice(0, -3)}aaa`).motivo === 'FIRMA');
  check('basura se rechaza por FORMATO',
    ec.verificarCodigo('hola').motivo === 'FORMATO' && ec.verificarCodigo(null).motivo === 'FORMATO',
    'la ruta es pública: le puede llegar cualquier cosa, incluido un código copiado a medias');

  // 🔴 La guarda cruzada. Los dos documentos se firman con el MISMO secreto, así
  // que sin el discriminador de tipo un expediente se verificaría como
  // constancia —firma válida— y la página pondría un sello de «verificado»
  // sobre campos vacíos.
  const codConstancia = constancia.emitirCodigo({
    nombre: 'X', rating: 4.5, totalResenas: 10, diasVigilado: 30, incidentes: 0, placeId: 'p',
  });
  check('🔴 la constancia RECHAZA un código de expediente',
    constancia.verificarCodigo(codigo).motivo === 'TIPO');
  check('🔴 y el expediente RECHAZA una constancia',
    ec.verificarCodigo(codConstancia).motivo === 'TIPO');
  check('CONTROL — la constancia sigue verificando las suyas',
    constancia.verificarCodigo(codConstancia).valida === true,
    'la guarda de tipo no puede romper los códigos que ya están en circulación');

  // ⚠️ Las constancias emitidas antes del discriminador no llevan `k`. Siguen
  // siendo válidas: la comprobación es «si trae tipo, que sea el mío».
  const fuenteConst = leer('src/lib/constancia.js');
  check('la guarda acepta los códigos viejos, sin `k`',
    /p\.k !== undefined && p\.k !== 'c'/.test(fuenteConst),
    'exigir el campo invalidaría todas las constancias ya emitidas');

  // La vigencia es distinta a propósito.
  check(`el expediente dura ${ec.VIGENCIA_DIAS} días, no los ${constancia.VIGENCIA_DIAS} de la constancia`,
    ec.VIGENCIA_DIAS === 365 && ec.VIGENCIA_DIAS > constancia.VIGENCIA_DIAS,
    'la constancia dice «hoy tiene 4.6★» y caduca; el expediente dice «el 15 de agosto existía esto», que es un hecho pasado — y una denuncia dura más de 90 días');

  const vencido = ec.verificarCodigo(ec.emitirCodigo({
    negocio: negocioX, resena: resenaX,
    emitidoEn: new Date(Date.now() - (ec.VIGENCIA_DIAS + 1) * 86400000),
  }));
  check('uno vencido se distingue de uno falsificado',
    vencido.motivo === 'VENCIDA' && !!vencido.datos?.negocio,
    'confundirlas sería acusar de fraude a quien solo tiene un documento viejo');

  // Sin estrella (Facebook) no se inventa un 0.
  const sinEstrella = ec.verificarCodigo(ec.emitirCodigo({
    negocio: negocioX, resena: { ...resenaX, rating: null },
  }));
  check('una reseña sin estrella viaja como null, no como 0',
    sinEstrella.datos.rating === null,
    'un «0★» impreso en una denuncia es una afirmación que la plataforma nunca hizo');

  titulo('8-bis. Está enchufado, y no bloquea el documento si falla');

  const rutaSrc = leer('src/api/routes/negocio.routes.js');
  check('la ruta emite el código y se lo pasa al PDF',
    rutaSrc.includes('emitirCodigoExpediente(') && /generarExpediente\(exp, verificacion\)/.test(rutaSrc));
  check('lo firma sobre los datos YA ARMADOS, no sobre la fila cruda',
    /emitirCodigoExpediente\(\{ negocio, resena: exp\.resena/.test(rutaSrc),
    'lo firmado tiene que ser exactamente lo que el PDF imprime');
  check('⚠️ si la firma falla, el expediente se entrega igual',
    /try \{[\s\S]{0,700}?emitirCodigoExpediente[\s\S]{0,700}?\} catch/.test(rutaSrc),
    'negarle el documento entero a quien tiene una denuncia en curso, por no poder ponerle un sello, sería el peor de los dos resultados');
  check('el PDF imprime el recuadro de verificación',
    leer('src/utils/expediente.pdf.js').includes('COMO COMPROBAR ESTE DOCUMENTO'));
  check('y la huella del texto, para poder cotejarla',
    leer('src/utils/expediente.pdf.js').includes('Huella del texto'));

  const publico = leer('src/api/routes/publico.routes.js');
  check('la ruta pública verifica los DOS documentos por la misma puerta',
    publico.includes('verificarExpediente(') && publico.includes("documento: 'EXPEDIENTE'"),
    'quien escanea un QR no sabe qué clase de papel tiene en la mano');

  const pagina = leer('../brand-shield-web/src/app/verificar/[codigo]/page.js');
  check('la página distingue el expediente de la constancia',
    pagina.includes("d?.documento === 'EXPEDIENTE'"));
  check('🔴 y repite EL LÍMITE: no determina que la reseña sea falsa',
    /No determina que la rese/.test(pagina) && /autoridad competente/.test(pagina),
    'quien verifica puede llegar ahí sin haber leído el PDF entero');

  console.log(`\n${'─'.repeat(56)}`);
  console.log(`${ok} pasadas · ${fallos} fallidas`);
  if (fallos) process.exitCode = 1;
};

correr().catch((e) => { console.error(e); process.exitCode = 1; });
