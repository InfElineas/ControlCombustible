import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  Car,
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
    <div className="min-h-screen bg-slate-100 flex">
      <aside className="w-[268px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-6 pt-6 pb-5">
          <Link to={createPageUrl('Dashboard')} className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500 flex items-center justify-center shadow-sm">
              <ReceiptText className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 leading-none text-base">Control</p>
              <p className="text-slate-400 text-sm leading-none mt-1">Combustible</p>
            </div>
          </Link>
        </div>

        <nav className="px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `h-12 rounded-2xl px-4 flex items-center justify-between text-base transition ${
                    isActive
                      ? 'bg-sky-100 text-sky-700'
                      : 'text-slate-700 hover:bg-slate-200/70'
                  }`
                }
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </span>
                <span className="text-slate-400">›</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto px-6 py-8 border-t border-slate-200 text-slate-400">
          <p className="text-sm leading-tight">Informático Lineas</p>
          <p className="text-xs leading-tight">Administrador</p>
          <button className="mt-6 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8">
        <div className="max-w-[1320px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
