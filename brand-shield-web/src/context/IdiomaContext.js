'use client';
// Contexto global de idioma (es | en). Persiste en localStorage como bs_idioma.
// Las páginas definen sus diccionarios y eligen con: const t = textos[idioma].
import { createContext, useContext, useEffect, useState } from 'react';

const IdiomaContext = createContext({ idioma: 'es', cambiarIdioma: () => {} });

/**
 * Qué idioma le toca a esta persona: el que eligió, o el de su navegador.
 *
 * 🔴 Está fuera del componente y exportado porque hay DOS sitios que necesitan
 * la respuesta y uno de ellos no es un componente: el registro, que manda el
 * idioma al backend para guardarlo en la cuenta.
 *
 * Antes esa regla vivía solo dentro del `useEffect` de abajo, y la consecuencia
 * era silenciosa: `bs_idioma` únicamente se escribe cuando alguien PULSA el
 * selector, así que quien entra con el navegador en inglés ve la web en inglés
 * —la detección funciona— pero al registrarse su cuenta nacía en español. Después
 * recibía todos los correos en el idioma que no era, y el trabajo de traducirlos
 * no le llegaba nunca.
 */
export const idiomaPreferido = () => {
  try {
    const guardado = localStorage.getItem('bs_idioma');
    if (guardado === 'en' || guardado === 'es') return guardado;
    return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'es';
  } catch {
    return 'es';
  }
};

export function IdiomaProvider({ children }) {
  const [idioma, setIdioma] = useState('es');

  useEffect(() => {
    setIdioma(idiomaPreferido());
  }, []);

  // 🔴 `lang` del documento, en UN solo sitio y no dentro de cambiarIdioma.
  //
  // Antes solo se ajustaba al pulsar el selector, así que el caso más común se
  // quedaba fuera: alguien con el navegador en inglés ve la web entera en inglés
  // —la detección automática de arriba funciona— pero el HTML seguía diciendo
  // `lang="es"`. Verificado en vivo: navigator.language "en-US", contenido en
  // inglés, `documentElement.lang` = "es". Eso hace que un lector de pantalla lo
  // narre con voz española y que Google lo indexe como si fuera español.
  //
  // Aquí depende de `idioma`, así que cubre los dos caminos: la deteccion inicial
  // y el cambio manual.
  useEffect(() => {
    try { document.documentElement.lang = idioma; } catch {}
  }, [idioma]);

  const cambiarIdioma = (nuevo) => {
    if (nuevo !== 'es' && nuevo !== 'en') return;
    setIdioma(nuevo);
    try { localStorage.setItem('bs_idioma', nuevo); } catch {}
  };

  return (
    <IdiomaContext.Provider value={{ idioma, cambiarIdioma }}>
      {children}
    </IdiomaContext.Provider>
  );
}

export const useIdioma = () => useContext(IdiomaContext);
