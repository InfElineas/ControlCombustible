import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { useIntegridadAlertas } from '@/components/ui-helpers/useIntegridadAlertas';
import { useTheme } from '@/components/ui-helpers/useTheme';
import { useConexion } from '@/lib/useConexion';
import {
  LayoutDashboard, List, Fuel, BarChart3, Menu, ChevronRight,
  LogOut, Settings, ShieldCheck, Bell, BookOpen, Shield,
  Moon, Sun, WalletCards, Navigation, HelpCircle, ShoppingCart, Truck,
  Clock, ShieldAlert, WifiOff, Search, KeyRound,
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import BuscadorGlobal from '@/components/ui-helpers/BuscadorGlobal';
import ClaveAcceso, { MARCA_DEFINIR_CLAVE } from '@/components/ui-helpers/ClaveAcceso';
import { supabase } from '@/api/supabaseClient';

// El campo movil ordena la barra inferior de la aplicación: las cuatro
// entradas accesibles con el número más bajo van abajo y el resto pasa a «Más».
// Se ordena por prioridad y no por posición en esta lista porque cada rol ve un
// subconjunto distinto, y así el cajero no se queda con pestañas vacías.
// El campo corto es el rótulo de la pestaña, donde solo caben unas diez letras.
const navItems = [
  { name: 'Inicio',         page: 'Dashboard',     icon: LayoutDashboard, movil: 1,  roles: ['superadmin', 'operador', 'auditor', 'economico', 'cajero'] },
  { name: 'Movimientos',    page: 'Movimientos',   icon: List,            movil: 2,  corto: 'Movim.',  roles: ['superadmin', 'operador', 'auditor', 'economico'] },
  { name: 'Bonificaciones', page: 'Ventas',        icon: ShoppingCart,    movil: 3,  corto: 'Bonif.',  roles: ['superadmin', 'economico', 'auditor', 'cajero'] },
  { name: 'Finanzas',       page: 'Finanzas',      icon: WalletCards,     movil: 7,  roles: ['superadmin', 'economico', 'auditor'] },
  { name: 'Catálogos',      page: 'Catalogos',     icon: BookOpen,        movil: 8,  roles: ['superadmin', 'operador', 'economico', 'auditor'] },
  { name: 'Rutas',          page: 'Rutas',         icon: Navigation,      movil: 5,  roles: ['superadmin', 'operador', 'auditor'] },
  { name: 'Transporte',     page: 'Transporte',    icon: Truck,           movil: 9,  corto: 'Transp.', roles: ['superadmin', 'operador', 'auditor'] },
  { name: 'Alertas',        page: 'Alertas',       icon: Bell,            movil: 4,  roles: ['superadmin', 'operador', 'auditor'] },
  { name: 'Reportes',       page: 'Reportes',      icon: BarChart3,       movil: 6,  roles: ['superadmin', 'operador', 'auditor', 'economico', 'cajero'] },
  { name: 'Configuración',  page: 'Configuracion', icon: Settings,        movil: 10, corto: 'Config.', roles: ['superadmin', 'operador'] },
];

const PESTANAS_MOVIL = 4;

// Iniciales para el botón de cuenta de la barra superior.
const iniciales = (usuario) => {
  const base = (usuario?.full_name || usuario?.email || '?').trim();
  const partes = base.split(/[\s.@_-]+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
};

const adminNavItem = { name: 'Administración', page: 'AdminPanel', icon: Shield, roles: ['superadmin'] };

const roleLabels = {
  superadmin: { label: 'Super Admin', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300' },
  operador:   { label: 'Operador',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300' },
  auditor:    { label: 'Auditor',     color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300' },
  economico:  { label: 'Económico',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300' },
  cajero:     { label: 'Cajero',      color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300' },
};

const pageRoles = {
  Consumidores:  ['superadmin', 'operador'],
  Conductores:   ['superadmin', 'operador'],
  Configuracion: ['superadmin', 'operador'],
  AdminPanel:    ['superadmin'],
  Catalogos:     ['superadmin', 'operador', 'economico', 'auditor'],
  Finanzas:      ['superadmin', 'economico', 'auditor'],
  Rutas:         ['superadmin', 'operador', 'auditor'],
  Transporte:    ['superadmin', 'operador', 'auditor'],
  Alertas:       ['superadmin', 'operador', 'auditor'],
  Ventas:        ['superadmin', 'economico', 'auditor', 'cajero'],
  Movimientos:   ['superadmin', 'operador', 'auditor', 'economico'],
  Reportes:      ['superadmin', 'operador', 'auditor', 'economico', 'cajero'],
};
// Nota: Consumidores y Conductores mantienen pageRoles para redireccionamiento
// correcto si alguien navega a esas URLs directamente (ambas redirigen a Catalogos).

function ThemeToggle({ isDark, toggle, className = '' }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className={`h-8 w-8 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ${className}`}
    >
      {isDark
        ? <Sun className="w-4 h-4" />
        : <Moon className="w-4 h-4" />}
    </Button>
  );
}

// Globo de aviso sobre el icono de una pestaña.
function PuntoContador({ n }) {
  return (
    <span
      className="absolute -top-1.5 -right-2.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums"
      title={`${n} ${n === 1 ? 'asunto pendiente' : 'asuntos pendientes'} de revisar`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

function NavLink({ item, active, onNavigate, contador = 0 }) {
  return (
    <Link
      to={createPageUrl(item.page)}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? 'bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-950 dark:text-sky-300'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
      }`}
    >
      <item.icon className={`w-4 h-4 ${active ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'}`} />
      {item.name}
      {contador > 0 && (
        <span
          className="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums"
          title={`${contador} ${contador === 1 ? 'asunto pendiente' : 'asuntos pendientes'} de revisar`}
        >
          {contador > 99 ? '99+' : contador}
        </span>
      )}
      {active && contador === 0 && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sky-400 dark:text-sky-600" />}
    </Link>
  );
}

function NavContent({ currentPageName, role, onNavigate, isDark, toggle, alertasPendientes = 0 }) {
  const filtered = navItems.filter(item => item.roles.includes(role));
  const rl = roleLabels[role] || { label: role, color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
  const showAdmin = adminNavItem.roles.includes(role);

  return (
    <nav className="flex flex-col gap-1 p-3">
      <div className="px-3 py-2 mb-1 flex items-center justify-between">
        <Badge className={`text-[10px] font-semibold ${rl.color} border-0`}>
          <ShieldCheck className="w-2.5 h-2.5 mr-1" />
          {rl.label}
        </Badge>
        {toggle && <ThemeToggle isDark={isDark} toggle={toggle} />}
      </div>

      {filtered.map(item => (
        <NavLink key={item.page} item={item} active={currentPageName === item.page} onNavigate={onNavigate}
          contador={item.page === 'Alertas' ? alertasPendientes : 0} />
      ))}

      {showAdmin && (
        <>
          <div className="mx-3 my-2 border-t border-slate-100 dark:border-slate-800" />
          <Link
            to={createPageUrl(adminNavItem.page)}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              currentPageName === adminNavItem.page
                ? 'bg-slate-800 text-white shadow-sm dark:bg-slate-700'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <adminNavItem.icon className={`w-4 h-4 ${currentPageName === adminNavItem.page ? 'text-white' : 'text-slate-400'}`} />
            {adminNavItem.name}
            {currentPageName === adminNavItem.page && <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-400" />}
          </Link>
        </>
      )}
    </nav>
  );
}

export default function Layout() {
  const { user, role, loading, sesionOffline } = useUserRole();
  const { isDark, toggle } = useTheme();
  const online = useConexion();
  const [open, setOpen] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);

  // Quien llega desde el correo de recuperación entra directo a la aplicación;
  // sin esto se quedaría dentro sin saber que venía a poner una contraseña.
  useEffect(() => {
    if (sessionStorage.getItem(MARCA_DEFINIR_CLAVE)) {
      sessionStorage.removeItem(MARCA_DEFINIR_CLAVE);
      setCambiandoClave(true);
    }
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPageName = location.pathname === '/' ? 'Dashboard' : location.pathname.replace('/', '');

  // Contador de integridad, compartido por el menú lateral y la barra inferior.
  // Mismo cálculo que el panel de Alertas, y solo se consulta para los roles que
  // pueden abrir esa página.
  const puedeVerAlertas = navItems.find(i => i.page === 'Alertas')?.roles.includes(role) ?? false;
  const { total: alertasPendientes } = useIntegridadAlertas({ enabled: puedeVerAlertas });

  useEffect(() => {
    if (!loading && !user) {
      navigate('/Login', { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && user && role) {
      const allowedRoles = pageRoles[currentPageName];
      if (allowedRoles && !allowedRoles.includes(role)) {
        navigate(createPageUrl('Dashboard'), { replace: true });
      }
    }
  }, [loading, user, role, currentPageName, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <Fuel className="w-8 h-8 text-sky-500" />
          <span className="text-sm text-slate-400">Cargando...</span>
        </div>
      </div>
    );
  }

  if (user?.status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Cuenta pendiente de aprobación</h2>
          <p className="text-sm text-slate-500">
            Tu cuenta <span className="font-medium text-slate-700 dark:text-slate-300">{user.email}</span> está esperando
            revisión por un administrador. Recibirás acceso una vez aprobada.
          </p>
          <Button
            variant="outline" size="sm"
            onClick={() => supabase.auth.signOut().then(() => navigate('/Login', { replace: true }))}
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" /> Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  if (user?.status === 'disabled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Cuenta desactivada</h2>
          <p className="text-sm text-slate-500">Tu cuenta ha sido desactivada. Contacta al administrador del sistema para más información.</p>
          <Button
            variant="outline" size="sm"
            onClick={() => supabase.auth.signOut().then(() => navigate('/Login', { replace: true }))}
          >
            <LogOut className="w-3.5 h-3.5 mr-1.5" /> Cerrar sesión
          </Button>
        </div>
      </div>
    );
  }

  const rl = roleLabels[role] || { label: role, color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
  const inicialesUsuario = iniciales(user);
  const accesibles = navItems.filter(i => i.roles.includes(role));
  const pestanas = [...accesibles].sort((a, b) => a.movil - b.movil).slice(0, PESTANAS_MOVIL);
  // Si Alertas no cabe en la barra, su contador se muestra sobre «Más» para que
  // el aviso no quede escondido dentro del panel.
  const alertasEnBarra = pestanas.some(i => i.page === 'Alertas');
  const contadorMas = !alertasEnBarra ? alertasPendientes : 0;
  const itemsMenuUsuario = [navItems.find(i => i.page === 'Configuracion'), adminNavItem]
    .filter(i => i?.roles.includes(role));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100 dark:from-slate-950 dark:via-sky-950/20 dark:to-indigo-950">
      {/* Barra superior en móvil: identidad, búsqueda, tema y cuenta.
          El relleno superior reserva el alto de la barra de estado del teléfono:
          en Android 15 la ventana es de borde a borde por imposición del
          sistema y esta barra se montaba sobre la hora y los avisos. Como es
          relleno y no margen, el fondo difuminado cubre también esa franja. */}
      <header
        className="lg:hidden sticky top-0 z-40 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-white/50 dark:border-white/[0.08] px-3 pb-2.5 flex items-center gap-2.5"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.625rem)' }}
      >
        <Link to={createPageUrl('Dashboard')} className="flex items-center shrink-0" aria-label="Inicio">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
            <Fuel className="w-5 h-5 text-white" />
          </div>
        </Link>

        <button
          type="button"
          onClick={() => setBuscando(true)}
          className="flex-1 flex items-center gap-2 h-10 px-3.5 rounded-full bg-slate-100/80 dark:bg-slate-800/80 text-slate-400 text-sm min-w-0"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="truncate">Buscar</span>
        </button>

        {/* Botón propio en lugar de ThemeToggle: el Button de shadcn fija el
            tamaño de sus iconos con más especificidad que cualquier clase que
            se le pase, y aquí hacen falta más grandes. */}
        <button
          type="button"
          onClick={toggle}
          title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-10 h-10 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-sm font-semibold flex items-center justify-center"
              aria-label="Cuenta"
            >
              {inicialesUsuario}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="px-2 py-1.5">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                {user?.full_name || user?.email}
              </p>
              <Badge className={`text-[10px] mt-1 font-semibold ${rl.color} border-0`}>
                <ShieldCheck className="w-2.5 h-2.5 mr-1" />{rl.label}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            {itemsMenuUsuario.map(item => (
              <DropdownMenuItem key={item.page} asChild>
                <Link to={createPageUrl(item.page)} className="flex items-center gap-2 cursor-pointer">
                  <item.icon className="w-3.5 h-3.5 text-slate-400" /> {item.name}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem className="cursor-pointer" onClick={() => setCambiandoClave(true)}>
              <KeyRound className="w-3.5 h-3.5 mr-2 text-slate-400" /> Contraseña de acceso
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`${createPageUrl('Ayuda')}?from=${currentPageName}`} className="flex items-center gap-2 cursor-pointer">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" /> Centro de ayuda
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500 cursor-pointer"
              onClick={() => supabase.auth.signOut().then(() => navigate('/Login', { replace: true }))}
            >
              <LogOut className="w-3.5 h-3.5 mr-2" /> Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex">
        {/* Sidebar desktop */}
        <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:fixed lg:inset-y-0 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl border-r border-white/40 dark:border-white/[0.08]">
          <div className="px-5 py-5 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-sm">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">Control</div>
              <div className="text-[11px] text-slate-400 leading-tight">Combustible</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavContent
              currentPageName={currentPageName}
              role={role}
              onNavigate={() => {}}
              isDark={isDark}
              toggle={toggle}
              alertasPendientes={alertasPendientes}
            />
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs text-slate-600 dark:text-slate-300 truncate font-medium">{user?.full_name || user?.email}</div>
            <Badge className={`text-[10px] mt-1 mb-2 font-semibold ${rl.color} border-0`}>
              <ShieldCheck className="w-2.5 h-2.5 mr-1" />
              {rl.label}
            </Badge>
            <button
              type="button"
              onClick={() => setCambiandoClave(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 mb-1 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" /> Contraseña de acceso
            </button>
            <Link
              to={`${createPageUrl('Ayuda')}?from=${currentPageName}`}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 mb-1 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" /> Centro de ayuda
            </Link>
            <Button
              variant="ghost" size="sm"
              className="w-full justify-start text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 px-0 h-7"
              onClick={() => supabase.auth.signOut().then(() => navigate('/Login', { replace: true }))}
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> Cerrar sesión
            </Button>
          </div>
        </aside>

        {/* Content */}
        {/* min-w-0 es lo que impide que un bloque ancho ensanche la pagina
            entera: sin el, un hijo de flex crece con su contenido y arrastra
            consigo las tarjetas, las barras y los margenes, que es como se veian
            los bordes saliendose del marco en el movil. */}
        <main className="flex-1 min-w-0 lg:ml-56 min-h-screen">
          {(!online || sesionOffline) && (
            <div className="bg-slate-800 text-slate-100 text-xs px-4 py-2 flex items-start gap-2 justify-center text-center">
              <WifiOff className="w-3.5 h-3.5 shrink-0 mt-px" />
              {sesionOffline
                ? 'Sesión sin validar por falta de conexión — puedes consultar lo ya descargado, pero no guardar. Al recuperar la red se revalida sola.'
                : 'Sin conexión — los datos que ves son los últimos descargados y no se puede guardar todavía'}
            </div>
          )}
          {/* El relleno inferior deja libre la altura de la barra de pestañas.
              El recorte horizontal es la red de seguridad: si una pagina se
              pasa de ancho, se queda dentro en lugar de desplazar la barra
              superior, la de pestañas y los modales. Solo en movil, porque en
              escritorio romperia el indice fijo de la pagina de Ayuda. */}
          <div className="max-w-6xl mx-auto px-4 py-5 pb-24 overflow-x-clip lg:overflow-x-visible lg:px-8 lg:py-6 lg:pb-6">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Barra de pestañas en móvil: enlaces principales por icono y «Más» */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/70 dark:border-white/[0.08]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {pestanas.map(item => {
          const activo = currentPageName === item.page;
          const contador = item.page === 'Alertas' ? alertasPendientes : 0;
          return (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              className={`flex-1 min-w-0 flex flex-col items-center gap-1 pt-2.5 pb-2 transition-colors ${
                activo ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <span className="relative">
                <item.icon className="w-6 h-6" />
                {contador > 0 && <PuntoContador n={contador} />}
              </span>
              <span className="text-[11px] leading-none font-medium truncate max-w-full px-0.5">
                {item.corto || item.name}
              </span>
            </Link>
          );
        })}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex-1 min-w-0 flex flex-col items-center gap-1 pt-2.5 pb-2 text-slate-400 dark:text-slate-500"
            >
              <span className="relative">
                <Menu className="w-6 h-6" />
                {contadorMas > 0 && <PuntoContador n={contadorMas} />}
              </span>
              <span className="text-[11px] leading-none font-medium">Más</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[80dvh] overflow-y-auto rounded-t-2xl p-0 pt-4 pb-6 dark:bg-slate-900 dark:border-slate-800"
          >
            <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
            <NavContent
              currentPageName={currentPageName}
              role={role}
              onNavigate={() => setOpen(false)}
              isDark={isDark}
              toggle={null}
              alertasPendientes={alertasPendientes}
            />
          </SheetContent>
        </Sheet>
      </nav>

      <BuscadorGlobal abierto={buscando} onCerrar={() => setBuscando(false)} />
      <ClaveAcceso abierto={cambiandoClave} onCerrar={() => setCambiandoClave(false)} />

      {/* Botón flotante de ayuda, por encima de la barra de pestañas */}
      {currentPageName !== 'Ayuda' && (
        <Link
          to={`${createPageUrl('Ayuda')}?from=${currentPageName}`}
          title="Centro de ayuda"
          className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] lg:bottom-5 z-50 w-12 h-12 rounded-full bg-sky-600 hover:bg-sky-700 shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        >
          <HelpCircle className="w-6 h-6 text-white" />
        </Link>
      )}
    </div>
  );
}
