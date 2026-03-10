import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Dashboard from '@/pages/DashBoard';
import Movimientos from '@/pages/Movimientos';
import Tarjetas from '@/pages/Tarjetas';
import Vehiculos from '@/pages/Vehiculos';
import Combustibles from '@/pages/Combustibles';
import Precios from '@/pages/Precios';
import Reportes from '@/pages/Reportes';
import PageNotFound from '@/lib/PageNotFound';
import { queryClientInstance } from '@/lib/query-client';
import { createPageUrl } from '@/utils';
import './styles.css';

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={createPageUrl('Dashboard')} replace />} />
      <Route path={createPageUrl('Dashboard')} element={<Dashboard />} />
      <Route path={createPageUrl('Movimientos')} element={<Movimientos />} />
      <Route path={createPageUrl('Tarjetas')} element={<Tarjetas />} />
      <Route path={createPageUrl('Vehiculos')} element={<Vehiculos />} />
      <Route path={createPageUrl('Combustibles')} element={<Combustibles />} />
      <Route path={createPageUrl('Precios')} element={<Precios />} />
      <Route path={createPageUrl('Reportes')} element={<Reportes />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClientInstance}>
      <BrowserRouter>
        <AppRouter />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
