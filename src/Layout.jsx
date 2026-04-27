import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { useTheme } from '@/components/ui-helpers/useTheme';
import {
  LayoutDashboard, List, Fuel, BarChart3, Menu, ChevronRight,
  LogOut, Settings, ShieldCheck, Users, Bell, BookOpen, Shield,
  Moon, Sun, WalletCards,
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/api/supabaseClient';

const navItems = [
  { name: 'Dashboard',      page: 'Dashboard',     icon: LayoutDashboard, roles: ['superadmin', 'operador', 'auditor', 'economico'] },
  { name: 'Movimientos',    page: 'Movimientos',   icon: List,             roles: ['superadmin', 'operador', 'auditor', 'economico'] },
  { name: 'Consumidores',   page: 'Consumidores',  icon: Users,            roles: ['superadmin', 'operador'] },
  { name: 'Finanzas',       page: 'Finanzas',      icon: WalletCards,      roles: ['superadmin', 'economico'] },
  { name: 'Catálogos',      page: 'Catalogos',     icon: BookOpen,         roles: ['superadmin'] },
  { name: 'Alertas',        page: 'Alertas',       icon: Bell,             roles: ['superadmin', 'operador'] },
  { name: 'Reportes',       page: 'Reportes',      icon: BarChart3,        roles: ['superadmin', 'operador', 'auditor', 'economico'] },
  { name: 'Configuración',  page: 'Configuracion', icon: Settings,         roles: ['superadmin', 'operador'] },
];

const adminNavItem = { name: 'Administración', page: 'AdminPanel', icon: Shield, roles: ['superadmin'] };

const roleLabels = {
  superadmin: { label: 'Super Admin', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300' },
  operador:   { label: 'Operador',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300' },
  auditor:    { label: 'Auditor',     color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300' },
  economico:  { label: 'Económico',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300' },
};

const pageRoles = {
  Consumidores:  ['superadmin', 'operador'],
  Alertas:       ['superadmin', 'operador'],
  Catalogos:     ['superadmin'],
  Configuracion: ['superadmin', 'operador'],
  Finanzas:      ['superadmin', 'economico'],
  AdminPanel:    ['superadmin'],
};

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

function NavLink({ item, active, onNavigate }) {
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
      {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sky-400 dark:text-sky-600" />}
    </Link>
  );
}

function NavContent({ currentPageName, role, onNavigate, isDark, toggle }) {
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
        <NavLink key={item.page} item={item} active={currentPageName === item.page} onNavigate={onNavigate} />
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
  const { user, role: rawRole, loading } = useUserRole();
  const role = rawRole === 'admin' ? 'superadmin' : rawRole;
  const { isDark, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPageName = location.pathname === '/' ? 'Dashboard' : location.pathname.replace('/', '');

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

  const rl = roleLabels[role] || { label: role, color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100 dark:from-slate-950 dark:via-sky-950/20 dark:to-indigo-950">
      {/* Top bar mobile */}
      <header className="lg:hidden sticky top-0 z-40 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-b border-white/50 dark:border-white/[0.08] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
            <Fuel className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Control Combustible</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle isDark={isDark} toggle={toggle} />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 pt-10 dark:bg-slate-900 dark:border-slate-800">
              <NavContent
                currentPageName={currentPageName}
                role={role}
                onNavigate={() => setOpen(false)}
                isDark={isDark}
                toggle={null}
              />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="text-xs text-slate-400 mb-2 truncate">{user?.full_name || user?.email}</div>
                <Button
                  variant="ghost" size="sm"
                  className="w-full justify-start text-xs text-slate-400 hover:text-red-500 px-0 h-7"
                  onClick={() => supabase.auth.signOut().then(() => navigate('/Login', { replace: true }))}
                >
                  <LogOut className="w-3.5 h-3.5 mr-1.5" /> Cerrar sesión
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
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
            />
          </div>
          <div className="p-4 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs text-slate-600 dark:text-slate-300 truncate font-medium">{user?.full_name || user?.email}</div>
            <Badge className={`text-[10px] mt-1 mb-2 font-semibold ${rl.color} border-0`}>
              <ShieldCheck className="w-2.5 h-2.5 mr-1" />
              {rl.label}
            </Badge>
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
        <main className="flex-1 lg:ml-56 min-h-screen">
          <div className="max-w-6xl mx-auto px-4 py-5 lg:px-8 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
