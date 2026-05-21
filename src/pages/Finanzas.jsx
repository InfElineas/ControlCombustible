import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { CreditCard, DollarSign, ChevronDown, ChevronUp, WalletCards, Fuel, ExternalLink, TrendingUp } from 'lucide-react';

export default function Finanzas() {
  const { canManageFinanzas } = useUserRole();

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <WalletCards className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Finanzas</h1>
            <p className="text-xs text-slate-400">Resumen financiero de tarjetas y precios</p>
          </div>
        </div>
        <Link to={createPageUrl('Catalogos')}>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <ExternalLink className="w-3.5 h-3.5" /> Gestionar catálogos
          </Button>
        </Link>
      </div>

      <ResumenTarjetas />
      <ResumenPrecios />
    </div>
  );
}

// ── Resumen tarjetas ──────────────────────────────────────────────────────────

function ResumenTarjetas() {
  const { data: tarjetas    = [] } = useQuery({ queryKey: ['tarjetas'],   queryFn: () => base44.entities.Tarjeta.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 2000) });

  const [expandedId, setExpanded] = useState(null);

  const mesActual = new Date().toISOString().slice(0, 7);

  const gastoMes = useMemo(() =>
    movimientos.filter(m => m.tipo === 'COMPRA' && m.fecha?.startsWith(mesActual) && m.monto)
      .reduce((s, m) => s + m.monto, 0),
    [movimientos, mesActual],
  );

  const tarjetasSorted = useMemo(
    () => [...tarjetas].sort((a, b) => (a.alias || a.id_tarjeta).localeCompare(b.alias || b.id_tarjeta)),
    [tarjetas],
  );

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Tarjetas activas', value: tarjetas.filter(t => t.activa !== false).length, icon: CreditCard, color: 'text-sky-600 bg-sky-50' },
          { label: 'Gasto del mes',    value: formatMonto(gastoMes), icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
        ].map(k => (
          <Card key={k.label} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${k.color}`}>
                <k.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{k.label}</p>
                <p className="text-sm font-bold text-slate-800">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista tarjetas (solo lectura) */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">
            Tarjetas — {tarjetasSorted.length} registrada{tarjetasSorted.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {tarjetasSorted.map(t => {
              const isExpanded = expandedId === t.id;
              const movsTarjeta = movimientos
                .filter(m => m.tarjeta_id === t.id)
                .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
                .slice(0, 5);
              const gastoTarjetaMes = movimientos
                .filter(m => m.tarjeta_id === t.id && m.tipo === 'COMPRA' && m.fecha?.startsWith(mesActual) && m.monto)
                .reduce((s, m) => s + m.monto, 0);

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
                      {gastoTarjetaMes > 0 && (
                        <p className="text-xs text-orange-600 mt-0.5">Gasto del mes: {formatMonto(gastoTarjetaMes)}</p>
                      )}
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                      onClick={() => setExpanded(isExpanded ? null : t.id)}>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="bg-slate-50/60 border-t border-slate-100 px-4 py-3">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-2">Últimos movimientos</p>
                      {movsTarjeta.length === 0 ? (
                        <p className="text-xs text-slate-400">Sin movimientos registrados</p>
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
                                {m.litros ? <span className="text-slate-400 ml-1">{m.litros}L</span> : null}
                              </span>
                              {m.monto && <span className="font-medium tabular-nums shrink-0 text-orange-600">-{formatMonto(m.monto)}</span>}
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

// ── Resumen precios ───────────────────────────────────────────────────────────

function ResumenPrecios() {
  const { data: precios      = [] } = useQuery({ queryKey: ['precios'],      queryFn: () => base44.entities.PrecioCombustible.list('-fecha_desde', 200) });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });

  const today = new Date().toISOString().slice(0, 10);

  const preciosPorComb = useMemo(() => {
    const map = {};
    combustibles.forEach(c => { map[c.id] = { nombre: c.nombre, activa: c.activa, vigente: null }; });
    precios.forEach(p => {
      if (!map[p.combustible_id]) return;
      const esVigente = p.fecha_desde <= today && (!p.fecha_hasta || p.fecha_hasta >= today);
      if (esVigente && !map[p.combustible_id].vigente) map[p.combustible_id].vigente = p;
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
