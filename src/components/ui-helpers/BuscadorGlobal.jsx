import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Search, Truck, UserCheck, Users, CornerDownLeft, List,
  ShoppingCart, Navigation, CreditCard, Fuel,
} from 'lucide-react';
import { createPageUrl } from '@/utils';

// Cuántos resultados se muestran por grupo. El límite es de presentación: con
// más, la lista deja de servir para elegir y hay que ir a la página y filtrar.
const POR_GRUPO = 5;

// Roles que pueden abrir cada destino. Repiten los de pageRoles en Layout a
// propósito: enseñar un resultado que al pulsarlo devuelve al panel por falta de
// permiso es peor que no enseñarlo.
const VE_MOVIMIENTOS = ['superadmin', 'operador', 'auditor', 'economico'];
const VE_BONIFICACIONES = ['superadmin', 'economico', 'auditor', 'cajero'];
const VE_RUTAS = ['superadmin', 'operador', 'auditor'];
const VE_CATALOGOS = ['superadmin', 'operador', 'economico', 'auditor'];
const VE_FINANZAS = ['superadmin', 'economico', 'auditor'];

const norm = (v) => (v == null ? '' : String(v)).toLowerCase();

// Busca entre todo lo que la aplicación tiene descargado.
//
// Trabaja sobre las mismas consultas que usan las páginas, así que no añade
// peticiones si ya se visitaron, y sigue funcionando sin conexión con lo que
// quedó guardado en el dispositivo.
export default function BuscadorGlobal({ abierto, onCerrar }) {
  const navigate = useNavigate();
  const { role } = useUserRole();
  const [texto, setTexto] = useState('');

  const puede = (roles) => roles.includes(role);
  const comun = { staleTime: 5 * 60_000 };

  const { data: consumidores = [] } = useQuery({ ...comun, queryKey: ['consumidores'],
    queryFn: () => base44.entities.Consumidor.list(), enabled: abierto });
  const { data: combustibles = [] } = useQuery({ ...comun, queryKey: ['combustibles'],
    queryFn: () => base44.entities.TipoCombustible.list(), enabled: abierto });
  const { data: conductores = [] } = useQuery({ ...comun, queryKey: ['conductores'],
    queryFn: () => base44.entities.Conductor.list(), enabled: abierto && puede(VE_CATALOGOS) });
  const { data: beneficiarios = [] } = useQuery({ ...comun, queryKey: ['beneficiarios'],
    queryFn: () => base44.entities.Beneficiario.list('nombre', 2000), enabled: abierto && puede(VE_BONIFICACIONES) });
  const { data: movimientos = [] } = useQuery({ ...comun, queryKey: ['movimientos'],
    queryFn: () => base44.entities.Movimiento.list('-fecha', 5000), enabled: abierto && puede(VE_MOVIMIENTOS) });
  const { data: ventas = [] } = useQuery({ ...comun, queryKey: ['ventas'],
    queryFn: () => base44.entities.VentaTrabajador.list('-fecha_venta', 2000), enabled: abierto && puede(VE_BONIFICACIONES) });
  const { data: rutas = [] } = useQuery({ ...comun, queryKey: ['rutas'],
    queryFn: () => base44.entities.Ruta.list(), enabled: abierto && puede(VE_RUTAS) });
  const { data: tarjetas = [] } = useQuery({ ...comun, queryKey: ['tarjetas'],
    queryFn: () => base44.entities.Tarjeta.list(), enabled: abierto && puede(VE_FINANZAS) });

  useEffect(() => { if (!abierto) setTexto(''); }, [abierto]);

  const resultados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (q.length < 2) return [];
    const coincide = (...campos) => campos.some(c => norm(c).includes(q));
    const items = [];
    const agregar = (lista, filtro, mapa) => {
      lista.filter(filtro).slice(0, POR_GRUPO).forEach(x => items.push(mapa(x)));
    };

    agregar(consumidores,
      c => coincide(c.nombre, c.codigo_interno, c.responsable, c.conductor, c.area_centro,
        c.tipo_consumidor_nombre, c.combustible_nombre, c.datos_vehiculo?.chapa),
      c => ({
        id: `c-${c.id}`, icono: Truck, titulo: c.nombre,
        detalle: [c.codigo_interno, c.tipo_consumidor_nombre, c.combustible_nombre].filter(Boolean).join(' · '),
        grupo: 'Vehículos y tanques',
        ir: () => navigate(`${createPageUrl('Movimientos')}?consumidor=${c.id}`),
      }));

    agregar(movimientos,
      m => coincide(m.referencia, m.fecha, m.consumidor_nombre, m.consumidor_origen_nombre,
        m.vehiculo_chapa, m.vehiculo_origen_chapa, m.tarjeta_alias, m.combustible_nombre,
        m.tipo, m.litros, m.monto, m.odometro),
      m => ({
        id: `m-${m.id}`, icono: List,
        titulo: `${m.tipo} · ${m.litros ?? '—'} L${m.consumidor_nombre ? ` · ${m.consumidor_nombre}` : ''}`,
        detalle: [m.fecha, m.combustible_nombre, m.referencia].filter(Boolean).join(' · '),
        grupo: 'Movimientos',
        ir: () => navigate(`${createPageUrl('Movimientos')}?movimientoId=${m.id}`),
      }));

    agregar(ventas,
      v => coincide(v.numero_factura, v.beneficiario_nombre, v.beneficiario_ci, v.beneficiario_area,
        v.referencia, v.estado, v.fecha_venta, v.combustible_nombre, v.tanque_origen_nombre,
        v.litros, v.monto),
      v => ({
        id: `v-${v.id}`, icono: ShoppingCart,
        titulo: `${v.numero_factura ? `${v.numero_factura} · ` : ''}${v.beneficiario_nombre}`,
        detalle: [v.fecha_venta, `${v.litros} L`, v.combustible_nombre, v.estado].filter(Boolean).join(' · '),
        grupo: 'Bonificaciones',
        ir: () => navigate(`${createPageUrl('Ventas')}?q=${encodeURIComponent(v.beneficiario_nombre ?? '')}`),
      }));

    agregar(conductores,
      c => coincide(c.nombre, c.ci, c.area_centro, c.telefono, c.licencia_numero, c.vehiculo_asignado_chapa),
      c => ({
        id: `d-${c.id}`, icono: UserCheck, titulo: c.nombre,
        detalle: [c.ci, c.area_centro, c.vehiculo_asignado_chapa].filter(Boolean).join(' · '),
        grupo: 'Conductores',
        ir: () => navigate(createPageUrl('Catalogos')),
      }));

    agregar(beneficiarios,
      b => coincide(b.nombre, b.ci, b.area),
      b => ({
        id: `b-${b.id}`, icono: Users, titulo: b.nombre,
        detalle: [b.ci, b.area].filter(Boolean).join(' · '),
        grupo: 'Trabajadores',
        ir: () => navigate(`${createPageUrl('Ventas')}?q=${encodeURIComponent(b.nombre ?? '')}`),
      }));

    agregar(rutas,
      r => coincide(r.nombre, r.punto_inicio, r.punto_fin, r.municipio),
      r => ({
        id: `r-${r.id}`, icono: Navigation, titulo: r.nombre,
        detalle: [r.punto_inicio && r.punto_fin ? `${r.punto_inicio} → ${r.punto_fin}` : null,
          r.municipio, r.distancia_km ? `${r.distancia_km} km` : null].filter(Boolean).join(' · '),
        grupo: 'Rutas',
        ir: () => navigate(createPageUrl('Rutas')),
      }));

    agregar(tarjetas,
      t => coincide(t.alias, t.id_tarjeta, t.moneda),
      t => ({
        id: `t-${t.id}`, icono: CreditCard, titulo: t.alias || t.id_tarjeta,
        detalle: [t.id_tarjeta, t.moneda].filter(Boolean).join(' · '),
        grupo: 'Tarjetas',
        ir: () => navigate(createPageUrl('Finanzas')),
      }));

    agregar(combustibles,
      c => coincide(c.nombre),
      c => ({
        id: `f-${c.id}`, icono: Fuel, titulo: c.nombre,
        detalle: c.activa === false ? 'inactivo' : '',
        grupo: 'Combustibles',
        ir: () => navigate(createPageUrl('Catalogos')),
      }));

    return items;
  }, [texto, consumidores, conductores, beneficiarios, movimientos, ventas, rutas, tarjetas, combustibles, navigate]);

  const grupos = useMemo(() => {
    const m = {};
    resultados.forEach(r => { (m[r.grupo] ||= []).push(r); });
    return Object.entries(m);
  }, [resultados]);

  const abrir = (item) => { item.ir(); onCerrar(); };

  return (
    <Dialog open={abierto} onOpenChange={a => { if (!a) onCerrar(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 top-[12%] translate-y-0">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <Input
            autoFocus
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && resultados.length) abrir(resultados[0]); }}
            placeholder="Vehículo, chapa, factura, trabajador, ruta, tarjeta…"
            className="border-0 shadow-none focus-visible:ring-0 px-0 h-8 text-sm"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {texto.trim().length < 2 && (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">
              Escribe al menos dos letras. Busca en vehículos, tanques, movimientos,
              bonificaciones, conductores, trabajadores, rutas, tarjetas y combustibles.
            </p>
          )}
          {texto.trim().length >= 2 && resultados.length === 0 && (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">
              Nada coincide con «{texto.trim()}».
            </p>
          )}
          {grupos.map(([grupo, items]) => (
            <div key={grupo} className="py-1">
              <p className="px-4 py-1 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{grupo}</p>
              {items.map(item => (
                <button
                  key={item.id} type="button" onClick={() => abrir(item)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <item.icono className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-700 dark:text-slate-200 truncate">{item.titulo}</span>
                    {item.detalle && <span className="block text-[11px] text-slate-400 truncate">{item.detalle}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {resultados.length > 0 && (
            <p className="px-4 py-2 text-[10px] text-slate-400 flex items-center gap-1 border-t border-slate-100 dark:border-slate-800 mt-1">
              <CornerDownLeft className="w-3 h-3" /> Intro abre el primer resultado
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
