'use client';
// Contexto global de idioma (es | en). Persiste en localStorage como bs_idioma.
// Las páginas definen sus diccionarios y eligen con: const t = textos[idioma].
import { createContext, useContext, useEffect, useState } from 'react';

const IdiomaContext = createContext({ idioma: 'es', cambiarIdioma: () => {} });

export function IdiomaProvider({ children }) {
  const [idioma, setIdioma] = useState('es');

  useEffect(() => {
    try {
      const guardado = localStorage.getItem('bs_idioma');
      if (guardado === 'en' || guardado === 'es') {
        setIdioma(guardado);
      } else {
        // Sin preferencia guardada: usar el idioma del sistema/navegador
        const sistema = (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'es';
        setIdioma(sistema);
      }
    } catch {}
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
