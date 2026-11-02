import { useState, useEffect } from 'react';
import { authClient } from '@/api/authClient';

// Último rol conocido, para que la aplicación arranque con los permisos
// correctos cuando no hay red. Se guarda junto al correo para no aplicar el rol
// de un usuario a otro que entre en el mismo dispositivo.
const CLAVE_ROL = 'webcombustible-rol-conocido';

function guardarRolConocido(usuario, fila) {
  try {
    localStorage.setItem(CLAVE_ROL, JSON.stringify({
      email: usuario.email, id: usuario.id,
      role: fila.role, status: fila.status, full_name: fila.full_name,
      permissions: fila.permissions ?? [],
    }));
  } catch { /* almacenamiento lleno o bloqueado: se seguirá pidiendo al servidor */ }
}

function leerRolConocido(email) {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_ROL) || 'null');
    return guardado?.email === email ? guardado : null;
  } catch {
    return null;
  }
}

// ¿Queda en el dispositivo una sesión que no se ha podido validar?
//
// Distingue "falta red para renovar el token" de "aquí nadie ha entrado". La
// sesión sigue siendo legítima hasta que el servidor de identidad diga lo
// contrario (entonces la borra el propio cliente de autenticación).
export function hayCredencialGuardada() {
  return authClient.haySesionGuardada();
}

// Plazo para las llamadas del arranque.
//
// Sin red, renovar el token tarda en fallar, y la aplicación se quedaba todo ese
// rato en la pantalla de carga: cualquiera da por hecho que no funciona y la
// cierra. Se arranca con lo guardado en cuanto vence el plazo, y si la respuesta
// llega más tarde el estado se corrige solo.
export const ESPERA_MAXIMA_MS = 1800;

const SIN_RESPUESTA = Symbol('sin-respuesta');

function conLimite(promesa) {
  return Promise.race([
    Promise.resolve(promesa),
    new Promise(resolver => setTimeout(() => resolver(SIN_RESPUESTA), ESPERA_MAXIMA_MS)),
  ]);
}

export function olvidarRolConocido() {
  try { localStorage.removeItem(CLAVE_ROL); } catch { /* nada que limpiar */ }
}

// Rol de la aplicación a partir de los roles que el IS asigna al usuario en este
// sistema. `admin` es el comodín del IS y equivale a superadmin. Si tuviera
// varios, manda el de más alcance. Uno desconocido nunca eleva privilegios.
const PRECEDENCIA = ['superadmin', 'operador', 'economico', 'cajero', 'auditor'];

export function rolDeApp(rolesDelIS = []) {
  const normalizados = rolesDelIS.map(r => (r === 'admin' ? 'superadmin' : r));
  return PRECEDENCIA.find(r => normalizados.includes(r)) ?? 'auditor';
}

