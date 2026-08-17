// Enlace de venta personalizado: usenotoria.app/para/<slug>~<placeId>
//
// Es la landing que se le manda a UN prospecto por WhatsApp. En vez del discurso
// genérico, abre con el nombre de su negocio, su rating real, cómo está frente a
// los vecinos de su rubro y qué reseña vieja sigue encabezando su ficha.
//
// ── Por qué es un Server Component ──────────────────────────────────────────
// Por la vista previa de WhatsApp. Media efectividad del enlace está en que, al
// pegarlo en el chat, el prospecto vea una tarjeta que ya dice el nombre de su
// restaurante y su nota. Eso son etiquetas Open Graph, y las etiquetas hay que
// tenerlas en el HTML que sale del servidor — un componente de cliente las
// generaría demasiado tarde, cuando el crawler de WhatsApp ya se fue.
//
// ── Lo que NO es ────────────────────────────────────────────────────────────
// No es una publicación sobre un negocio ajeno. Es material comercial dirigido a
// una persona, y por eso lleva tres frenos:
//   1. `robots: noindex, nofollow` acá abajo, y /para/ en Disallow del robots.txt
//   2. lista de bloqueo en el backend (PARA_BLOQUEADOS) para retirar una ficha
//      cambiando una variable de entorno, sin desplegar
//   3. un aviso visible al pie con cómo pedir que se retire
// Todo lo que se muestra es información pública de Google Maps: exactamente la
// que ve cualquiera que busque ese negocio.

import Link from 'next/link';
import { CONTACTO } from '../../../components/PieLegal';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// El segmento es `<slug-legible>~<placeId>`. El slug es decorativo —está para que
// el enlace se vea bien en el chat— y el placeId es lo único que se usa.
//
// El separador es `~` y no `-` a propósito: los place IDs de Google llevan
// guiones dentro (ChIJ01sth-G3BZER...), así que partir por guion devolvería
// cualquier cosa. `~` no aparece nunca en un place ID.
const placeIdDe = (ficha) => {
  const bruto = decodeURIComponent(ficha || '');
  const i = bruto.lastIndexOf('~');
  return (i >= 0 ? bruto.slice(i + 1) : bruto).trim();
};

