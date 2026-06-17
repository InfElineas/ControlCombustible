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

  const kpis = [
    { label: 'Gasto compras', desc: 'Compras en surtidores externos', value: formatMonto(gastoCompras), icon: DollarSign, color: 'text-sky-600 bg-sky-50' },
    { label: 'Litros comprados', desc: 'Total litros adquiridos', value: `${fmtL(litrosComprados)} L`, icon: Fuel, color: 'text-amber-600 bg-amber-50' },
    { label: 'Bonificaciones', desc: 'Monto total del período', value: formatMonto(montoBonus), icon: Users, color: 'text-violet-600 bg-violet-50' },
    { label: 'Pendiente cobro', desc: 'Bonificaciones sin cobrar', value: formatMonto(pendienteBonus), icon: Clock, color: 'text-orange-600 bg-orange-50' },
  ];

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

      {/* KPIs */}
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
                {k.desc && <p className="text-[10px] text-slate-400 leading-tight mt-0.5 hidden sm:block">{k.desc}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Balance financiero del período */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-3">Balance financiero — {periodo}</p>
          <div className="flex flex-wrap gap-x-8 gap-y-2 items-end">
            <div>
              <p className="text-[10px] text-slate-400">Gasto en compras</p>
              <p className="text-lg font-bold text-rose-600 tabular-nums">−{formatMonto(gastoCompras)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400">Cobrado en bonificaciones</p>
              <p className="text-lg font-bold text-emerald-600 tabular-nums">+{formatMonto(cobradoBonus)}</p>
            </div>
            <div className="border-l border-slate-200 pl-8">
              <p className="text-[10px] text-slate-400">Flujo neto de caja</p>
              <p className={`text-lg font-bold tabular-nums ${flujoNeto >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {flujoNeto >= 0 ? `+${formatMonto(flujoNeto)}` : `−${formatMonto(Math.abs(flujoNeto))}`}
              </p>
            </div>
            {pendienteBonus > 0 && (
              <div className="ml-auto text-right">
                <p className="text-[10px] text-orange-400">Aún por cobrar</p>
                <p className="text-base font-bold text-orange-600 tabular-nums">{formatMonto(pendienteBonus)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-8 text-xs">
          <TabsTrigger value="tarjetas" className="text-xs px-3 h-7">Tarjetas</TabsTrigger>
          <TabsTrigger value="bonificaciones" className="text-xs px-3 h-7">Bonificaciones</TabsTrigger>
          <TabsTrigger value="precios" className="text-xs px-3 h-7">Precios</TabsTrigger>
        </TabsList>

        <TabsContent value="tarjetas" className="mt-4 space-y-4">
          <TarjetasTab movPeriodo={movPeriodo} tarjetas={tarjetas} periodo={periodo} loading={loadingMov} />
        </TabsContent>

        <TabsContent value="bonificaciones" className="mt-4">
          <BonificacionesTab ventas={ventasPeriodo} loading={loadingVentas} />
        </TabsContent>

        <TabsContent value="precios" className="mt-4 space-y-4">
          <ResumenPrecios />
          <PreciosDespacho />
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


function BonificacionesTab({ ventas, loading }) {
  const activas = ventas.filter(v => v.estado !== 'CANCELADO' && v.estado !== 'ANULADO');
  const totalMonto = activas.reduce((s, v) => s + (v.monto || 0), 0);
  const totalLitros = activas.reduce((s, v) => s + (v.litros || 0), 0);
  const cobrado = ventas.filter(v => v.estado === 'PAGADO_FINALIZADO' || v.estado === 'PAGADO')
    .reduce((s, v) => s + (v.monto || 0), 0);
  const pendiente = ventas.filter(v => v.estado === 'PENDIENTE' || v.estado === 'ENTREGADO')
    .reduce((s, v) => s + (v.monto || 0), 0);

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
