import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  Car,
  ChevronRight,
  CreditCard,
  Fuel,
  Gauge,
  LayoutGrid,
  List,
  LogOut,
  Plus,
  ReceiptText,
} from 'lucide-react';
import { createPageUrl } from '@/utils';

const navItems = [
  { label: 'Dashboard', to: createPageUrl('Dashboard'), icon: LayoutGrid },
  { label: 'Nuevo Movimiento', to: createPageUrl('NuevoMovimiento'), icon: Plus },
  { label: 'Movimientos', to: createPageUrl('Movimientos'), icon: List },
  { label: 'Tarjetas', to: createPageUrl('Tarjetas'), icon: CreditCard },
  { label: 'Vehículos', to: createPageUrl('Vehiculos'), icon: Car },
  { label: 'Combustibles', to: createPageUrl('Combustibles'), icon: Fuel },
  { label: 'Precios', to: createPageUrl('Precios'), icon: Gauge },
  { label: 'Reportes', to: createPageUrl('Reportes'), icon: BarChart3 },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-100/95 flex">
      <aside className="w-[270px] bg-slate-50 border-r border-slate-200/90 flex flex-col shrink-0">
        <div className="px-6 pt-6 pb-7">
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-sky-600 flex items-center justify-center shadow-sm">
              <ReceiptText className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 leading-none text-2xl">Control</p>
              <p className="text-slate-400 text-sm leading-none mt-1">Combustible</p>
            </div>
          </Link>
        </div>

        <nav className="px-3 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `h-14 rounded-2xl px-4 flex items-center justify-between text-base transition-colors ${
                    isActive
                      ? 'bg-sky-100/90 text-sky-700'
                      : 'text-slate-700 hover:bg-slate-200/70'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex items-center gap-3">
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                    </span>
                    {isActive ? <ChevronRight className="w-4 h-4 text-sky-500" /> : null}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto px-5 pb-8 text-slate-400">
          <p className="text-sm leading-tight">Informático Lineas</p>
          <p className="text-sm leading-tight">Administrador</p>
          <button className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 px-10 py-8">
        <div className="max-w-[1320px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