export function useUserRole() {
  const [user, setUser]       = useState(/** @type {any} */(null));
  const [role, setRole]       = useState(null);
  const [permisos, setPermisos] = useState(/** @type {string[]} */([]));
  const [loading, setLoading] = useState(true);
  const [sesionOffline, setSesionOffline] = useState(false);

  useEffect(() => {
    let active = true;

    function aplicar(usuario, fila, offline) {
      if (!active) return;
      setUser({
        id:        usuario.id,
        email:     usuario.email,
        full_name: fila.full_name ?? usuario.name ?? usuario.email,
        role:      fila.role,
        status:    fila.status,
      });
      setRole(fila.role);
      setPermisos(fila.permissions ?? []);
      setSesionOffline(offline);
      setLoading(false);
    }

    function aplicarPerfil(usuario, perfil) {
      // Sin ningún rol en este sistema = el antiguo estado «pendiente»: la
      // cuenta existe en el IS pero un administrador aún no le ha dado acceso.
      if (perfil.sinAcceso) {
        aplicar(usuario, { role: 'auditor', status: 'pending', permissions: [] }, false);
        return;
      }
      const fila = {
        role: rolDeApp(perfil.roles),
        status: 'active',
        full_name: perfil.name ?? usuario.name,
        permissions: perfil.permissions ?? [],
      };
      guardarRolConocido(usuario, fila);
      aplicar(usuario, fila, false);
    }

    // Sin respuesta del servidor —normalmente por falta de conexión— se usa el
    // último rol conocido de este mismo usuario. Sin esto la aplicación abría
    // degradada a auditor y el operador perdía su menú y sus permisos.
    //
    // Solo afecta a lo que se muestra: la pasarela sigue aplicando los permisos
    // reales, así que manipular este valor no da acceso a nada, únicamente a ver
    // botones que fallarían al usarse.
    function aplicarGuardado(usuario) {
      const fila = leerRolConocido(usuario.email);
      if (fila) {
        aplicar(usuario, { ...fila, role: rolDeApp([fila.role]) }, true);
      } else if (active) {
        setLoading(false);
      }
    }

    async function cargar() {
      const usuario = authClient.usuarioActual();
      if (!usuario) {
        if (active) { setUser(null); setRole(null); setPermisos([]); setSesionOffline(false); setLoading(false); }
        return;
      }
      const pedido = authClient.obtenerPerfil();
      // Si la respuesta llega después del plazo, corrige lo que se mostró.
      pedido.then(p => { if (active) aplicarPerfil(usuario, p); }, () => {});
      const respuesta = await conLimite(pedido.catch(() => null));
      if (!active) return;
      if (respuesta === SIN_RESPUESTA || respuesta === null) aplicarGuardado(usuario);
    }

    cargar();

    const baja = authClient.suscribir((evento) => {
      if (!active) return;
      if (evento === 'SIGNED_OUT') {
        setUser(null); setRole(null); setPermisos([]); setSesionOffline(false); setLoading(false);
      } else if (evento === 'SIGNED_IN') {
        setLoading(true);
        cargar();
      }
    });

    return () => { active = false; baja(); };
  }, []);

  const isSuperAdmin  = role === 'superadmin';
  const isOperador    = role === 'operador';
  const isAuditor     = role === 'auditor';
  const isEconomico   = role === 'economico';
  const isCajero      = role === 'cajero';
  const isAdmin       = isSuperAdmin;

  return {
    user,
    role,
    loading,
    // Sesión recuperada del dispositivo sin validar contra el servidor: la
    // interfaz debe avisar de que no se puede guardar nada.
    sesionOffline,
    // Permisos del IS (recurso:acción). Sirven para decidir qué mostrar; quien
    // autoriza de verdad es la pasarela.
    permissions: permisos,
    can: (permiso) => permisos.includes(permiso),
    isAdmin,
    isSuperAdmin,
    isPending:   user?.status === 'pending',
    isDisabled:  user?.status === 'disabled',
    isOperador,
    isAuditor,
    isEconomico,
    isCajero,
    canWrite:               isSuperAdmin || isOperador,
    canManageCatalogos:     isSuperAdmin || isOperador,
    canManageFlota:         isSuperAdmin || isOperador,
    canManageConductores:   isSuperAdmin || isOperador,
    canImport:              isSuperAdmin || isOperador,
    canViewReportes:        isSuperAdmin || isOperador || isAuditor || isEconomico,
    // RLS restringe DELETE de consumidor/conductor/asignacion_ruta/movimiento a
    // superadmin: incluir operador aquí solo mostraba botones que siempre fallaban.
    canDelete:              isSuperAdmin,
    canRead:                isSuperAdmin || isOperador || isAuditor || isEconomico,
    // Finanzas: recargas de tarjetas, precios, saldos
    canViewFinanzas:        isSuperAdmin || isEconomico || isAuditor,
    canManageFinanzas:      isSuperAdmin || isEconomico,
    // Movimientos: qué tipos puede registrar cada rol
    canRecargar:            isSuperAdmin || isEconomico,
    canDepositar:           isSuperAdmin || isOperador || isEconomico,
    canComprar:             isSuperAdmin || isOperador,
    canDespachar:           isSuperAdmin || isOperador,
    canComprarDespachar:    isSuperAdmin || isOperador,
    // Ventas trabajadores
    canVerVentas:           isSuperAdmin || isOperador || isEconomico || isAuditor || isCajero,
    // operador queda fuera: pageRoles.Ventas no lo incluye, así que nunca alcanza
    // la página y estos flags eran letra muerta.
    canRegistrarVentas:     isSuperAdmin || isCajero,
    canCobrarVentas:        isSuperAdmin || isEconomico || isCajero,
    canGestionarBeneficiarios: isSuperAdmin || isCajero,
    canVerPrecios:             isSuperAdmin || isEconomico || isAuditor,
  };
}
