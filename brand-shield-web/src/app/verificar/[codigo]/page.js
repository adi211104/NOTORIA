// Verificación pública de una Constancia de Reputación Online.
//
// La abre quien RECIBE el documento —un centro comercial que evalúa a quién le
// alquila, un franquiciante, un banco—, normalmente escaneando el QR impreso.
// Por eso no pide registro y por eso el veredicto tiene que leerse en un segundo:
// esa persona no quiere entender Notoria, quiere saber si el papel es bueno.
//
// Se renderiza en el servidor para que el veredicto esté en el HTML: si alguien
// comparte el enlace, la vista previa ya dice si la constancia es válida.

import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const verificar = async (codigo) => {
  try {
    const r = await fetch(`${API}/api/publico/verificar/${encodeURIComponent(codigo)}`, {
      // Sin caché: el veredicto depende de la fecha de hoy —una constancia vence—
      // y cachear un "válida" que mañana ya no lo es sería justo el error que
      // este documento no se puede permitir.
      cache: 'no-store',
    });
    return await r.json();
  } catch {
    return null;
  }
};

export async function generateMetadata({ params }) {
  const { codigo } = await params;
  const d = await verificar(codigo);
  // Desde el 2026-09-20 por esta misma puerta entran DOS documentos: la
  // constancia y el expediente de una reseña. El backend dice cuál es; quien
  // escanea un QR no tiene por qué saberlo de antemano.
  const esExp = d?.documento === 'EXPEDIENTE';
  const titulo = d?.valida
    ? (esExp ? `Expediente válido — ${d.negocio}` : `Constancia válida — ${d.nombre}`)
    : 'Verificación de documento — Notoria';
  return {
    title: titulo,
    description: 'Comprueba la autenticidad de un documento emitido por Notoria.',
    // No tiene sentido indexar la verificación de un documento concreto
    robots: { index: false, follow: false },
    openGraph: { title: titulo, type: 'website' },
  };
}

const fecha = (iso) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });

const Dato = ({ etiqueta, valor }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', gap: 16,
    padding: '11px 0', borderBottom: '1px solid var(--border-c)',
  }}>
    <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>{etiqueta}</span>
    <span style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, textAlign: 'right' }}>{valor}</span>
  </div>
);

