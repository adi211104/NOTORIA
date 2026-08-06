'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '../lib/api';
import { useIdioma } from './IdiomaContext';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorConexion, setErrorConexion] = useState(false);
  const router = useRouter();
  const { idioma, cambiarIdioma } = useIdioma();

  // Sincroniza el idioma guardado en el backend hacia el frontend (multi-dispositivo)
  useEffect(() => {
    if (usuario?.idioma && usuario.idioma !== idioma) cambiarIdioma(usuario.idioma);
  }, [usuario?.idioma]);

  // El tema ya se resuelve (guardado o preferencia del sistema) en el script
  // inline "theme-init" de layout.js, antes de que este componente monte —
  // no hace falta (ni conviene) volver a aplicarlo aquí.

  // Cargar sesión al montar
  useEffect(() => {
    const token = localStorage.getItem('bs_token');
    if (!token) { setCargando(false); return; }

    auth.perfil()
      .then(u => { setUsuario(u); setErrorConexion(false); })
      .catch(err => {
        if (err.status === 401) {
          // Token inválido — limpiar sesión
          try { localStorage.removeItem('bs_token'); } catch {}
          setUsuario(null);
        } else if (err.type === 'NETWORK_ERROR') {
          // Backend caído — NO borrar token, preservar sesión para cuando vuelva
          setErrorConexion(true);
          setUsuario(null);
        } else {
          setUsuario(null);
        }
      })
      .finally(() => setCargando(false));
  }, []);

  // Recarga el perfil desde el backend (p. ej. tras verificar el email en otra pestaña)
  const refrescarPerfil = async () => {
    if (!localStorage.getItem('bs_token')) return null;
    try {
      const u = await auth.perfil();
      setUsuario(u);
      return u;
    } catch { return null; }
  };

  // Al volver a la pestaña, refrescar el perfil si el email sigue sin verificar
  // (el usuario suele verificar desde el link del correo en otra pestaña)
  useEffect(() => {
    const onFocus = () => {
      if (usuario && !usuario.emailVerificado) refrescarPerfil();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [usuario]);

  // `destino` permite volver a la página desde la que se pidió la sesión en vez
  // de caer siempre en /dashboard. Lo usa la compra desde /precios: quien no
  // tiene sesión inicia sesión y retoma el pago donde lo dejó. Solo se aceptan
  // rutas internas ("/algo") para que nadie pueda usar ?next= como redirección
  // abierta hacia un dominio externo.
  const rutaSegura = (destino) =>
    typeof destino === 'string' && /^\/(?!\/)/.test(destino) ? destino : null;

  const login = async (email, password, destino) => {
    const data = await auth.login({ email, password });
    localStorage.setItem('bs_token', data.token);
    setUsuario(data.usuario);
    router.push(rutaSegura(destino) || '/dashboard');
  };

  const registro = async (nombre, email, password, destino) => {
    const data = await auth.registro({ nombre, email, password });
    localStorage.setItem('bs_token', data.token);
    localStorage.removeItem('bs_onboarding');
    setUsuario(data.usuario);
    router.push(rutaSegura(destino) || '/onboarding');
  };

  const loginConGoogle = async (token, esNuevo, destino) => {
    localStorage.setItem('bs_token', token);
    if (esNuevo) localStorage.removeItem('bs_onboarding');
    try {
      const perfil = await auth.perfil();
      setUsuario(perfil);
    } catch {}
    router.push(rutaSegura(destino) || (esNuevo ? '/onboarding' : '/dashboard'));
  };

  const logout = () => {
    try {
      localStorage.removeItem('bs_token');
      localStorage.removeItem('bs_onboarding');
      localStorage.removeItem('bs_pais');
    } catch {}
    setUsuario(null);
    setErrorConexion(false);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ usuario, cargando, errorConexion, login, registro, loginConGoogle, logout, refrescarPerfil }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
