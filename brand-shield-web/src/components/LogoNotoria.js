// Marca de Notoria: la N asimétrica.
//
// Es una forma RELLENA, no un trazo, así que no entra en el sistema de
// `components/Icons.js` (que dibuja todo con stroke). Por eso vive aparte.
//
// El asta derecha sube más que la izquierda y se corta en bisel en sentido
// contrario a la diagonal: ese bisel es la identidad de la marca — una N
// simétrica sería un monograma cualquiera. No "arreglar" esa asimetría.
//
// El original a 1024px y las variantes para subir a plataformas están en
// Vigilio/marca/ (generar-logos.py reproduce todo).

// Geometría normalizada dentro de un viewBox de 24, con la letra a 18 de alto.
// Tres subtrazos (asta izquierda, diagonal, asta derecha) que se unen solos con
// la regla de relleno por defecto (nonzero).
const TRAZO =
  'M4.09 6.56H7.97V21H4.09Z' +
  'M4.09 6.56H7.97L19.91 21H16.03Z' +
  'M16.03 21V6.96L19.91 3V21Z';

export default function LogoNotoria({ size = 20, color = 'currentColor', style, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      style={style}
      className={className}
      role="img"
      aria-label="Notoria"
    >
      <path d={TRAZO} />
    </svg>
  );
}

export { TRAZO as TRAZO_MARCA };
