import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import {
  LayoutDashboard, List, Fuel, BarChart3, Menu, ChevronRight, LogOut, Settings, ShieldCheck, Users, Bell, BookOpen
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { supabase } from '@/api/supabaseClient';

const navItems = [
  { name: 'Dashboard',      page: 'Dashboard',     icon: LayoutDashboard, roles: ['superadmin', 'operador', 'auditor'] },
  { name: 'Movimientos',    page: 'Movimientos',   icon: List,             roles: ['superadmin', 'operador', 'auditor'] },
  { name: 'Consumidores',   page: 'Consumidores',  icon: Users,            roles: ['superadmin', 'operador'] },
  { name: 'Catálogos',      page: 'Catalogos',     icon: BookOpen,         roles: ['superadmin'] },
  { name: 'Alertas',        page: 'Alertas',       icon: Bell,             roles: ['superadmin', 'operador'] },
  { name: 'Reportes',       page: 'Reportes',      icon: BarChart3,        roles: ['superadmin', 'operador', 'auditor'] },
  { name: 'Configuración',  page: 'Configuracion', icon: Settings,         roles: ['superadmin', 'operador'] },
];

const roleLabels = {
  superadmin: { label: 'Super Admin', color: 'bg-sky-100 text-sky-700' },
  operador:   { label: 'Operador',    color: 'bg-emerald-100 text-emerald-700' },
  auditor:    { label: 'Auditor',     color: 'bg-violet-100 text-violet-700' },
};

// Páginas restringidas por rol
const pageRoles = {
  Consumidores:  ['superadmin', 'operador'],
  Alertas:       ['superadmin', 'operador'],
  Catalogos:     ['superadmin'],
  Configuracion: ['superadmin', 'operador'],
};

function NavContent({ currentPageName, role, onNavigate }) {
  const filtered = navItems.filter(item => item.roles.includes(role));
  const rl = roleLabels[role] || { label: role, color: 'bg-slate-100 text-slate-600' };

  return (
    <nav className="flex flex-col gap-1 p-3">
      <div className="px-3 py-2 mb-1">
        <Badge className={`text-[10px] font-semibold ${rl.color} border-0`}>
          <ShieldCheck className="w-2.5 h-2.5 mr-1" />
          {rl.label}
        </Badge>
      </div>
      {filtered.map(item => {
        const active = currentPageName === item.page;
        return (
          <Link
            key={item.page}
            to={createPageUrl(item.page)}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              active
                ? 'bg-sky-50 text-sky-700 shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <item.icon className={`w-4 h-4 ${active ? 'text-sky-600' : 'text-slate-400'}`} />
            {item.name}
            {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sky-400" />}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Layout({ children, currentPageName }) {
  const { user, role: rawRole, loading } = useUserRole();
  // 'admin' es el rol por defecto de Base44, tratarlo como superadmin
  const role = rawRole === 'admin' ? 'superadmin' : rawRole;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/Login';
    }
  }, [loading, user]);

  // Redirigir si el rol no tiene acceso a la página actual
  useEffect(() => {
    if (!loading && user && role) {
      const allowedRoles = pageRoles[currentPageName];
      if (allowedRoles && !allowedRoles.includes(role)) {
        window.location.href = createPageUrl('Dashboard');
      }
    }
  }, [loading, user, role, currentPageName]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <Fuel className="w-8 h-8 text-sky-500" />
          <span className="text-sm text-slate-400">Cargando...</span>
        </div>
      </div>
    );
  }

  const rl = roleLabels[role] || { label: role, color: 'bg-slate-100 text-slate-600' };

  return (
    <div className="min-h-screen bg-slate-50/80">
      {/* Top bar mobile */}
      <header className="lg:hidden sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
            <Fuel className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-slate-800 text-sm">Control Combustible</span>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 pt-10">
            <NavContent currentPageName={currentPageName} role={role} onNavigate={() => setOpen(false)} />
            <div className="absolute bottom-4 left-4 right-4">
              <div className="text-xs text-slate-400 mb-2 truncate">{user?.full_name || user?.email}</div>
              <Button
                variant="ghost" size="sm"
                className="w-full justify-start text-xs text-slate-400 hover:text-red-500 px-0 h-7"
                onClick={() => supabase.auth.signOut().then(() => { window.location.href = '/Login'; })}
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" /> Cerrar sesión
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div className="flex">
        {/* Sidebar desktop */}
        <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:fixed lg:inset-y-0 bg-white border-r border-slate-100">
          <div className="px-5 py-5 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-sm">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-800 text-sm leading-tight">Control</div>
              <div className="text-[11px] text-slate-400 leading-tight">Combustible</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavContent currentPageName={currentPageName} role={role} onNavigate={() => {}} />
          </div>
          <div className="p-4 border-t border-slate-50">
            <div className="text-xs text-slate-600 truncate font-medium">{user?.full_name || user?.email}</div>
            <Badge className={`text-[10px] mt-1 mb-2 font-semibold ${rl.color} border-0`}>
              <ShieldCheck className="w-2.5 h-2.5 mr-1" />
              {rl.label}
            </Badge>
            <Button
              variant="ghost" size="sm"
              className="w-full justify-start text-xs text-slate-400 hover:text-red-500 px-0 h-7"
              onClick={() => supabase.auth.signOut().then(() => { window.location.href = '/Login'; })}
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> Cerrar sesión
            </Button>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 lg:ml-56 min-h-screen">
          <div className="max-w-6xl mx-auto px-4 py-5 lg:px-8 lg:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}