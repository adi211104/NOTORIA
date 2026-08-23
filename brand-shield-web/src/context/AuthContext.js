'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { idiomaPreferido } from './IdiomaContext';
import { auth, setCuentaActiva, CLAVE_CUENTA } from '../lib/api';
import { useIdioma } from './IdiomaContext';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorConexion, setErrorConexion] = useState(false);
  // Motivo por el que se salió de una cuenta compartida sin pedirlo. Se muestra
  // una vez y se limpia: es una explicación, no un estado permanente.
  const [avisoCuenta, setAvisoCuenta] = useState(null);
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
        // 🔴 Salida de emergencia de la cuenta compartida.
        //
        // Si el dueño te quita el acceso o baja de plan mientras tienes la
        // sesión abierta, TODAS las peticiones empiezan a devolver 403 con la
        // cuenta guardada en localStorage — incluida esta. Sin este rescate el
        // panel se queda inservible y la única salida sería borrar el
        // almacenamiento del navegador, cosa que nadie sabe hacer.
        if (err.status === 403 && (err.datos?.tipo === 'SIN_ACCESO_CUENTA' || err.datos?.tipo === 'SIN_ASIENTO')) {
          setCuentaActiva('');
          setAvisoCuenta(err.message);
          auth.perfil().then(u => { setUsuario(u); setErrorConexion(false); }).catch(() => setUsuario(null));
          return;
        }
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
    setCuentaActiva('');
    setUsuario(data.usuario);
    router.push(rutaSegura(destino) || '/dashboard');
  };

  const registro = async (nombre, email, password, destino) => {
    // El idioma viaja en el alta. Sin esto toda cuenta nacía con el default
    // 'es', y quien navegaba en inglés recibía todos los correos en español sin
    // enterarse de que había un selector en Configuración.
    const data = await auth.registro({ nombre, email, password, idioma: idiomaPreferido() });
    localStorage.setItem('bs_token', data.token);
    setCuentaActiva('');
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

  /**
   * Entra a trabajar en otra cuenta (o vuelve a la propia con id vacío).
   *
   * Recarga la página entera en vez de sólo refrescar el perfil, y es
   * deliberado: media docena de pantallas del panel guardan en su propio estado
   * negocios, alertas y comentarios de la cuenta anterior. Refrescar sólo el
   * perfil dejaría el nombre de una empresa arriba y los datos de otra debajo,
   * que es peor que tardar un segundo.
   */
  const cambiarCuenta = (id) => {
    const propia = !id || id === usuario?.id;
    setCuentaActiva(propia ? '' : id);
    window.location.href = '/dashboard';
  };

  const logout = () => {
    try {
      localStorage.removeItem('bs_token');
      localStorage.removeItem('bs_onboarding');
      localStorage.removeItem('bs_pais');
      // Sin esto, el siguiente que entre en este navegador arrancaría dentro de
      // la cuenta compartida del anterior.
      localStorage.removeItem(CLAVE_CUENTA);
    } catch {}
    setUsuario(null);
    setErrorConexion(false);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{
      usuario, cargando, errorConexion, login, registro, loginConGoogle, logout, refrescarPerfil,
      // Equipo. `puede` es el atajo que usan las pantallas para esconder botones;
      // el backend vuelve a comprobarlo en cada ruta, porque esconder un botón
      // no es una defensa, es una cortesía.
      rol: usuario?.rol || 'PROPIETARIO',
      puede: (permiso) => (usuario?.permisos || ['ver','actuar','negocios','conexiones','facturacion','equipo']).includes(permiso),
      cuenta: usuario?.cuenta || null,
      cuentas: usuario?.cuentas || [],
      cuentaCompartida: !!(usuario?.cuenta && usuario.cuenta.propia === false),
      cambiarCuenta, avisoCuenta, limpiarAvisoCuenta: () => setAvisoCuenta(null),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
};
