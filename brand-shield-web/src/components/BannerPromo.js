'use client';
import { useIdioma } from '../context/IdiomaContext';
import { CATALOGO, montoEnCentimos, formatearSoles } from '../lib/catalogo';
import { nombrePlan } from '../lib/planes';

// Cartel de la promo de bienvenida (50% los 2 primeros meses).
//
// Existe porque el descuento estaba implementado pero no se anunciaba en
// ningún sitio: el cliente solo se enteraba al abrir la ventana de pago y ver
// un importe más bajo del publicado. Se muestra encima de los planes a quien
// todavía puede usarlo (visitantes sin cuenta incluidos, que son justamente el
// público de la promo) y desaparece para quien ya la gastó.

const G = '#0B7324';

// 🔴 Los importes se DERIVAN del catálogo. Estaban escritos a mano ("el plan
// Negocio te queda en S/29.50 y el Franquicia en S/89.50") — una quinta copia
// de los precios— y al añadir Impulso el cartel se quedó anunciando dos planes
// de tres, en la única pantalla donde se vende. Un precio a mano en un cartel
// de promoción es exactamente donde no puede estar.
//
// Se usa `montoEnCentimos(precio, true)`, el MISMO redondeo que aplica el
// backend: redondear en soles daría S/30.00 donde se cobra S/29.50.
const conPromo = () => CATALOGO
  .filter((c) => c.comprable && c.periodo === 'mensual')
  .map((c) => ({ plan: c.plan, precio: formatearSoles(montoEnCentimos(c.precio, true)) }));

const T = {
  es: {
    titulo: 'Promoción de bienvenida: tus 2 primeros meses a mitad de precio',
    lista: (partes) => <>Durante los 2 primeros meses, {partes}. Después se renuevan al precio de lista y puedes cancelar cuando quieras.</>,
    letra: 'Aplica solo a la facturación mensual (la anual ya tiene 20% de descuento todo el año), una vez por cuenta y una vez por tarjeta.',
    y: ' y ',
  },
  en: {
    titulo: 'Welcome offer: your first 2 months at half price',
    lista: (partes) => <>For your first 2 months, {partes}. After that they renew at list price and you can cancel anytime.</>,
    letra: 'Applies to monthly billing only (yearly already has 20% off all year), once per account and once per card.',
    y: ' and ',
  },
};

export default function BannerPromo({ compacto = false }) {
  const { idioma } = useIdioma();
  const t = T[idioma] || T.es;
  const planes = conPromo();

  // "Impulso a S/14.50, Negocio a S/29.50 y Franquicia a S/89.50" — armado a
  // partir del catálogo, así que un plan nuevo aparece solo.
  const partes = planes.map((p, i) => (
    <span key={p.plan}>
      {i > 0 && (i === planes.length - 1 ? t.y : ', ')}
      {nombrePlan(p.plan, idioma)} a <strong>S/{p.precio}</strong>
    </span>
  ));

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(115deg,#0B7324 0%,#0F8A2E 45%,#1AA83C 100%)',
      borderRadius: 10, padding: compacto ? '16px 20px' : '20px 26px',
      marginBottom: compacto ? 18 : 26,
      display: 'flex', alignItems: 'center', gap: compacto ? 14 : 20, flexWrap: 'wrap',
      boxShadow: '0 6px 22px rgba(11,115,36,0.28)',
    }}>
      {/* Brillo que cruza el cartel. Es decorativo: aria-hidden y se detiene
          si el usuario pidió menos movimiento (prefers-reduced-motion). */}
      <span aria-hidden="true" className="promo-brillo" style={{
        position: 'absolute', top: 0, left: '-60%', width: '45%', height: '100%',
        background: 'linear-gradient(100deg,transparent,rgba(255,255,255,0.42),transparent)',
        pointerEvents: 'none',
      }}/>
      <style>{`
        @keyframes promoBrillo { 0% { left:-60%; } 55% { left:120%; } 100% { left:120%; } }
        .promo-brillo { animation: promoBrillo 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .promo-brillo { animation: none; opacity: 0; } }
      `}</style>

      <div style={{
        flexShrink: 0, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.45)',
        borderRadius: 8, padding: compacto ? '7px 12px' : '9px 15px', textAlign: 'center',
      }}>
        <div style={{ fontSize: compacto ? 22 : 27, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-1px' }}>50%</div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: 1.5 }}>OFF</div>
      </div>

      <div style={{ flex: 1, minWidth: 220 }}>
        <h2 style={{ fontSize: compacto ? 15.5 : 18, fontWeight: 800, color: '#fff', margin: '0 0 5px', letterSpacing: '-0.4px' }}>
          {t.titulo}
        </h2>
        <p style={{ fontSize: compacto ? 12.5 : 13.5, color: 'rgba(255,255,255,0.93)', margin: 0, lineHeight: 1.6 }}>
          {t.lista(partes)}
        </p>
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)', margin: '7px 0 0', lineHeight: 1.55 }}>
          {t.letra}
        </p>
      </div>
    </div>
  );
}
