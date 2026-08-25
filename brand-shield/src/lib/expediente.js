// brand-shield/src/lib/expediente.js
//
// El expediente de una reseña: todo lo que Notoria sabe de ella, ordenado para
// que sirva ante Google, ante la Policía o ante un abogado.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// El patrón es conocido y no está escrito en ninguna parte en español: alguien
// deja 1★ y acto seguido escribe por privado ofreciendo quitarla a cambio de una
// comida gratis o de plata. El dueño paga, o bloquea a la persona —y al
// bloquearla borra la única prueba de que hubo una exigencia de dinero.
//
// Lo que Notoria puede hacer y a mano nadie hace bien es **reunir la evidencia
// del lado que a él no le pertenece**: el texto exacto de la reseña y su fecha,
// aunque después la editen o la borren; cuándo la detectamos nosotros; qué
// señales levantó el detector; y cómo se movió el rating y el volumen de la
// ficha alrededor de ese día. Eso último es lo que convierte «me dejaron una
// mala reseña» en «el 14 de marzo entraron cuatro reseñas en seis horas cuando
// esta ficha recibe dos al mes».
//
// ── EL LÍMITE, Y NO ES NEGOCIABLE ───────────────────────────────────────────
//
// 🔴 El producto **arma la evidencia y explica el procedimiento**. No da
// asesoría legal y NO afirma que una reseña sea falsa: eso lo determina Google o
// la autoridad, nunca una plataforma. Es la misma regla que ya gobierna al
// detector, que dice «probabilidad de comportamiento anómalo» y jamás «esta
// reseña es falsa». Un documento que acusara a una persona identificable de un
// delito, con el logo de Notoria encima, sería un problema nuestro y no suyo.
//
// Por eso el expediente:
//   · describe hechos con fecha y no los califica;
//   · llama a las señales del detector «señales», y dice cuántas reseñas del
//     periodo las levantaron, sin concluir nada;
//   · lleva impresa la advertencia de que no es un peritaje ni asesoría legal;
//   · y en la sección de qué adjuntar deja claro que las capturas de la
//     conversación las aporta el dueño, porque son lo único que Notoria no ve.
//
// ⚠️ Lo que NO hace y es a propósito: no guarda las capturas del chat. Haría
// falta almacenamiento de archivos (el disco de Railway es efímero) y sobre todo
// custodiar prueba de un caso ajeno, con datos personales de un tercero
// identificable. El dueño las adjunta él a su denuncia; el expediente le dice
// exactamente cuáles y por qué.

const VENTANA_DIAS = 7;

/**
 * ¿Cuántas reseñas entraron cerca de esta, y cómo se movió la ficha?
 *
 * Todo sale de datos ya guardados: cero llamadas a Google.
 *
 * @param {object} resena       la reseña señalada
 * @param {Array}  delPeriodo   reseñas del negocio dentro de la ventana
 * @param {Array}  snapshots    snapshots del negocio, cualquier orden
 */
const contexto = (resena, delPeriodo = [], snapshots = []) => {
  const centro = new Date(resena.fechaResena || resena.detectadaEn).getTime();
  const media = VENTANA_DIAS * 24 * 3600 * 1000;

  const cerca = delPeriodo.filter((r) => {
    const t = new Date(r.fechaResena || r.detectadaEn).getTime();
    return Number.isFinite(t) && Math.abs(t - centro) <= media;
  });

  // El snapshot inmediatamente ANTERIOR y el inmediatamente POSTERIOR al día de
  // la reseña. Son los dos únicos que dicen algo: comparar contra el de hoy
  // mezclaría el efecto de la reseña con todo lo que pasó después.
  const ordenados = [...snapshots]
    .filter((s) => Number.isFinite(new Date(s.tomadoEn).getTime()))
    .sort((a, b) => new Date(a.tomadoEn) - new Date(b.tomadoEn));

  const antes = [...ordenados].reverse().find((s) => new Date(s.tomadoEn).getTime() <= centro) || null;
  const despues = ordenados.find((s) => new Date(s.tomadoEn).getTime() > centro) || null;

  // ⚠️ `null` y no 0 cuando falta alguna de las dos medidas. Un 0 diría «la
  // ficha no se movió», que es una afirmación; `null` dice «no lo medimos», que
  // es la verdad. En un documento que puede acabar en una denuncia, la
  // diferencia importa.
  const deltaRating = antes && despues
    ? Number((despues.ratingActual - antes.ratingActual).toFixed(2))
    : null;
  const deltaResenas = antes && despues && Number.isFinite(antes.totalResenas) && Number.isFinite(despues.totalResenas)
    ? despues.totalResenas - antes.totalResenas
    : null;

  return {
    ventanaDias: VENTANA_DIAS,
    enVentana: cerca.length,
    negativasEnVentana: cerca.filter((r) => r.rating != null && r.rating <= 2).length,
    // Cuántas de las cercanas levantaron alguna señal del detector. Es un
    // CONTEO, no un veredicto: el documento dice cuántas y con qué motivo, y no
    // concluye nada a partir de eso.
    conSenal: cerca.filter((r) => r.esSospechosa).length,
    motivos: [...new Set(cerca.filter((r) => r.esSospechosa && r.motivoSospecha).map((r) => r.motivoSospecha))],
    antes: antes ? { fecha: antes.tomadoEn, rating: antes.ratingActual, total: antes.totalResenas } : null,
    despues: despues ? { fecha: despues.tomadoEn, rating: despues.ratingActual, total: despues.totalResenas } : null,
    deltaRating,
    deltaResenas,
  };
};

/**
 * Los hechos del expediente, listos para imprimir.
 *
 * No redacta ninguna conclusión: devuelve datos con fecha. La redacción —la
 * poca que hay— vive en el PDF, y es descriptiva.
 */
const armar = ({ negocio, resena, delPeriodo, snapshots, emitidoEn = new Date() }) => {
  if (!negocio || !resena) return null;

  return {
    emitidoEn,
    negocio: {
      nombre: negocio.nombre,
      direccion: negocio.direccion || null,
      placeId: negocio.googlePlaceId || null,
    },
    resena: {
      plataforma: resena.plataforma,
      rating: resena.rating,
      // 🔴 `sinEstrella` viaja: en Facebook la estrella la derivamos nosotros de
      // una recomendación, y un documento que va a una denuncia no puede
      // presentar como dato de la plataforma algo que calculamos acá.
      sinEstrella: resena.sinEstrella === true,
      texto: (resena.texto || '').trim() || null,
      autor: resena.autorNombre || null,
      autorResenasTotal: Number.isFinite(resena.autorResenasTotal) ? resena.autorResenasTotal : null,
      fechaResena: resena.fechaResena,
      // La fecha en que NOSOTROS la vimos. Es la mitad del valor del documento:
      // acredita que el texto estaba publicado ese día, aunque después se haya
      // editado o borrado.
      capturadaEn: resena.detectadaEn,
      señal: resena.esSospechosa === true,
      motivoSeñal: resena.esSospechosa ? (resena.motivoSospecha || null) : null,
      respondida: resena.respondida === true,
    },
    contexto: contexto(resena, delPeriodo, snapshots),
  };
};

module.exports = { armar, contexto, VENTANA_DIAS };
