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

  const cambiarIdioma = (nuevo) => {
    if (nuevo !== 'es' && nuevo !== 'en') return;
    setIdioma(nuevo);
    try { localStorage.setItem('bs_idioma', nuevo); } catch {}
    try { document.documentElement.lang = nuevo; } catch {}
  };

  return (
    <IdiomaContext.Provider value={{ idioma, cambiarIdioma }}>
      {children}
    </IdiomaContext.Provider>
  );
}

export const useIdioma = () => useContext(IdiomaContext);