export default async function PaginaVerificar({ params }) {
  const { codigo } = await params;
  const d = await verificar(codigo);

  const caida = !d;
  const valida = !!d?.valida;
  // Una constancia vencida NO es una falsificación, y la página no puede
  // sugerirlo: quien la tiene delante solo tiene un papel viejo.
  const vencida = d?.motivo === 'VENCIDA';

  // Qué documento tiene delante quien verifica. El backend lo dice; por defecto
  // se asume constancia, que es lo que existía antes y lo que llevan los códigos
  // emitidos hasta el 2026-09-20.
  const esExpediente = d?.documento === 'EXPEDIENTE';
  const N = esExpediente
    ? { valido: 'Expediente válido', vencido: 'Expediente vencido', invalido: 'Expediente no válido' }
    : { valido: 'Constancia válida', vencido: 'Constancia vencida', invalido: 'Constancia no válida' };

  const color = valida ? '#0B7324' : vencida ? '#B45309' : '#B91C1C';
  const titulo = caida ? (esExpediente ? 'No pudimos verificarlo ahora' : 'No pudimos verificarla ahora')
    : valida ? N.valido
      : vencida ? N.vencido
        : N.invalido;

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '56px 22px 90px' }}>
      <p style={{
        fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
        color: 'var(--text-3)', margin: '0 0 18px', fontWeight: 600,
      }}>
        Verificación de documento · Notoria
      </p>

      <div style={{
        border: `1px solid ${color}55`, background: `${color}14`,
        borderRadius: 12, padding: '22px 24px', marginBottom: 20,
      }}>
        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400,
          fontSize: 'clamp(24px, 5.5vw, 32px)', lineHeight: 1.15, margin: 0, color,
        }}>
          {titulo}
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.65, color: 'var(--text-2)' }}>
          {caida
            ? 'No pudimos conectar con el servicio de verificación. Vuelve a intentarlo en unos minutos.'
            : valida
              ? (esExpediente
                ? 'Este expediente fue emitido por Notoria y los hechos que recoge no han sido alterados.'
                : 'Este documento fue emitido por Notoria y sus datos no han sido alterados.')
              : d.mensaje}
        </p>
      </div>

      {/* ── Expediente de una reseña ──────────────────────────────────────
          🔴 Lo que acredita es acotado y la página lo dice igual que el PDF:
          que Notoria REGISTRÓ ese texto, de ese autor, ese día. No que la
          reseña sea falsa ni que haya habido extorsión — eso lo determina la
          plataforma o la autoridad. */}
      {(valida || vencida) && esExpediente && d.negocio && (
        <section style={{
          background: 'var(--surface)', border: '1px solid var(--border-c)',
          borderRadius: 12, padding: '8px 22px 18px', marginBottom: 20,
        }}>
          <Dato etiqueta="Establecimiento" valor={d.negocio} />
          {valida && (
            <>
              {d.rating != null && <Dato etiqueta="Calificación de la reseña" valor={`${d.rating} de 5`} />}
              {d.autor && <Dato etiqueta="Autor según la plataforma" valor={d.autor} />}
              {d.fechaResena && <Dato etiqueta="Fecha de la reseña" valor={fecha(d.fechaResena)} />}
              {/* La mitad del valor del documento: acredita que el texto estaba
                  publicado ese día, aunque después se haya editado o borrado. */}
              {d.capturadaEn && <Dato etiqueta="Registrada por Notoria el" valor={fecha(d.capturadaEn)} />}
              {d.huellaTexto && <Dato etiqueta="Huella del texto" valor={d.huellaTexto} />}
            </>
          )}
          <Dato etiqueta="Emitido el" valor={fecha(d.emitido)} />
          <Dato etiqueta={vencida ? 'Venció el' : 'Verificable hasta'} valor={fecha(d.vence)} />
        </section>
      )}

      {valida && esExpediente && d.huellaTexto && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7, margin: '-6px 0 22px' }}>
          La <strong>huella del texto</strong> corresponde al contenido de la reseña tal como Notoria lo
          registró. Si la que aparece impresa en el documento es distinta a esta, el texto fue
          modificado después de emitirlo.
        </p>
      )}

      {(valida || vencida) && !esExpediente && d.nombre && (
        <section style={{
          background: 'var(--surface)', border: '1px solid var(--border-c)',
          borderRadius: 12, padding: '8px 22px 18px', marginBottom: 20,
        }}>
          <Dato etiqueta="Establecimiento" valor={d.nombre} />
          {valida && (
            <>
              <Dato etiqueta="Calificación en Google" valor={`${Number(d.rating).toFixed(1)} de 5`} />
              <Dato etiqueta="Total de reseñas" valor={String(d.totalResenas)} />
              <Dato etiqueta="Días bajo monitoreo" valor={String(d.diasVigilado)} />
              {/* Solo si la constancia lo trae. Las emitidas antes del
                  2026-08-25 no llevan score y siguen siendo válidas: la firma se
                  recalcula sobre el payload tal cual, así que un campo nuevo no
                  invalida los códigos viejos. `null` distingue «constancia
                  anterior al score» de «sacó cero». */}
              {d.score != null && (
                <Dato etiqueta="Score de reputación" valor={`${d.score} de 100`} />
              )}
              <Dato
                etiqueta="Incidencias registradas"
                valor={d.incidentes > 0 ? String(d.incidentes) : 'Ninguna'}
              />
            </>
          )}
          <Dato etiqueta="Emitida el" valor={fecha(d.emitida)} />
          <Dato etiqueta={vencida ? 'Venció el' : 'Válida hasta'} valor={fecha(d.vence)} />
        </section>
      )}

      {/* El alcance va en la página, no solo en el PDF: quien verifica puede
          llegar aquí sin haber leído el documento entero. */}
      <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.7, margin: '0 0 26px' }}>
        {esExpediente ? (
          <>
            Este expediente acredita únicamente que Notoria (NOTORIA E.I.R.L., RUC 20616239466)
            registró esa reseña, con ese texto y en esa fecha, a partir de información pública de la
            plataforma. <strong>No determina que la reseña sea falsa ni que haya habido un delito</strong>:
            eso lo decide la plataforma o la autoridad competente. No constituye asesoría legal ni
            peritaje. Los datos viajan firmados dentro del propio código: por eso se pueden comprobar
            sin consultar ningún registro.
          </>
        ) : (
          <>
            Esta constancia acredita únicamente información pública de Google Maps, recogida y fechada por
            Notoria (NOTORIA E.I.R.L., RUC 20616239466). No certifica la calidad del servicio del
            establecimiento, ni opina sobre su solvencia, ni tiene valor tributario. Los datos viajan
            firmados dentro del propio código: por eso se pueden comprobar sin consultar ningún registro.
          </>
        )}
      </p>

      <div style={{ textAlign: 'center' }}>
        <Link href="/" style={{
          display: 'inline-block', border: '1px solid var(--border-c)', color: 'var(--text-2)',
          padding: '11px 22px', borderRadius: 8, fontSize: 14, textDecoration: 'none',
        }}>
          Qué es Notoria
        </Link>
      </div>
    </main>
  );
}