const traerFicha = async (placeId) => {
  try {
    const r = await fetch(`${API}/api/publico/ficha?placeId=${encodeURIComponent(placeId)}`, {
      // Una hora de caché en Vercel además de las 6 h del backend: un enlace que
      // se reenvía en un grupo de WhatsApp no puede convertirse en cien
      // consultas a Google.
      next: { revalidate: 3600 },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
};

export async function generateMetadata({ params }) {
  const { ficha } = await params;
  const d = await traerFicha(placeIdDe(ficha));

  // Sin datos no se inventa un título: se deja el genérico y ya.
  if (!d) {
    return { title: 'Notoria', robots: { index: false, follow: false } };
  }

  const titulo = `${d.nombre} — ${d.rating.toFixed(1)}★ en Google`;
  const desc = d.competencia
    ? `${d.totalResenas} reseñas. El promedio de tu zona es ${d.competencia.promedio.toFixed(1)}★ y el mejor está en ${d.competencia.mejor.toFixed(1)}★. Mira el detalle.`
    : `${d.totalResenas} reseñas en Google. Mira qué está pasando con tu reputación.`;

  return {
    title: titulo,
    description: desc,
    // 🔴 Esto es lo que de verdad mantiene la página fuera de los buscadores.
    // El robots.txt es el refuerzo, no el mecanismo.
    robots: { index: false, follow: false, nocache: true },
    openGraph: { title: titulo, description: desc, type: 'website' },
    twitter: { card: 'summary', title: titulo, description: desc },
  };
}

// ── Piezas ──────────────────────────────────────────────────────────────────

const Estrellas = ({ n }) => (
  <span style={{ color: '#E8A33D', letterSpacing: 1 }} aria-hidden="true">
    {'★'.repeat(Math.round(n))}{'☆'.repeat(Math.max(0, 5 - Math.round(n)))}
  </span>
);

const Bloque = ({ children, style }) => (
  <section style={{
    background: 'var(--surface)', border: '1px solid var(--border-c)',
    borderRadius: 12, padding: '20px 22px', ...style,
  }}>{children}</section>
);

const Titulillo = ({ children }) => (
  <h2 style={{
    fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
    color: 'var(--text-3)', margin: '0 0 12px', fontWeight: 600,
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
  }}>{children}</h2>
);

const antiguedad = (d) =>
  d < 30 ? `hace ${d} día${d === 1 ? '' : 's'}`
    : d < 365 ? `hace ${Math.round(d / 30)} meses`
      : `hace ${Math.floor(d / 365)} año${Math.floor(d / 365) === 1 ? '' : 's'}`;

// ── Página ──────────────────────────────────────────────────────────────────

export default async function PaginaPara({ params }) {
  const { ficha } = await params;
  const d = await traerFicha(placeIdDe(ficha));

  if (!d) {
    return (
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '80px 22px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 30, margin: '0 0 12px' }}>
          Este enlace ya no está disponible
        </h1>
        <p style={{ color: 'var(--text-2)', lineHeight: 1.7, margin: '0 0 24px' }}>
          Puede que la ficha haya cambiado o que se haya retirado a pedido del negocio.
        </p>
        <Link href="/" style={{ color: 'var(--accent)' }}>Ir a Notoria →</Link>
      </main>
    );
  }

  const sim = d.simulador;
  const brecha = d.competencia?.brecha ?? null;

  return (
    <main style={{ maxWidth: 620, margin: '0 auto', padding: '48px 22px 90px' }}>

      {/* Cabecera: su nombre primero. Es lo que hace que no parezca publicidad. */}
      <p style={{
        fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
        color: 'var(--accent)', margin: '0 0 14px', fontWeight: 600,
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      }}>
        Revisamos tu ficha de Google
      </p>

      <h1 style={{
        fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400,
        fontSize: 'clamp(30px, 7vw, 44px)', lineHeight: 1.1, letterSpacing: '-.015em',
        margin: '0 0 10px', textWrap: 'balance',
      }}>
        {d.nombre}
      </h1>
      {d.direccion && (
        <p style={{ color: 'var(--text-3)', fontSize: 13.5, margin: '0 0 26px' }}>{d.direccion}</p>
      )}

      {/* La ficha cerrada desplaza a todo lo demás */}
      {d.estadoFicha && (
        <Bloque style={{ background: 'rgba(200,60,50,0.10)', borderColor: 'rgba(200,60,50,0.45)', marginBottom: 14 }}>
          <p style={{ margin: 0, color: '#C43C32', fontWeight: 700, fontSize: 15, lineHeight: 1.6 }}>
            Tu ficha aparece como CERRADA en Google Maps. Mientras diga eso, dejas de salir a quien busca en tu zona.
          </p>
        </Bloque>
      )}

      {/* Rating + comparación con los vecinos: el argumento que más pesa */}
      <Bloque style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: d.competencia ? 20 : 0 }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 52, lineHeight: 1, fontWeight: 400 }}>
            {d.rating.toFixed(1)}
          </span>
          <span style={{ fontSize: 15 }}><Estrellas n={d.rating} /></span>
          <span style={{ color: 'var(--text-2)', fontSize: 14 }}>{d.totalResenas} reseñas en Google</span>
        </div>

        {d.competencia && (
          <>
            <Titulillo>Tu rubro, a menos de 2 km</Titulillo>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* El negocio del prospecto va en la lista, destacado: verse
                  ordenado junto a los vecinos es el momento en que entiende. */}
              {[{ nombre: d.nombre, rating: d.rating, totalResenas: d.totalResenas, tuyo: true }, ...d.competencia.vecinos]
                .sort((a, b) => b.rating - a.rating)
                .map((v, i) => (
                  <li key={`${v.nombre}-${i}`} style={{
                    display: 'flex', justifyContent: 'space-between', gap: 12,
                    padding: '9px 12px', borderRadius: 8,
                    background: v.tuyo ? 'var(--accent-t)' : 'var(--surface2)',
                    border: `1px solid ${v.tuyo ? 'var(--accent-b)' : 'var(--border-c)'}`,
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: v.tuyo ? 700 : 400, color: 'var(--text)' }}>
                      {v.nombre}{v.tuyo ? ' (tú)' : ''}
                    </span>
                    <span style={{ fontSize: 13.5, color: 'var(--text-2)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {v.rating.toFixed(1)}★
                    </span>
                  </li>
                ))}
            </ul>
            {brecha !== null && brecha > 0 && (
              <p style={{ color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.65, margin: '14px 0 0' }}>
                Te separan <strong style={{ color: 'var(--text)' }}>{brecha.toFixed(1)} puntos</strong> del mejor de tu zona.
                Entre ustedes dos elige el cliente que busca en Google.
              </p>
            )}
          </>
        )}
      </Bloque>

      {/* La reseña vieja que sigue en portada: el espejo, en versión pública */}
      {d.negativaVieja && d.negativaVieja.diasAtras > 45 && (
        <Bloque style={{ marginBottom: 14 }}>
          <Titulillo>Esto es lo que ve un cliente nuevo</Titulillo>
          <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
            <span style={{ color: '#E8A33D' }}>{'★'.repeat(d.negativaVieja.rating)}</span>{' '}
            <strong style={{ color: 'var(--text)' }}>{d.negativaVieja.autorNombre}</strong>
            <span style={{ color: 'var(--text-3)' }}> · {antiguedad(d.negativaVieja.diasAtras)}</span>
          </p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.7, fontStyle: 'italic' }}>
            “{d.negativaVieja.extracto}”
          </p>
          <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.65, margin: '14px 0 0' }}>
            Google no le enseña a un cliente nuevo tus reseñas más recientes, sino las que considera relevantes.
            Por eso una crítica de hace meses sigue pesando hoy.
          </p>
        </Bloque>
      )}

      {/* Reseñas sospechosas, si las hay */}
      {d.sospechosas > 0 && d.muestra && (
        <Bloque style={{ marginBottom: 14, background: 'rgba(200,60,50,0.07)', borderColor: 'rgba(200,60,50,0.3)' }}>
          <Titulillo>Detectamos algo raro</Titulillo>
          <p style={{ margin: '0 0 8px', fontSize: 14.5, fontWeight: 700, color: '#C43C32' }}>
            {d.sospechosas === 1 ? '1 reseña sospechosa' : `${d.sospechosas} reseñas sospechosas`} entre las últimas {d.resenasAnalizadas}
          </p>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.7 }}>
            <span style={{ color: '#E8A33D' }}>{'★'.repeat(d.muestra.rating)}</span> “{d.muestra.extracto}” — {d.muestra.autorNombre}
            <br /><strong style={{ color: 'var(--text)' }}>Motivo:</strong> {d.muestra.motivo}
          </p>
        </Bloque>
      )}

      {/* La aritmética de su propia ficha */}
      {sim && (
        <Bloque style={{ marginBottom: 22 }}>
          <Titulillo>Qué tan expuesto estás</Titulillo>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sim.paraCaerDelUmbral != null && (
              <li style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65 }}>
                Te bastan <strong style={{ color: 'var(--text)' }}>{sim.paraCaerDelUmbral} reseña{sim.paraCaerDelUmbral === 1 ? '' : 's'} de 1★</strong> para
                caer por debajo de 4.5★, el filtro con el que el 31% de los consumidores descarta un negocio.
              </li>
            )}
            {!sim.sobreUmbral && sim.metas?.find((m) => m.objetivo === 4.5) && (
              <li style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65 }}>
                Estás por debajo de 4.5★. Para volver a cruzarlo necesitas{' '}
                <strong style={{ color: 'var(--text)' }}>{sim.metas.find((m) => m.objetivo === 4.5).resenas} reseñas de 5★</strong>.
              </li>
            )}
            {(() => {
              const a = sim.ataques?.find((x) => x.cambio !== 0);
              return a ? (
                <li style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65 }}>
                  Con <strong style={{ color: 'var(--text)' }}>{a.cuantas} reseñas de 1★</strong> tu ficha pasa
                  de {a.ratingAntes.toFixed(1)}★ a <strong style={{ color: 'var(--text)' }}>{a.ratingDespues.toFixed(1)}★</strong>.
                </li>
              ) : null;
            })()}
          </ul>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '14px 0 0', lineHeight: 1.55 }}>
            Cálculo sobre el rating y el número de reseñas de tu propia ficha. El umbral de 4.5★ es de
            BrightLocal, Local Consumer Review Survey 2026.
          </p>
        </Bloque>
      )}

      {/* CTA */}
      <div style={{ textAlign: 'center' }}>
        <Link href="/registro" style={{
          display: 'inline-block', background: 'var(--accent)', color: '#fff',
          padding: '14px 30px', borderRadius: 8, fontSize: 15.5, fontWeight: 700,
          textDecoration: 'none',
        }}>
          Vigilar mi ficha gratis →
        </Link>
        <p style={{ color: 'var(--text-3)', fontSize: 12.5, margin: '12px 0 0', lineHeight: 1.6 }}>
          Sin tarjeta · 1 negocio gratis para siempre · Te avisamos por correo si algo se mueve
        </p>
      </div>

      {/* Procedencia y retiro. No es letra pequeña por cumplir: si alguien llega
          acá y se pregunta «¿de dónde sacaron esto?», la respuesta tiene que
          estar en la propia página. */}
      <footer style={{
        marginTop: 46, paddingTop: 20, borderTop: '1px solid var(--border-c)',
        color: 'var(--text-3)', fontSize: 12, lineHeight: 1.7,
      }}>
        <p style={{ margin: '0 0 8px' }}>
          Todo lo que ves acá es información pública de Google Maps: el mismo rating y las mismas reseñas
          que vería cualquier persona buscando este negocio. Notoria no publica nada en tu nombre ni
          interactúa con tus reseñas.
        </p>
        <p style={{ margin: 0 }}>
          ¿Es tu negocio y prefieres que retiremos esta página? Escríbenos a{' '}
          <a href={`mailto:${CONTACTO.email}`} style={{ color: 'var(--accent)' }}>{CONTACTO.email}</a>{' '}
          y la quitamos el mismo día. · <Link href="/privacidad" style={{ color: 'var(--text-3)' }}>Privacidad</Link>
        </p>
      </footer>
    </main>
  );
}
