import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import VentaEstadoBadge from '@/components/ui-helpers/VentaEstadoBadge';
import {
  CreditCard, DollarSign, ChevronDown, ChevronUp, WalletCards, Fuel, ExternalLink,
  TrendingUp, Tag, Plus, Loader2, Trash2, Pencil, Download, Users, Clock, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';

const fmtL = n => (n == null || isNaN(n) ? '0' : n % 1 === 0 ? String(Math.round(n)) : Number(n).toFixed(1));

function lastDay(yyyy_mm) {
  const [y, m] = yyyy_mm.split('-').map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Finanzas() {
  const { canManageFinanzas, isEconomico } = useUserRole();
  const today = new Date().toISOString().slice(0, 10);
  const [periodo, setPeriodo] = useState(today.slice(0, 7));
  const [tab, setTab] = useState('tarjetas');

  useEffect(() => {
    if (isEconomico) setTab('bonificaciones');
  }, [isEconomico]);

  const periodoDesde = `${periodo}-01`;
  const periodoHasta = lastDay(periodo);

  const { data: movPeriodo = [], isLoading: loadingMov } = useQuery({
    queryKey: ['finanzas-mov', periodo],
    queryFn: async () => {
      const { data } = await supabase
        .from('movimiento')
        .select('id, fecha, tipo, litros, monto, tarjeta_id, consumidor_id, consumidor_nombre, combustible_nombre, referencia')
        .gte('fecha', periodoDesde)
        .lte('fecha', periodoHasta)
        .order('fecha', { ascending: false });
      return data ?? [];
    },
  });

  const { data: ventasPeriodo = [], isLoading: loadingVentas } = useQuery({
    queryKey: ['finanzas-ventas', periodo],
    queryFn: async () => {
      const { data } = await supabase
        .from('venta_trabajador')
        .select('*')
        .gte('fecha_venta', periodoDesde)
        .lte('fecha_venta', periodoHasta)
        .order('fecha_venta', { ascending: false });
      return data ?? [];
    },
  });

  const { data: tarjetas = [] } = useQuery({
    queryKey: ['tarjetas'],
    queryFn: () => base44.entities.Tarjeta.list(),
  });

  // KPIs
  const compras = movPeriodo.filter(m => m.tipo === 'COMPRA');
  const gastoCompras = compras.reduce((s, m) => s + (m.monto || 0), 0);
  const litrosComprados = compras.reduce((s, m) => s + (m.litros || 0), 0);
  const ventasActivas = ventasPeriodo.filter(v => v.estado !== 'CANCELADO' && v.estado !== 'ANULADO');
  const montoBonus = ventasActivas.reduce((s, v) => s + (v.monto || 0), 0);
  const pendienteBonus = ventasPeriodo
    .filter(v => v.estado === 'PENDIENTE' || v.estado === 'ENTREGADO')
    .reduce((s, v) => s + (v.monto || 0), 0);
  const cobradoBonus = ventasPeriodo
    .filter(v => v.estado === 'PAGADO_FINALIZADO' || v.estado === 'PAGADO')
    .reduce((s, v) => s + (v.monto || 0), 0);
  const flujoNeto = cobradoBonus - gastoCompras;

  // KPIs por tipo de combustible
  const comprasPorCombustible = useMemo(() => {
    const map = {};
    compras.forEach(m => {
      const key = m.combustible_nombre || 'Sin clasificar';
      if (!map[key]) map[key] = { nombre: key, litros: 0, monto: 0 };
      map[key].litros += m.litros || 0;
      map[key].monto  += m.monto  || 0;
    });
    return Object.values(map).sort((a, b) => b.litros - a.litros);
  }, [compras]);

  const bonusPorCombustible = useMemo(() => {
    const map = {};
    ventasActivas.forEach(v => {
      const key = v.combustible_nombre || 'Sin clasificar';
      if (!map[key]) map[key] = { nombre: key, litros: 0, monto: 0, cobrado: 0, pendiente: 0 };
      map[key].litros  += v.litros || 0;
      map[key].monto   += v.monto  || 0;
      if (v.estado === 'PAGADO_FINALIZADO' || v.estado === 'PAGADO') map[key].cobrado   += v.monto || 0;
      if (v.estado === 'PENDIENTE' || v.estado === 'ENTREGADO')      map[key].pendiente += v.monto || 0;
    });
    return Object.values(map).sort((a, b) => b.litros - a.litros);
  }, [ventasActivas]);

  // CPP por tanque ISO (costo promedio ponderado acumulado)
  const { data: cppTanques = [] } = useQuery({
    queryKey: ['cpp-tanques'],
    queryFn: async () => {
      const { data } = await supabase.from('v_cpp_por_tanque').select('*');
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const cppMap = useMemo(() => {
    const m = {};
    cppTanques.forEach(r => { m[r.consumidor_id] = r.cpp; });
    return m;
  }, [cppTanques]);

  // CPP por tipo de combustible (promedio ponderado de todos los tanques ISO)
  const { data: cppCombustibles = [] } = useQuery({
    queryKey: ['cpp-combustibles'],
    queryFn: async () => {
      const { data } = await supabase.from('v_cpp_por_combustible').select('*');
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const cppCombMap = useMemo(() => {
    const m = {};
    cppCombustibles.forEach(r => { m[r.combustible_id] = r.cpp; });
    return m;
  }, [cppCombustibles]);

  // Gasto flota: COMPRAs del período × CPP del combustible
  const gastoFlotaPorCombustible = useMemo(() => {
    const map = {};
    compras.forEach(m => {
      const key  = m.combustible_nombre || 'Sin clasificar';
      const cpp  = cppCombMap[m.combustible_id] ?? null;
      const gasto = cpp != null ? (m.litros || 0) * cpp : null;
      if (!map[key]) map[key] = { nombre: key, litros: 0, gasto: 0, sinCpp: 0 };
      map[key].litros += m.litros || 0;
      if (gasto != null) map[key].gasto += gasto;
      else map[key].sinCpp += m.litros || 0;
    });
    return Object.values(map).sort((a, b) => b.litros - a.litros);
  }, [compras, cppCombMap]);

  const totalGastoFlota = gastoFlotaPorCombustible.reduce((s, g) => s + g.gasto, 0);

  // Bonificaciones cobradas
  const ventasCobradas = ventasPeriodo.filter(v => v.estado === 'PAGADO_FINALIZADO');
  const ingresoVentas  = ventasCobradas.reduce((s, v) => s + (v.monto || 0), 0);
  const costoVentas    = ventasCobradas
    .filter(v => v.precio_venta_unitario != null)
    .reduce((s, v) => s + ((cppMap[v.tanque_origen_id] ?? 0) * (v.litros || 0)), 0);
  const gananciaBruta  = ingresoVentas - costoVentas;

  // Resumen período
  const totalGastos  = totalGastoFlota + costoVentas;
  const resultadoNeto = ingresoVentas - totalGastos;

  async function handleExport() {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();

      const ws1 = wb.addWorksheet('Compras');
      ws1.columns = [
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Tarjeta', key: 'tarjeta', width: 22 },
        { header: 'Consumidor', key: 'consumidor', width: 26 },
        { header: 'Combustible', key: 'combustible', width: 16 },
        { header: 'Litros', key: 'litros', width: 10 },
        { header: 'Monto', key: 'monto', width: 13 },
      ];
      compras.forEach(m => {
        const tarj = tarjetas.find(t => t.id === m.tarjeta_id);
        ws1.addRow({
          fecha: m.fecha,
          tarjeta: tarj?.alias || tarj?.id_tarjeta || '—',
          consumidor: m.consumidor_nombre || m.referencia || '—',
          combustible: m.combustible_nombre || '—',
          litros: m.litros || 0,
          monto: m.monto || 0,
        });
      });

      const ws2 = wb.addWorksheet('Bonificaciones');
      ws2.columns = [
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Trabajador', key: 'trabajador', width: 26 },
        { header: 'CI', key: 'ci', width: 12 },
        { header: 'Área', key: 'area', width: 16 },
        { header: 'Combustible', key: 'combustible', width: 16 },
        { header: 'Litros', key: 'litros', width: 10 },
        { header: 'Precio/L', key: 'precio', width: 10 },
        { header: 'Monto', key: 'monto', width: 13 },
        { header: 'Estado', key: 'estado', width: 16 },
      ];
      ventasPeriodo.forEach(v => {
        ws2.addRow({
          fecha: v.fecha_venta,
          trabajador: v.beneficiario_nombre,
          ci: v.beneficiario_ci || '—',
          area: v.beneficiario_area || '—',
          combustible: v.combustible_nombre,
          litros: v.litros,
          precio: v.precio_por_litro,
          monto: v.monto,
          estado: v.estado,
        });
      });

      const ws3 = wb.addWorksheet('Resumen');
      ws3.getColumn(1).width = 28;
      ws3.getColumn(2).width = 18;
      [
        ['Período', periodo],
        ['Gasto en compras', gastoCompras],
        ['Litros comprados', litrosComprados],
        ['Total bonificaciones (activas)', montoBonus],
        ['Bonificaciones pendientes de cobro', pendienteBonus],
      ].forEach(r => ws3.addRow(r));

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finanzas_${periodo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exportado correctamente');
    } catch (err) {
      console.error(err);
      toast.error('Error al exportar');
    }
  }

  if (!canManageFinanzas) {
    return (
      <div className="py-20 text-center space-y-3">
        <WalletCards className="w-10 h-10 text-slate-300 mx-auto" />
        <p className="text-slate-400 text-sm">Acceso restringido. Solo roles económico y superadmin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <WalletCards className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Finanzas</h1>
            <p className="text-xs text-slate-400">Resumen financiero del período</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="h-8 text-xs w-36"
          />
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Exportar
          </Button>
          <Link to={createPageUrl('Catalogos')}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8">
              <ExternalLink className="w-3.5 h-3.5" /> Catálogos
            </Button>
          </Link>
        </div>
      </div>

      {/* Bloque 1: Gasto flota */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 px-0.5">Gasto flota (compras en cupet)</p>
        {gastoFlotaPorCombustible.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 text-xs text-slate-400 text-center">Sin compras en el período</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gastoFlotaPorCombustible.map(c => (
              <Card key={c.nombre} className="border-0 shadow-sm">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-rose-50 text-rose-600">
                    <Fuel className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide truncate">{c.nombre}</p>
                    <p className="text-sm font-bold text-slate-800">{fmtL(c.litros)} L</p>
                    {c.gasto > 0
                      ? <p className="text-[11px] text-rose-600 font-medium">−{formatMonto(c.gasto)}</p>
                      : <p className="text-[11px] text-slate-400">Sin CPP definido</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
            {gastoFlotaPorCombustible.length > 1 && totalGastoFlota > 0 && (
              <Card className="border-0 shadow-sm bg-rose-50/40">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-rose-100 text-rose-600">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">Total gasto flota</p>
                    <p className="text-sm font-bold text-rose-700">−{formatMonto(totalGastoFlota)}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Bloque 2: Bonificaciones */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 px-0.5">Bonificaciones a trabajadores</p>
        {bonusPorCombustible.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3 text-xs text-slate-400 text-center">Sin bonificaciones en el período</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bonusPorCombustible.map(c => (
              <Card key={c.nombre} className="border-0 shadow-sm">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-violet-50 text-violet-600">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide truncate">{c.nombre}</p>
                    <p className="text-sm font-bold text-slate-800">{fmtL(c.litros)} L</p>
                    <div className="flex gap-2 mt-0.5 flex-wrap">
                      {c.cobrado > 0 && <p className="text-[11px] text-emerald-600">+{formatMonto(c.cobrado)}</p>}
                      {c.pendiente > 0 && <p className="text-[11px] text-orange-500">pdte: {formatMonto(c.pendiente)}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bloque 3: Resumen período */}
      <Card className="border-0 shadow-sm bg-slate-50/60">
        <CardContent className="p-4">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-3">Resumen financiero — {periodo}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-slate-400">Gasto flota</p>
              <p className="text-base font-bold text-rose-600 tabular-nums">−{formatMonto(totalGastoFlota)}</p>
              {totalGastoFlota === 0 && <p className="text-[10px] text-slate-300">Sin CPP</p>}
            </div>
            <div>
              <p className="text-[10px] text-slate-400">Costo bonificaciones</p>
              <p className="text-base font-bold text-rose-500 tabular-nums">−{formatMonto(costoVentas)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400">Ingreso bonificaciones</p>
              <p className="text-base font-bold text-emerald-600 tabular-nums">+{formatMonto(ingresoVentas)}</p>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <p className="text-[10px] text-slate-400">Ganancia bruta</p>
              <p className={`text-lg font-bold tabular-nums ${gananciaBruta >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {gananciaBruta >= 0 ? '+' : '−'}{formatMonto(Math.abs(gananciaBruta))}
              </p>
            </div>
          </div>
          {(totalGastoFlota === 0 || costoVentas === 0) && (
            <p className="text-[10px] text-slate-300 mt-2">Los valores con CPP 0 requieren definir precio de costo en los depósitos del ISO tank.</p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 text-xs">
          <TabsTrigger value="tarjetas" className="text-xs px-3 h-7">Tarjetas</TabsTrigger>
          <TabsTrigger value="bonificaciones" className="text-xs px-3 h-7">Bonificaciones</TabsTrigger>
          <TabsTrigger value="precios" className="text-xs px-3 h-7">Precios</TabsTrigger>
          <TabsTrigger value="conceptos" className="text-xs px-3 h-7">Conceptos</TabsTrigger>
        </TabsList>

        <TabsContent value="tarjetas" className="mt-4 space-y-4">
          <TarjetasTab movPeriodo={movPeriodo} tarjetas={tarjetas} periodo={periodo} loading={loadingMov} />
        </TabsContent>

        <TabsContent value="bonificaciones" className="mt-4">
          <BonificacionesTab
            ventas={ventasPeriodo}
            loading={loadingVentas}
            gananciaBruta={gananciaBruta}
            ingresoVentas={ingresoVentas}
            costoVentas={costoVentas}
            cppMap={cppMap}
          />
        </TabsContent>

        <TabsContent value="precios" className="mt-4 space-y-4">
          <ResumenPrecios />
          <PreciosDespacho />
          <CppAjustePanel />
        </TabsContent>

        <TabsContent value="conceptos" className="mt-4">
          <ConceptosPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tarjetas tab ──────────────────────────────────────────────────────────────

function TarjetasTab({ movPeriodo, tarjetas, periodo, loading }) {
  const [expandedId, setExpanded] = useState(null);

  const compras = movPeriodo.filter(m => m.tipo === 'COMPRA');

  const porTarjeta = useMemo(() => {
    const map = {};
    compras.forEach(m => {
      const key = m.tarjeta_id || '__sin__';
      if (!map[key]) {
        const t = tarjetas.find(t => t.id === m.tarjeta_id);
        map[key] = { nombre: t?.alias || t?.id_tarjeta || 'Sin tarjeta', litros: 0, monto: 0 };
      }
      map[key].litros += m.litros || 0;
      map[key].monto  += m.monto  || 0;
    });
    return Object.values(map).sort((a, b) => b.monto - a.monto);
  }, [compras, tarjetas]);

  const porCombustible = useMemo(() => {
    const map = {};
    compras.forEach(m => {
      const key = m.combustible_nombre || 'Sin clasificar';
      if (!map[key]) map[key] = { nombre: key, litros: 0, monto: 0 };
      map[key].litros += m.litros || 0;
      map[key].monto  += m.monto  || 0;
    });
    return Object.values(map).sort((a, b) => b.litros - a.litros);
  }, [compras]);

  const tarjetasSorted = useMemo(
    () => [...tarjetas].sort((a, b) => (a.alias || a.id_tarjeta).localeCompare(b.alias || b.id_tarjeta)),
    [tarjetas],
  );

  const movsByTarjeta = useMemo(() => {
    const map = {};
    movPeriodo.forEach(m => {
      if (!m.tarjeta_id) return;
      if (!map[m.tarjeta_id]) map[m.tarjeta_id] = [];
      map[m.tarjeta_id].push(m);
    });
    return map;
  }, [movPeriodo]);

  const gastoByTarjeta = useMemo(() => {
    const map = {};
    movPeriodo.filter(m => m.tipo === 'COMPRA').forEach(m => {
      if (!m.tarjeta_id) return;
      map[m.tarjeta_id] = (map[m.tarjeta_id] || 0) + (m.monto || 0);
    });
    return map;
  }, [movPeriodo]);

  return (
    <div className="space-y-4">
      {/* Resumen de compras del período */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-sky-400" /> Por tarjeta
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
            ) : porTarjeta.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Sin compras en el período</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {porTarjeta.map(r => (
                  <div key={r.nombre} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <span className="flex-1 text-slate-700 truncate">{r.nombre}</span>
                    <span className="text-slate-400 tabular-nums">{fmtL(r.litros)} L</span>
                    <span className="font-semibold text-slate-800 tabular-nums w-24 text-right">{formatMonto(r.monto)}</span>
                  </div>
                ))}
                {porTarjeta.length > 1 && (
                  <div className="flex items-center gap-3 px-4 py-2.5 text-xs bg-slate-50/80 border-t border-slate-100">
                    <span className="flex-1 text-slate-500 font-medium">Total</span>
                    <span className="text-slate-500 tabular-nums font-medium">{fmtL(porTarjeta.reduce((s, r) => s + r.litros, 0))} L</span>
                    <span className="font-bold text-slate-800 tabular-nums w-24 text-right">{formatMonto(porTarjeta.reduce((s, r) => s + r.monto, 0))}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Fuel className="w-4 h-4 text-amber-400" /> Por combustible
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
            ) : porCombustible.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Sin compras en el período</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {porCombustible.map(r => (
                  <div key={r.nombre} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <span className="flex-1 text-slate-700 truncate">{r.nombre}</span>
                    <span className="text-slate-400 tabular-nums">{fmtL(r.litros)} L</span>
                    <span className="font-semibold text-slate-800 tabular-nums w-24 text-right">{formatMonto(r.monto)}</span>
                  </div>
                ))}
                {porCombustible.length > 1 && (
                  <div className="flex items-center gap-3 px-4 py-2.5 text-xs bg-slate-50/80 border-t border-slate-100">
                    <span className="flex-1 text-slate-500 font-medium">Total</span>
                    <span className="text-slate-500 tabular-nums font-medium">{fmtL(porCombustible.reduce((s, r) => s + r.litros, 0))} L</span>
                    <span className="font-bold text-slate-800 tabular-nums w-24 text-right">{formatMonto(porCombustible.reduce((s, r) => s + r.monto, 0))}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    <Card className="border-0 shadow-sm">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">
          Tarjetas — {tarjetasSorted.length} registrada{tarjetasSorted.length !== 1 ? 's' : ''}
          <span className="ml-2 font-normal text-slate-400">Movimientos de {periodo}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
          {tarjetasSorted.map(t => {
            const isExpanded = expandedId === t.id;
            const movsTarjeta = (movsByTarjeta[t.id] || []);
            const gasto = gastoByTarjeta[t.id] || 0;

            return (
              <div key={t.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.activa !== false ? 'bg-sky-100' : 'bg-slate-100'}`}>
                    <CreditCard className={`w-4 h-4 ${t.activa !== false ? 'text-sky-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800 truncate">{t.alias || t.id_tarjeta}</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{t.id_tarjeta}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5">{t.moneda}</Badge>
                      {t.activa === false && <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-slate-400">Inactiva</Badge>}
                    </div>
                    {gasto > 0 && (
                      <p className="text-xs text-orange-600 mt-0.5">Gasto del período: {formatMonto(gasto)}</p>
                    )}
                    {movsTarjeta.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-0.5">{movsTarjeta.length} movimiento{movsTarjeta.length !== 1 ? 's' : ''} en {periodo}</p>
                    )}
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                    onClick={() => setExpanded(isExpanded ? null : t.id)}>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </Button>
                </div>

                {isExpanded && (
                  <div className="bg-slate-50/60 border-t border-slate-100 px-4 py-3">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Movimientos — {periodo}</p>
                    {loading ? (
                      <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
                    ) : movsTarjeta.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin movimientos en el período</p>
                    ) : (
                      <div className="space-y-1.5">
                        {movsTarjeta.map(m => (
                          <div key={m.id} className="flex items-center gap-2 text-xs">
                            <span className="text-slate-400 tabular-nums w-20 shrink-0">{m.fecha}</span>
                            <Badge variant="outline" className={`text-[10px] py-0 px-1.5 shrink-0 ${m.tipo === 'COMPRA' ? 'border-orange-200 text-orange-700' : 'border-purple-200 text-purple-700'}`}>
                              {m.tipo}
                            </Badge>
                            <span className="text-slate-600 truncate flex-1 min-w-0">
                              {m.consumidor_nombre || m.referencia || '—'}
                              {m.litros ? <span className="text-slate-400 ml-1">{fmtL(m.litros)} L</span> : null}
                            </span>
                            {m.monto ? <span className="font-medium tabular-nums shrink-0 text-orange-600">{formatMonto(m.monto)}</span> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {tarjetasSorted.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-400">
              No hay tarjetas.{' '}
              <Link to={createPageUrl('Catalogos')} className="text-sky-600 hover:underline">Crear en Catálogos</Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </div>
  );
}

// ── Bonificaciones tab ────────────────────────────────────────────────────────


function BonificacionesTab({ ventas, loading, gananciaBruta = 0, ingresoVentas = 0, costoVentas = 0, cppMap = {} }) {
  const activas = ventas.filter(v => v.estado !== 'CANCELADO' && v.estado !== 'ANULADO');
  const totalMonto = activas.reduce((s, v) => s + (v.monto || 0), 0);
  const totalLitros = activas.reduce((s, v) => s + (v.litros || 0), 0);
  const cobrado = ventas.filter(v => v.estado === 'PAGADO_FINALIZADO' || v.estado === 'PAGADO')
    .reduce((s, v) => s + (v.monto || 0), 0);
  const pendiente = ventas.filter(v => v.estado === 'PENDIENTE' || v.estado === 'ENTREGADO')
    .reduce((s, v) => s + (v.monto || 0), 0);
  const tieneGanancia = ingresoVentas > 0 || costoVentas > 0;

  const kpis = [
    { label: 'Total bonificaciones', value: formatMonto(totalMonto), icon: DollarSign, color: 'text-violet-600 bg-violet-50' },
    { label: 'Litros entregados', value: `${fmtL(totalLitros)} L`, icon: Fuel, color: 'text-amber-600 bg-amber-50' },
    { label: 'Cobrado', value: formatMonto(cobrado), icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Pendiente cobro', value: formatMonto(pendiente), icon: Clock, color: 'text-orange-600 bg-orange-50' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.color}`}>
                <k.icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{k.label}</p>
                <p className="text-sm font-bold text-slate-800 truncate">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {tieneGanancia && (
        <Card className="border-0 shadow-sm bg-gradient-to-r from-emerald-50 to-teal-50">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Ganancia bruta del período
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Ingreso ventas</p>
                <p className="font-bold text-slate-800">{formatMonto(ingresoVentas)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Costo (CPP)</p>
                <p className="font-bold text-slate-800">{formatMonto(costoVentas)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Ganancia</p>
                <p className={`font-bold text-lg ${gananciaBruta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatMonto(gananciaBruta)}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2">Solo incluye ventas cobradas con precio de venta registrado.</p>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 pb-2 flex flex-row items-center gap-2">
          <Users className="w-4 h-4 text-violet-400" />
          <CardTitle className="text-sm font-semibold text-slate-700">
            Bonificaciones del período — {ventas.length} registro{ventas.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
          ) : ventas.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Sin bonificaciones en el período</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <th className="text-left px-4 py-2 text-slate-500 font-medium">Fecha</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-medium">Trabajador</th>
                    <th className="text-left px-4 py-2 text-slate-500 font-medium">Combustible</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-medium">Litros</th>
                    <th className="text-right px-4 py-2 text-slate-500 font-medium">Monto</th>
                    {tieneGanancia && <th className="text-right px-4 py-2 text-slate-500 font-medium">Ganancia</th>}
                    <th className="text-center px-4 py-2 text-slate-500 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ventas.map(v => {
                    return (
                      <tr key={v.id} className="hover:bg-slate-50/40">
                        <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{v.fecha_venta}</td>
                        <td className="px-4 py-2.5 text-slate-700 max-w-[160px]">
                          <div className="truncate">{v.beneficiario_nombre}</div>
                          {v.beneficiario_area && <div className="text-[10px] text-slate-400 truncate">{v.beneficiario_area}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{v.combustible_nombre}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmtL(v.litros)} L</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">{formatMonto(v.monto)}</td>
                        {tieneGanancia && (() => {
                          const cpp = cppMap[v.tanque_origen_id];
                          if (v.precio_venta_unitario != null && cpp != null) {
                            const g = (v.precio_venta_unitario - cpp) * (v.litros || 0);
                            return <td className={`px-4 py-2.5 text-right tabular-nums text-xs font-medium ${g >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatMonto(g)}</td>;
                          }
                          return <td className="px-4 py-2.5 text-right text-slate-300 text-xs">—</td>;
                        })()}
                        <td className="px-4 py-2.5 text-center">
                          <VentaEstadoBadge estado={v.estado} />
                        </td>
                      </tr>
                    );
                  })}
                  {ventas.length > 0 && (
                    <tr className="border-t border-slate-200 bg-slate-50/80">
                      <td className="px-4 py-2.5 text-slate-500 font-medium text-xs" colSpan={3}>Total (excluye canceladas)</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-700 text-xs">{fmtL(totalLitros)} L</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-800 text-xs">{formatMonto(totalMonto)}</td>
                      {tieneGanancia && <td className={`px-4 py-2.5 text-right tabular-nums font-bold text-xs ${gananciaBruta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMonto(gananciaBruta)}</td>}
                      <td className="px-4 py-2.5" />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Resumen precios ───────────────────────────────────────────────────────────

function ResumenPrecios() {
  const { data: precios      = [] } = useQuery({ queryKey: ['precios'],      queryFn: () => base44.entities.PrecioCombustible.list('-fecha_desde', 200) });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });

  const today = new Date().toISOString().slice(0, 10);

  const preciosPorComb = useMemo(() => {
    const map      = {};
    const byNombre = {};
    combustibles.forEach(c => {
      map[c.id] = { nombre: c.nombre, activa: c.activa, vigente: null };
      byNombre[c.nombre?.toLowerCase().trim()] = c.id;
    });
    precios.forEach(p => {
      const cid = (p.combustible_id && map[p.combustible_id])
        ? p.combustible_id
        : byNombre[p.combustible_nombre?.toLowerCase().trim()];
      if (!cid || !map[cid]) return;
      const esVigente = p.fecha_desde <= today && (!p.fecha_hasta || p.fecha_hasta >= today);
      if (esVigente && !map[cid].vigente) map[cid].vigente = p;
    });
    return Object.values(map).filter(g => g.activa !== false).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [combustibles, precios, today]);

  if (preciosPorComb.length === 0) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <CardTitle className="text-sm font-semibold text-slate-700">Precios vigentes</CardTitle>
        </div>
        <Link to={createPageUrl('Catalogos')}>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-slate-400">
            <ExternalLink className="w-3 h-3" /> Gestionar
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-50">
          {preciosPorComb.map(g => (
            <div key={g.nombre} className="flex items-center gap-3 px-4 py-3">
              <Fuel className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm text-slate-700 flex-1">{g.nombre}</span>
              {g.vigente ? (
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 text-xs font-semibold">
                  $ {Number(g.vigente.precio_por_litro).toFixed(2)} / L
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs text-slate-400">Sin precio</Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Precios de despacho por tipo de consumidor ────────────────────────────────

const MONEDAS = ['CUP', 'USD', 'MLC'];
const emptyForm = { tipo_consumidor_id: '', combustible_id: '', precio_por_litro: '', moneda: 'CUP', fecha_desde: '' };

function PreciosDespacho() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useUserRole();
  const today = new Date().toISOString().slice(0, 10);

  const { data: precios     = [], isLoading } = useQuery({ queryKey: ['precios-despacho'], queryFn: () => base44.entities.PrecioDespachoTipo.list('-fecha_desde', 200) });
  const { data: tiposConsumidor = [] }        = useQuery({ queryKey: ['tipos-consumidor'], queryFn: () => base44.entities.TipoConsumidor.list() });
  const { data: combustibles    = [] }        = useQuery({ queryKey: ['combustibles'],    queryFn: () => base44.entities.TipoCombustible.list() });

  const [form, setForm]         = useState(emptyForm);
  const [editId, setEditId]     = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const crearMut = useMutation({
    mutationFn: d => base44.entities.PrecioDespachoTipo.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['precios-despacho'] }); setForm(emptyForm); setShowForm(false); setEditId(null); toast.success('Precio registrado'); },
    onError:   () => toast.error('Error al guardar'),
  });

  const editarMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.PrecioDespachoTipo.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['precios-despacho'] }); setForm(emptyForm); setShowForm(false); setEditId(null); toast.success('Precio actualizado'); },
    onError:   () => toast.error('Error al guardar'),
  });

  const eliminarMut = useMutation({
    mutationFn: id => base44.entities.PrecioDespachoTipo.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['precios-despacho'] }); setToDelete(null); toast.success('Eliminado'); },
    onError:   () => toast.error('Error al eliminar'),
  });

  function openEdit(p) {
    setForm({
      tipo_consumidor_id: p.tipo_consumidor_id,
      combustible_id:     p.combustible_id || '',
      precio_por_litro:   String(p.precio_por_litro),
      moneda:             p.moneda,
      fecha_desde:        p.fecha_desde,
    });
    setEditId(p.id);
    setShowForm(true);
  }

  function handleSave(e) {
    e.preventDefault();
    if (!form.tipo_consumidor_id) { toast.error('Seleccione un tipo de consumidor'); return; }
    if (!form.precio_por_litro || isNaN(+form.precio_por_litro) || +form.precio_por_litro <= 0) { toast.error('Precio inválido'); return; }
    if (!form.fecha_desde) { toast.error('Indique fecha desde'); return; }
    const payload = {
      tipo_consumidor_id: form.tipo_consumidor_id,
      combustible_id:     form.combustible_id || null,
      precio_por_litro:   +form.precio_por_litro,
      moneda:             form.moneda,
      fecha_desde:        form.fecha_desde,
    };
    if (editId) editarMut.mutate({ id: editId, d: payload });
    else crearMut.mutate(payload);
  }

  const grouped = useMemo(() => {
    const map = {};
    precios.forEach(p => {
      if (!map[p.tipo_consumidor_id]) map[p.tipo_consumidor_id] = [];
      map[p.tipo_consumidor_id].push(p);
    });
    return map;
  }, [precios]);

  const tipoNombre = id => tiposConsumidor.find(t => t.id === id)?.nombre ?? id;
  const combNombre = id => id ? (combustibles.find(c => c.id === id)?.nombre ?? '—') : 'Todos';
  const esVigente  = p => p.fecha_desde <= today && (!p.fecha_hasta || p.fecha_hasta >= today);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-violet-500" />
          <CardTitle className="text-sm font-semibold text-slate-700">Precios de despacho por tipo</CardTitle>
        </div>
        {isSuperAdmin && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(v => !v); }}>
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-4 pt-0 space-y-4">
        {showForm && (
          <form onSubmit={handleSave} className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/60">
            <p className="text-xs font-semibold text-slate-600">{editId ? 'Editar precio' : 'Nuevo precio'}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Tipo de consumidor *</Label>
                <Select value={form.tipo_consumidor_id} onValueChange={v => setForm(f => ({ ...f, tipo_consumidor_id: v }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposConsumidor.filter(t => t.activa !== false).map(t => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Combustible (opcional)</Label>
                <Select value={form.combustible_id || '__todos__'} onValueChange={v => setForm(f => ({ ...f, combustible_id: v === '__todos__' ? '' : v }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos__" className="text-xs">Todos</SelectItem>
                    {combustibles.filter(c => c.activa !== false).map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Precio por litro *</Label>
                <Input type="number" min="0" step="0.0001" placeholder="0.0000" className="h-8 text-xs"
                  value={form.precio_por_litro} onChange={e => setForm(f => ({ ...f, precio_por_litro: e.target.value }))} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Moneda</Label>
                <Select value={form.moneda} onValueChange={v => setForm(f => ({ ...f, moneda: v }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONEDAS.map(m => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1 col-span-2">
                <Label className="text-xs text-slate-500">Vigente desde *</Label>
                <Input type="date" className="h-8 text-xs" value={form.fecha_desde}
                  onChange={e => setForm(f => ({ ...f, fecha_desde: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={crearMut.isPending || editarMut.isPending}>
                {(crearMut.isPending || editarMut.isPending) ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Guardando…</> : 'Guardar'}
              </Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
        ) : precios.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No hay precios configurados.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([tcId, rows]) => (
              <div key={tcId}>
                <p className="text-xs font-semibold text-slate-600 mb-1">{tipoNombre(tcId)}</p>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                  {rows.map(p => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                      <Fuel className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-slate-500 w-20 shrink-0">{combNombre(p.combustible_id)}</span>
                      <span className="font-semibold text-slate-800 flex-1">
                        {parseFloat(Number(p.precio_por_litro).toFixed(1))} {p.moneda}/L
                      </span>
                      <span className="text-slate-400 tabular-nums">{p.fecha_desde}</span>
                      <Badge className={`text-[10px] py-0 px-1.5 shrink-0 ${esVigente(p) ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                        {esVigente(p) ? 'Vigente' : 'Futuro'}
                      </Badge>
                      {isSuperAdmin && <>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-slate-300 hover:text-sky-500"
                          onClick={() => openEdit(p)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-slate-300 hover:text-red-500"
                          onClick={() => setToDelete(p)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {toDelete && (
        <ConfirmDialog
          open
          title="Eliminar precio"
          description={`¿Eliminar el precio de ${tipoNombre(toDelete.tipo_consumidor_id)} vigente desde ${toDelete.fecha_desde}?`}
          onConfirm={() => eliminarMut.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
          loading={eliminarMut.isPending}
        />
      )}
    </Card>
  );
}

// ── Conceptos de precio ───────────────────────────────────────────────────────

const emptyConceptoForm = { nombre: '', descripcion: '', activo: true };

function ConceptosPanel() {
  const qc = useQueryClient();
  const { canManageFinanzas } = useUserRole();

  const { data: conceptos = [], isLoading } = useQuery({
    queryKey: ['conceptos-precio'],
    queryFn: () => base44.entities.ConceptoPrecio.list(),
  });

  const [form, setForm]         = useState(emptyConceptoForm);
  const [editId, setEditId]     = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const crearMut = useMutation({
    mutationFn: d => base44.entities.ConceptoPrecio.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conceptos-precio'] }); setForm(emptyConceptoForm); setShowForm(false); setEditId(null); toast.success('Concepto creado'); },
    onError: () => toast.error('Error al guardar'),
  });

  const editarMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.ConceptoPrecio.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conceptos-precio'] }); setForm(emptyConceptoForm); setShowForm(false); setEditId(null); toast.success('Concepto actualizado'); },
    onError: () => toast.error('Error al guardar'),
  });

  const eliminarMut = useMutation({
    mutationFn: id => base44.entities.ConceptoPrecio.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conceptos-precio'] }); setToDelete(null); toast.success('Eliminado'); },
    onError: () => toast.error('Error al eliminar'),
  });

  function openEdit(c) {
    setForm({ nombre: c.nombre, descripcion: c.descripcion ?? '', activo: c.activo });
    setEditId(c.id);
    setShowForm(true);
  }

  function handleSave(e) {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    const payload = { nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, activo: form.activo };
    if (editId) editarMut.mutate({ id: editId, d: payload });
    else crearMut.mutate(payload);
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-slate-700">Conceptos de precio</CardTitle>
        {canManageFinanzas && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setForm(emptyConceptoForm); setEditId(null); setShowForm(true); }}>
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-2">
        <p className="text-xs text-slate-400">
          Los conceptos agrupan tipos de consumidor bajo un mismo precio de despacho. Se asignan desde Catálogos → Tipos de consumidor.
        </p>
        {isLoading ? (
          <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
        ) : conceptos.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Sin conceptos registrados</p>
        ) : (
          <div className="space-y-1.5 mt-2">
            {conceptos.map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                <Tag className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-800">{c.nombre}</span>
                  {c.descripcion && <span className="text-xs text-slate-400 ml-2">{c.descripcion}</span>}
                </div>
                <Badge variant="outline" className={`text-[10px] px-1.5 ${c.activo ? 'text-emerald-700 border-emerald-200' : 'text-slate-400'}`}>
                  {c.activo ? 'Activo' : 'Inactivo'}
                </Badge>
                {canManageFinanzas && (
                  <>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-300 hover:text-sky-500" onClick={() => openEdit(c)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => setToDelete(c)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <Dialog open={showForm} onOpenChange={open => { if (!open) setShowForm(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">{editId ? 'Editar concepto' : 'Nuevo concepto'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input className="h-8 text-sm mt-1" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Uso logístico" />
              </div>
              <div>
                <Label className="text-xs">Descripción (opcional)</Label>
                <Input className="h-8 text-sm mt-1" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="concepto-activo" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                <Label htmlFor="concepto-activo" className="text-xs">Activo</Label>
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={crearMut.isPending || editarMut.isPending}>
                {crearMut.isPending || editarMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {toDelete && (
          <ConfirmDialog
            open
            title="Eliminar concepto"
            description={`¿Eliminar el concepto "${toDelete.nombre}"?`}
            onConfirm={() => eliminarMut.mutate(toDelete.id)}
            onCancel={() => setToDelete(null)}
            loading={eliminarMut.isPending}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ── CPP Ajuste manual ────────────────────────────────────────────────────────

function CppAjustePanel() {
  const qc = useQueryClient();
  const { canManageFinanzas } = useUserRole();

  const { data: tanques = [] } = useQuery({
    queryKey: ['consumidores'],
    queryFn: () => base44.entities.Consumidor.list(),
    staleTime: 5 * 60_000,
    select: data => data.filter(c =>
      c.categoria === 'deposito' ||
      (c.tipo_consumidor_nombre || '').toLowerCase().match(/tanque|iso|reserva|almac/)
    ),
  });

  const { data: cppTanques = [] } = useQuery({
    queryKey: ['cpp-tanques'],
    queryFn: async () => {
      const { data } = await supabase.from('v_cpp_por_tanque').select('*');
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: ajustes = [] } = useQuery({
    queryKey: ['cpp-ajustes'],
    queryFn: () => base44.entities.CppAjuste.list('-fecha', 100),
  });

  const [form, setForm] = useState({ consumidor_id: '', cpp_manual: '', motivo: '', fecha: new Date().toISOString().slice(0, 10) });
  const [showForm, setShowForm] = useState(false);

  const crearMut = useMutation({
    mutationFn: d => base44.entities.CppAjuste.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cpp-ajustes'] });
      qc.invalidateQueries({ queryKey: ['cpp-tanques'] });
      qc.invalidateQueries({ queryKey: ['cpp-combustibles'] });
      setForm({ consumidor_id: '', cpp_manual: '', motivo: '', fecha: new Date().toISOString().slice(0, 10) });
      setShowForm(false);
      toast.success('Ajuste de CPP registrado');
    },
    onError: () => toast.error('Error al guardar'),
  });

  const eliminarMut = useMutation({
    mutationFn: id => base44.entities.CppAjuste.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cpp-ajustes'] });
      qc.invalidateQueries({ queryKey: ['cpp-tanques'] });
      qc.invalidateQueries({ queryKey: ['cpp-combustibles'] });
      toast.success('Ajuste eliminado — CPP vuelve al cálculo automático');
    },
    onError: () => toast.error('Error al eliminar'),
  });

  const cppCalcMap = useMemo(() => {
    const m = {};
    cppTanques.forEach(r => { m[r.consumidor_id] = { cpp: r.cpp, cpp_calc: r.cpp_calc }; });
    return m;
  }, [cppTanques]);

  function handleSave(e) {
    e.preventDefault();
    if (!form.consumidor_id) { toast.error('Seleccione un tanque'); return; }
    if (!form.cpp_manual || isNaN(+form.cpp_manual) || +form.cpp_manual <= 0) { toast.error('CPP inválido'); return; }
    crearMut.mutate({
      consumidor_id: form.consumidor_id,
      cpp_manual:    +form.cpp_manual,
      motivo:        form.motivo || null,
      fecha:         form.fecha,
    });
  }

  const tanqueNombre = id => tanques.find(t => t.id === id)?.nombre ?? id;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-700">Ajuste manual de CPP</CardTitle>
          <p className="text-xs text-slate-400 mt-0.5">Sobreescribe el costo promedio calculado para un tanque ISO.</p>
        </div>
        {canManageFinanzas && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5" /> Nuevo ajuste
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">

        {/* CPP actual por tanque */}
        {tanques.length > 0 && (
          <div className="space-y-1.5">
            {tanques.map(t => {
              const info = cppCalcMap[t.id];
              const tieneAjuste = ajustes.some(a => a.consumidor_id === t.id);
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <Fuel className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800">{t.nombre}</span>
                    {t.combustible_nombre && <span className="text-xs text-slate-400 ml-2">{t.combustible_nombre}</span>}
                  </div>
                  {info ? (
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-bold ${tieneAjuste ? 'text-amber-700' : 'text-teal-700'}`}>
                        {Number(info.cpp).toFixed(4)} /L
                      </p>
                      {tieneAjuste && info.cpp_calc != null && (
                        <p className="text-[10px] text-slate-400">calc: {Number(info.cpp_calc).toFixed(4)}</p>
                      )}
                      {tieneAjuste && <Badge variant="outline" className="text-[10px] px-1 text-amber-600 border-amber-200">Ajustado</Badge>}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300">Sin depósitos con precio</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Historial de ajustes */}
        {ajustes.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-1.5">Historial de ajustes</p>
            <div className="space-y-1">
              {ajustes.slice(0, 10).map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs text-slate-600 bg-amber-50/50 rounded-lg px-3 py-1.5 border border-amber-100">
                  <span className="font-medium text-slate-700 flex-1 truncate">{tanqueNombre(a.consumidor_id)}</span>
                  <span className="text-amber-700 font-bold tabular-nums">{Number(a.cpp_manual).toFixed(4)} /L</span>
                  <span className="text-slate-400">{a.fecha}</span>
                  {a.motivo && <span className="text-slate-400 truncate max-w-[120px]">{a.motivo}</span>}
                  {canManageFinanzas && (
                    <Button size="icon" variant="ghost" className="h-5 w-5 text-slate-300 hover:text-red-500 shrink-0"
                      onClick={() => eliminarMut.mutate(a.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Dialog open={showForm} onOpenChange={open => { if (!open) setShowForm(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">Ajuste manual de CPP</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <Label className="text-xs">Tanque ISO</Label>
                <Select value={form.consumidor_id} onValueChange={v => setForm(f => ({ ...f, consumidor_id: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {tanques.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Nuevo CPP (costo por litro)</Label>
                <Input type="number" step="0.0001" min="0" placeholder="Ej: 25.5000" className="h-8 text-sm mt-1"
                  value={form.cpp_manual} onChange={e => setForm(f => ({ ...f, cpp_manual: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Fecha efectiva</Label>
                <Input type="date" className="h-8 text-sm mt-1" value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Motivo (opcional)</Label>
                <Input className="h-8 text-sm mt-1" placeholder="Ej: Corrección por diferencia de factura"
                  value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} />
              </div>
              <Button type="submit" size="sm" className="w-full" disabled={crearMut.isPending}>
                {crearMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar ajuste'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
