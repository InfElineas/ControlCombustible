import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { canAccessPage } from '@/lib/roles';
import {
  LayoutDashboard, List, CreditCard, Truck, Fuel,
  DollarSign, BarChart3, Menu, ChevronRight, LogOut, Settings, ClipboardList
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from '@/lib/AuthContext';

const navItems = [
  { name: 'Dashboard', page: 'Dashboard', icon: LayoutDashboard },
  { name: 'Movimientos', page: 'Movimientos', icon: List },
  { name: 'Tarjetas', page: 'Tarjetas', icon: CreditCard },
  { name: 'Vehículos', page: 'Vehiculos', icon: Truck },
  { name: 'Combustibles', page: 'Combustibles', icon: Fuel },
  { name: 'Precios', page: 'Precios', icon: DollarSign },
  { name: 'Configuración', page: 'Configuracion', icon: Settings },
  { name: 'Logs', page: 'LogsAdmin', icon: ClipboardList },
  { name: 'Reportes', page: 'Reportes', icon: BarChart3 },
];

function NavContent({ currentPageName, role, onNavigate }) {
  const filtered = navItems.filter((item) => canAccessPage(role, item.page));

  return (
    <nav className="flex flex-col gap-1 p-3">
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
            <item.icon className={`w-4.5 h-4.5 ${active ? 'text-sky-600' : 'text-slate-400'}`} />
            {item.name}
            {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-sky-400" />}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Layout({ children, currentPageName }) {
  const { user, role, canEdit, loading } = useUserRole();
  const { logout, navigateToLogin } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigateToLogin(window.location.href);
    }
  }, [loading, user]);

  useEffect(() => {
    if (!loading && user && !canAccessPage(role, currentPageName)) {
      window.location.href = createPageUrl('Dashboard');
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

  return (
    <div className="min-h-screen bg-slate-50/80">
      <style>{`
        :root {
          --primary: 200 90% 48%;
          --primary-foreground: 0 0% 100%;
        }
      `}</style>

      {/* Top bar mobile */}
      <header className="lg:hidden sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg overflow-hidden shadow-sm">
            <img src="/fuelflow-logo.svg" alt="FuelFlow" className="w-full h-full object-cover" />
          </div>
          <span className="font-semibold text-slate-800 text-sm">FuelFlow</span>
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
              <div className="text-xs text-slate-400 mb-2">{user?.full_name || user?.email} · {role}</div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-slate-400 hover:text-red-500 px-0 h-7"
                onClick={logout}
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
            <div className="w-9 h-9 rounded-xl overflow-hidden shadow-sm">
              <img src="/fuelflow-logo.svg" alt="FuelFlow" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="font-bold text-slate-800 text-sm leading-tight">FuelFlow</div>
              <div className="text-[11px] text-slate-400 leading-tight">Gestión de combustible</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <NavContent currentPageName={currentPageName} role={role} onNavigate={() => {}} />
          </div>
          <div className="p-4 border-t border-slate-50">
            <div className="text-xs text-slate-500 truncate">{user?.full_name || user?.email}</div>
            <div className="text-[11px] text-slate-400 mb-2">
              {role === 'superadmin' ? 'Superadmin' : canEdit ? 'Gestor' : 'Auditor'}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs text-slate-400 hover:text-red-500 px-0 h-7"
              onClick={logout}
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
