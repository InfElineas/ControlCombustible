import React from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import Dashboard from '@/pages/DashBoard';
import Movimientos from '@/pages/Movimientos';
import Tarjetas from '@/pages/Tarjetas';
import Vehiculos from '@/pages/Vehiculos';
import Combustibles from '@/pages/Combustibles';
import Precios from '@/pages/Precios';
import Reportes from '@/pages/Reportes';
import PageNotFound from '@/lib/PageNotFound';
import { createPageUrl } from '@/utils';

const sections = [
  { label: 'Dashboard', path: createPageUrl('Dashboard') },
  { label: 'Movimientos', path: createPageUrl('Movimientos') },
  { label: 'Tarjetas', path: createPageUrl('Tarjetas') },
  { label: 'Vehiculos', path: createPageUrl('Vehiculos') },
  { label: 'Combustibles', path: createPageUrl('Combustibles') },
  { label: 'Precios', path: createPageUrl('Precios') },
  { label: 'Reportes', path: createPageUrl('Reportes') },
];

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link to={createPageUrl('Dashboard')} className="font-bold text-slate-800">Control Combustible</Link>
          <nav className="mt-3 flex flex-wrap gap-2">
            {sections.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `px-3 py-1.5 rounded-lg text-sm ${isActive ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path={createPageUrl('Dashboard')} element={<Dashboard />} />
          <Route path={createPageUrl('Movimientos')} element={<Movimientos />} />
          <Route path={createPageUrl('Tarjetas')} element={<Tarjetas />} />
          <Route path={createPageUrl('Vehiculos')} element={<Vehiculos />} />
          <Route path={createPageUrl('Combustibles')} element={<Combustibles />} />
          <Route path={createPageUrl('Precios')} element={<Precios />} />
          <Route path={createPageUrl('Reportes')} element={<Reportes />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </main>
    </div>
  );
}
