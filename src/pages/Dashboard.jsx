import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, TrendingDown, TrendingUp, Users, CalendarDays, User, ChevronDown, Warehouse, Navigation, Clock, DollarSign, Fuel, BarChart3 } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { supabase } from '@/api/supabaseClient';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import GastosMensualesChart from '@/components/dashboard/GastosMensualesChart';
import ConsumidoresPorTipo from '@/components/dashboard/ConsumidoresPorTipo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { filterMovimientosByMonth, getMonthOptionsFromMovimientos, computeChoferDelMes } from '@/lib/fuel-analytics';
import { useUserRole } from '@/components/ui-helpers/useUserRole';

function SectionTitle({ icon: Icon, title, iconColor = 'text-slate-400' }) {
  return (
    <div className="flex items-center gap-2 mb-3 text-slate-600">
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <span className="text-sm font-semibold uppercase tracking-wide">{title}</span>
    </div>
  );
}

export default function Dashboard() {
  const { role: rawRole } = useUserRole();
  const role = rawRole === 'admin' ? 'superadmin' : rawRole;
  const isOperador = role === 'operador';
  const isEconomico = role === 'economico';

  const [mesFiltro, setMesFiltro] = useState('ALL');
  const [statModal, setStatModal] = useState({ open: false, tipo: null });
  const [modalGrupoIdx, setModalGrupoIdx] = useState(0);
  const [expandedComb, setExpandedComb] = useState(new Set());
  const toggleComb = (nombre) => setExpandedComb(prev => {
    const next = new Set(prev);
    next.has(nombre) ? next.delete(nombre) : next.add(nombre);
    return next;
  });
  const [expandedCompras, setExpandedCompras] = useState(new Set());
  const toggleCompras = (nombre) => setExpandedCompras(prev => {
    const next = new Set(prev);
    next.has(nombre) ? next.delete(nombre) : next.add(nombre);
    return next;
  });
  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 2000), staleTime: 5 * 60_000 });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: tiposConsumidor = [] } = useQuery({ queryKey: ['tiposConsumidor'], queryFn: () => base44.entities.TipoConsumidor.list() });
  const { data: tipoCombustible = [] } = useQuery({ queryKey: ['tipoCombustible'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: conductores = [] } = useQuery({ queryKey: ['conductores'], queryFn: () => base44.entities.Conductor.list() });

  const hoy = new Date();
  const movimientosFiltrados = filterMovimientosByMonth(movimientos, mesFiltro);

  // Mes para el resumen GPS (usa el filtro seleccionado o el mes actual si es 'ALL')
  const mesGps = mesFiltro !== 'ALL' ? mesFiltro : hoy.toISOString().slice(0, 7);

  const { data: asigGpsMes = [] } = useQuery({
    queryKey: ['asig-gps-dashboard', mesGps],
    queryFn: async () => {
      const nextMonth = new Date(mesGps + '-01T12:00:00');
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextMonthStr = nextMonth.toISOString().slice(0, 7) + '-01';
      const { data } = await supabase
        .from('asignacion_ruta')
        .select('consumidor_id, tipo_viaje, km_reales, fecha, estado')
        .gte('fecha', mesGps + '-01')
        .lt('fecha', nextMonthStr)
        .neq('estado', 'cancelada');
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: ventasAllTime = [] } = useQuery({
    queryKey: ['ventas-logistica-economico'],
    queryFn: async () => {
      const { data } = await supabase
        .from('venta_trabajador')
        .select('id, estado, litros, monto, combustible_nombre, fecha_venta')
        .neq('estado', 'CANCELADO')
        .neq('estado', 'ANULADO');
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    enabled: isEconomico,
  });

  const opcionesMes = useMemo(() => {
    return getMonthOptionsFromMovimientos(movimientos);
  }, [movimientos]);

  const tarjetasById = useMemo(
    () => Object.fromEntries(tarjetas.map(t => [t.id, t])),
    [tarjetas],
  );

  const formatMoneySymbol = (monto, moneda = 'USD') => {
    return formatMonto(monto, moneda);
  };

  const consumidoresReservaIds = useMemo(() => {
    return new Set(
      consumidores
        .filter(c =>
          c.categoria === 'deposito' ||
          (!c.categoria && ((c.tipo_consumidor_nombre || '').toLowerCase().match(/tanque|reserva/)))
        )
        .map(c => c.id)
    );
  }, [consumidores]);

  const consumidoresSurtidorIds = useMemo(() => {
    const surtidorTipoIds = new Set(
      tiposConsumidor
        .filter(t => (t.nombre || '').toLowerCase().includes('surtidor'))
        .map(t => t.id)
    );
    return new Set(
      consumidores
        .filter(c =>
          c.categoria === 'surtidor' ||
          (!c.categoria && (
            (c.tipo_consumidor_nombre || '').toLowerCase().includes('surtidor') ||
            surtidorTipoIds.has(c.tipo_consumidor_id)
          ))
        )
        .map(c => c.id)
    );
  }, [consumidores, tiposConsumidor]);

  const obtenerCapacidadConsumidor = (consumidor) => {
    const capacidadTanque = Number(consumidor?.datos_tanque?.capacidad_litros);
    if (Number.isFinite(capacidadTanque) && capacidadTanque > 0) return capacidadTanque;
    const capacidadVehiculo = Number(consumidor?.datos_vehiculo?.capacidad_tanque);
    if (Number.isFinite(capacidadVehiculo) && capacidadVehiculo > 0) return capacidadVehiculo;
    return 0;
  };

  const obtenerLitrosInicialesConsumidor = (consumidor, combustibleId, combustibleNombre) => {
    if (!consumidor) return 0;
    const inicial = Number(consumidor.litros_iniciales) || 0;
    if (inicial <= 0) return 0;
    if (consumidor.combustible_id && combustibleId) return consumidor.combustible_id === combustibleId ? inicial : 0;
    if (consumidor.combustible_nombre && combustibleNombre) {
      return consumidor.combustible_nombre.toLowerCase() === combustibleNombre.toLowerCase() ? inicial : 0;
    }
    return inicial;
  };

  const resumenPorCombustible = useMemo(() => {
    const keys = new Set([
      ...tipoCombustible.map(c => c.nombre).filter(Boolean),
      ...movimientos.map(m => m.combustible_nombre).filter(Boolean),
    ]);

    return [...keys].map((nombreCombustible) => {
      const combustibleRef = tipoCombustible.find(c => c.nombre === nombreCombustible) || null;
      const combustibleIdRef = combustibleRef?.id;
      const comprasHistoricas = movimientos.filter(m => m.tipo === 'COMPRA' && m.combustible_nombre === nombreCombustible);
      // despachosHistoricos excluye transferencias a surtidores (no son consumo final)
      const despachosHistoricos = movimientos.filter(m => m.tipo === 'DESPACHO' && m.combustible_nombre === nombreCombustible && !consumidoresSurtidorIds.has(m.consumidor_id));
      const comprasPeriodo = movimientosFiltrados.filter(m => m.tipo === 'COMPRA' && m.combustible_nombre === nombreCombustible);
      const despachosPeriodo = movimientosFiltrados.filter(m => m.tipo === 'DESPACHO' && m.combustible_nombre === nombreCombustible);
      const comprasReservaHistoricas = comprasHistoricas.filter(m => consumidoresReservaIds.has(m.consumidor_id));
      const comprasReservaPeriodo = comprasPeriodo.filter(m => consumidoresReservaIds.has(m.consumidor_id));
      const despachosReservaHistoricos = despachosHistoricos.filter(m => consumidoresReservaIds.has(m.consumidor_origen_id));
      const despachosReservaPeriodo = despachosPeriodo.filter(m => consumidoresReservaIds.has(m.consumidor_origen_id));

      const litrosInicialesReserva = consumidores
        .filter(c => consumidoresReservaIds.has(c.id))
        .reduce((s, c) => s + obtenerLitrosInicialesConsumidor(c, combustibleIdRef, nombreCombustible), 0);

      const litrosInicio = comprasHistoricas
        .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
        .reduce((s, m) => s + (m.litros || 0), 0)
        - despachosHistoricos
          .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
          .reduce((s, m) => s + (m.litros || 0), 0);

      const montoInicio = comprasHistoricas
        .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
        .reduce((s, m) => s + (m.monto || 0), 0)
        - despachosHistoricos
          .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
          .reduce((s, m) => s + (m.monto || 0), 0);

      const litrosCompras = comprasPeriodo.reduce((s, m) => s + (m.litros || 0), 0);
      const montoCompras = comprasPeriodo.reduce((s, m) => s + (m.monto || 0), 0);
      // Excluir surtidores (transferencias internas) y Uso Logístico/VD del consumo de flota
      const despachosPeriodoConsumo = despachosPeriodo.filter(m => !consumidoresSurtidorIds.has(m.consumidor_id) && m.consumidor_nombre !== 'Uso Logístico');
      const litrosConsumo = despachosPeriodoConsumo.reduce((s, m) => s + (m.litros || 0), 0);
      const montoConsumo = despachosPeriodoConsumo.reduce((s, m) => s + (m.monto || 0), 0);
      // Salidas VD (Uso Logístico) — reducen el stock pero no son consumo de flota
      const litrosOtrosSalidas = despachosPeriodo.filter(m => m.consumidor_nombre === 'Uso Logístico').reduce((s, m) => s + (m.litros || 0), 0);
      const comprasOpsMes = comprasPeriodo.length;
      const despachosOpsCombMes = despachosPeriodoConsumo.length;
      const recargasOpsMes = comprasReservaPeriodo.length;
      const recargasOpsTotal = comprasReservaHistoricas.length;
      const litrosComprasReservaMes = comprasReservaPeriodo.reduce((s, m) => s + (m.litros || 0), 0);
      const costoRecargasMes = comprasReservaPeriodo.reduce((s, m) => s + (m.monto || 0), 0);
      const costoRecargasTotal = comprasReservaHistoricas.reduce((s, m) => s + (m.monto || 0), 0);
      const despachosOpsMes = despachosReservaPeriodo.length;
      const despachosOpsTotal = despachosReservaHistoricos.length;
      const litrosDespachosMes = despachosReservaPeriodo.reduce((s, m) => s + (m.litros || 0), 0);
      const litrosDespachosTotal = despachosReservaHistoricos.reduce((s, m) => s + (m.litros || 0), 0);
      const montoDespachosMes = despachosReservaPeriodo.reduce((s, m) => s + (m.monto || 0), 0);

      const ultimaCargaReservaFecha = [...comprasReservaHistoricas]
        .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))[0]?.fecha || null;

      const reservaIdsDelCombustible = new Set([
        ...comprasReservaHistoricas.map(m => m.consumidor_id).filter(Boolean),
        ...despachosReservaHistoricos.map(m => m.consumidor_origen_id).filter(Boolean),
      ]);
      const capacidadTotalReserva = [...reservaIdsDelCombustible]
        .map((id) => obtenerCapacidadConsumidor(consumidores.find(c => c.id === id)))
        .reduce((s, v) => s + (Number(v) || 0), 0);
      // Stock físico estimado: calculado por tanque (igual a ConsumidoresPorTipo.stockActual)
      // para evitar que despachos con combustible_nombre incorrecto/nulo inflen el stock.
      // Incluye DEPOSITO como inflow para ISO TANQUEs (que reciben combustible vía DEPOSITO, no COMPRA)
      const depositosReservaHistoricos = movimientos.filter(m => m.tipo === 'DEPOSITO' && m.combustible_nombre === nombreCombustible && consumidoresReservaIds.has(m.consumidor_id));
      const reservaTankIdsParaCombustible = new Set([
        ...comprasReservaHistoricas.map(m => m.consumidor_id).filter(Boolean),
        ...depositosReservaHistoricos.map(m => m.consumidor_id).filter(Boolean),
        ...consumidores
          .filter(c => consumidoresReservaIds.has(c.id) && obtenerLitrosInicialesConsumidor(c, combustibleIdRef, nombreCombustible) > 0)
          .map(c => c.id),
      ]);
      const litrosEnTanqueEstimado = Math.max(0,
        [...reservaTankIdsParaCombustible].reduce((total, tankId) => {
          const tank = consumidores.find(c => c.id === tankId);
          const ini      = obtenerLitrosInicialesConsumidor(tank, combustibleIdRef, nombreCombustible);
          const entradas = movimientos.filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DEPOSITO' || m.tipo === 'DESPACHO') && m.consumidor_id === tankId && m.combustible_nombre === nombreCombustible).reduce((s, m) => s + (m.litros || 0), 0);
          const salidas  = movimientos.filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === tankId).reduce((s, m) => s + (m.litros || 0), 0);
          return total + ini + entradas - salidas;
        }, 0)
      );
      const litrosInicioReserva = comprasReservaHistoricas
        .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
        .reduce((s, m) => s + (m.litros || 0), 0)
        - despachosReservaHistoricos
          .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
          .reduce((s, m) => s + (m.litros || 0), 0);
      const montoInicioReserva = comprasReservaHistoricas
        .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
        .reduce((s, m) => s + (m.monto || 0), 0)
        - despachosReservaHistoricos
          .filter(m => mesFiltro !== 'ALL' && m.fecha < `${mesFiltro}-01`)
          .reduce((s, m) => s + (m.monto || 0), 0);
      const litrosTotalDisponibleReserva = Math.max(0, litrosInicialesReserva + litrosInicioReserva + litrosComprasReservaMes);
      const montoTotalDisponibleReserva = Math.max(0, montoInicioReserva + costoRecargasMes);

      const detalleConsumoReservaMap = {};
      despachosReservaPeriodo.forEach(m => {
        const key = m.consumidor_id || m.consumidor_nombre || 'Sin identificar';
        if (!detalleConsumoReservaMap[key]) detalleConsumoReservaMap[key] = {
          nombre: m.consumidor_nombre || 'Sin identificar',
          chapa: m.vehiculo_chapa || null,
          litros: 0, monto: 0,
        };
        detalleConsumoReservaMap[key].litros += m.litros || 0;
        detalleConsumoReservaMap[key].monto += m.monto || 0;
      });
      const detalleConsumoReserva = Object.values(detalleConsumoReservaMap)
        .sort((a, b) => b.litros - a.litros);

      const detalleConsumoMap = {};
      despachosPeriodo.forEach(m => {
        // Los surtidores externos no son consumidores finales — se muestran en su propia sección
        if (consumidoresSurtidorIds.has(m.consumidor_id)) return;
        // Salidas VD (Uso Logístico) no son consumo de flota
        if (m.consumidor_nombre === 'Uso Logístico') return;
        const key = m.consumidor_id || m.consumidor_nombre || 'Sin identificar';
        if (!detalleConsumoMap[key]) detalleConsumoMap[key] = {
          id: key,
          nombre: m.consumidor_nombre || 'Sin identificar',
          chapa: m.vehiculo_chapa || null,
          litros: 0, monto: 0,
        };
        detalleConsumoMap[key].litros += m.litros || 0;
        detalleConsumoMap[key].monto += m.monto || 0;
      });
      const detalleConsumo = Object.values(detalleConsumoMap)
        .sort((a, b) => b.litros - a.litros);

      const ultimaCompra = comprasPeriodo[0] || comprasHistoricas[0] || null;
      const moneda = (ultimaCompra && tarjetasById[ultimaCompra.tarjeta_id]?.moneda) || 'USD';
      const precioRef = ultimaCompra?.precio || (litrosCompras > 0 ? montoCompras / litrosCompras : 0);

      return {
        nombreCombustible,
        moneda,
        precioRef,
        litrosInicio: Math.max(0, litrosInicio),
        montoInicio: Math.max(0, montoInicio),
        litrosCompras,
        montoCompras,
        comprasOpsMes,
        litrosDisponible: Math.max(0, litrosInicio + litrosCompras),
        montoDisponible: Math.max(0, montoInicio + montoCompras),
        litrosConsumo,
        montoConsumo,
        despachosOpsCombMes,
        litrosSaldoFinal: Math.max(0, litrosInicio + litrosCompras - litrosConsumo - litrosOtrosSalidas),
        montoSaldoFinal: Math.max(0, montoInicio + montoCompras - montoConsumo),
        capacidadTotalReserva,
        litrosEnTanqueEstimado,
        recargasOpsMes,
        recargasOpsTotal,
        litrosComprasReservaMes,
        costoRecargasMes,
        costoRecargasTotal,
        despachosOpsMes,
        despachosOpsTotal,
        litrosDespachosMes,
        litrosDespachosTotal,
        montoDespachosMes,
        litrosInicioReserva: Math.max(0, litrosInicialesReserva + litrosInicioReserva),
        montoInicioReserva: Math.max(0, montoInicioReserva),
        litrosTotalDisponibleReserva,
        montoTotalDisponibleReserva,
        detalleConsumoReserva,
        detalleConsumo,
        comprasPeriodo,
        ultimaCargaReservaFecha,
      };
    }).filter(r => r.litrosCompras > 0 || r.litrosConsumo > 0 || r.litrosInicio > 0 || r.litrosEnTanqueEstimado > 0);
  }, [movimientos, movimientosFiltrados, mesFiltro, tipoCombustible, tarjetasById, consumidoresReservaIds, consumidoresSurtidorIds, consumidores, tiposConsumidor]);

  // Saldo en depósitos externos (DEPOSITO - COMPRAs asociadas, histórico acumulado)
  // Los tanques/ISO TANQUEs NO se muestran aquí: su stock ya aparece en el bloque de consumidores por tipo.
  const saldoDepositos = useMemo(() => {
    const deposits = movimientos.filter(m =>
      m.tipo === 'DEPOSITO' && !consumidoresReservaIds.has(m.consumidor_id)
    );
    if (deposits.length === 0) return [];

    const byConsumidor = {};
    deposits.forEach(m => {
      const key = m.consumidor_id || 'unknown';
      if (!byConsumidor[key]) byConsumidor[key] = {
        consumidorId: m.consumidor_id,
        consumidorNombre: m.consumidor_nombre || 'Depósito externo',
        tarjetaId: null,
        tarjetaAlias: null,
        litros: 0,
        monto: 0,
      };
      byConsumidor[key].litros += m.litros || 0;
      byConsumidor[key].monto += m.monto || 0;
      if (!byConsumidor[key].tarjetaId && m.tarjeta_id) {
        byConsumidor[key].tarjetaId = m.tarjeta_id;
        byConsumidor[key].tarjetaAlias = m.tarjeta_alias;
      }
    });

    return Object.values(byConsumidor).map(dep => {
      const retirados = dep.tarjetaId
        ? movimientos.filter(m => m.tipo === 'COMPRA' && m.tarjeta_id === dep.tarjetaId)
            .reduce((s, m) => s + (m.litros || 0), 0)
        : null;
      return { ...dep, retirados, saldo: retirados != null ? dep.litros - retirados : null };
    });
  }, [movimientos, consumidoresReservaIds]);

  // Saldo de surtidores externos (depósitos tipo Cupet donde los vehículos cargan con tarjeta)
  const saldoSurtidores = useMemo(() => {
    const surtidores = consumidores.filter(c => consumidoresSurtidorIds.has(c.id) && c.activo !== false);
    if (surtidores.length === 0) return [];
    return surtidores.map(surt => {
      const tarjetaVinculadaId = surt.datos_tanque?.tarjeta_vinculada_id;
      const tarjeta = tarjetas.find(t => t.id === tarjetaVinculadaId);
      const ini = Number(surt.litros_iniciales) || 0;
      // Entradas: fuel que llegó al surtidor (COMPRA directa, DESPACHO desde isotanque, DEPOSITO externo)
      const entradasCompra = movimientos
        .filter(m => m.tipo === 'COMPRA' && m.consumidor_id === surt.id)
        .reduce((s, m) => s + (m.litros || 0), 0);
      const entradasDespacho = movimientos
        .filter(m => m.tipo === 'DESPACHO' && m.consumidor_id === surt.id)
        .reduce((s, m) => s + (m.litros || 0), 0);
      const entradasDeposito = movimientos
        .filter(m => m.tipo === 'DEPOSITO' && m.consumidor_id === surt.id)
        .reduce((s, m) => s + (m.litros || 0), 0);
      // Salidas: vehículos retiran con DESPACHO manual o COMPRA con la tarjeta vinculada
      const salidasDespacho = movimientos
        .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === surt.id)
        .reduce((s, m) => s + (m.litros || 0), 0);
      const salidasCompra = tarjetaVinculadaId
        ? movimientos
            .filter(m => m.tipo === 'COMPRA' && m.tarjeta_id === tarjetaVinculadaId)
            .reduce((s, m) => s + (m.litros || 0), 0)
        : null;
      const totalEntradas = ini + entradasCompra + entradasDespacho + entradasDeposito;
      const stockActual = Math.max(0, totalEntradas - salidasDespacho - (salidasCompra || 0));
      return {
        id: surt.id,
        nombre: surt.nombre,
        combustibleNombre: surt.combustible_nombre,
        tarjetaAlias: tarjeta?.alias || tarjeta?.id_tarjeta || null,
        tarjetaVinculadaId,
        ini,
        totalEntradas,
        entradasCompra,
        entradasDespacho,
        salidasDespacho,
        salidasCompra,
        stockActual,
      };
    });
  }, [consumidores, consumidoresSurtidorIds, movimientos, tarjetas]);

  const economicoStats = useMemo(() => {
    if (!isEconomico) return null;

    // Inventario por tanque (stock actual por consumidor de tipo reserva/tanque)
    const tanques = consumidores
      .filter(c => consumidoresReservaIds.has(c.id) && c.activo !== false)
      .map(c => {
        const ini = Number(c.litros_iniciales) || 0;
        const entradas = movimientos
          .filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DEPOSITO' || m.tipo === 'DESPACHO') && m.consumidor_id === c.id)
          .reduce((s, m) => s + (m.litros || 0), 0);
        const salidas = movimientos
          .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === c.id)
          .reduce((s, m) => s + (m.litros || 0), 0);
        const stockActual = Math.max(0, ini + entradas - salidas);
        const cap = (() => {
          const t = Number(c?.datos_tanque?.capacidad_litros);
          if (Number.isFinite(t) && t > 0) return t;
          const v = Number(c?.datos_vehiculo?.capacidad_tanque);
          return Number.isFinite(v) && v > 0 ? v : 0;
        })();
        const pct = cap > 0 ? Math.min(100, (stockActual / cap) * 100) : null;
        return { id: c.id, nombre: c.nombre || 'Tanque', combustibleNombre: c.combustible_nombre || null, stockActual, capacidad: cap, pct };
      })
      .sort((a, b) => b.stockActual - a.stockActual);

    // Logística VD — acumulado histórico total
    const litrosDestinadosVD = movimientos
      .filter(m => m.tipo === 'DESPACHO' && m.consumidor_nombre === 'Uso Logístico')
      .reduce((s, m) => s + (m.litros || 0), 0);
    const litrosTotalComprado = movimientos.filter(m => m.tipo === 'COMPRA').reduce((s, m) => s + (m.litros || 0), 0);

    const entregadas = ventasAllTime.filter(v => ['ENTREGADO', 'RETIRADO', 'PAGADO_FINALIZADO', 'PAGADO'].includes(v.estado));
    const cobradas   = ventasAllTime.filter(v => ['PAGADO_FINALIZADO', 'PAGADO'].includes(v.estado));
    const porCobrarL = ventasAllTime.filter(v => ['ENTREGADO', 'RETIRADO'].includes(v.estado));
    const pendientesL = ventasAllTime.filter(v => v.estado === 'PENDIENTE');

    const litrosEntregados   = entregadas.reduce((s, v) => s + (v.litros || 0), 0);
    const litrosPendientesVD = pendientesL.reduce((s, v) => s + (v.litros || 0), 0);
    const montoCobradoVD     = cobradas.reduce((s, v) => s + (v.monto || 0), 0);
    const montoPorCobrarVD   = porCobrarL.reduce((s, v) => s + (v.monto || 0), 0);
    const litrosDisponiblesVD = Math.max(0, litrosDestinadosVD - litrosEntregados - litrosPendientesVD);
    const pctDestinadoDelTotal = litrosTotalComprado > 0 ? (litrosDestinadosVD / litrosTotalComprado) * 100 : 0;

    // Clasificación de salidas del período (filtrado por mesFiltro)
    const comprasPer = movimientosFiltrados.filter(m => m.tipo === 'COMPRA');
    const litrosCompradosPer = comprasPer.reduce((s, m) => s + (m.litros || 0), 0);
    const costoCompradoPer   = comprasPer.reduce((s, m) => s + (m.monto || 0), 0);
    const precioPromPer = litrosCompradosPer > 0 ? costoCompradoPer / litrosCompradosPer : 0;

    const despachosPer = movimientosFiltrados.filter(m => m.tipo === 'DESPACHO');
    const litrosAlmacenPer = despachosPer
      .filter(m => m.consumidor_nombre === 'Uso Logístico')
      .reduce((s, m) => s + (m.litros || 0), 0);
    const litrosServiciosPer = despachosPer
      .filter(m => m.consumidor_nombre !== 'Uso Logístico' && !consumidoresSurtidorIds.has(m.consumidor_id))
      .reduce((s, m) => s + (m.litros || 0), 0);
    const litrosTotalSalidaPer = litrosAlmacenPer + litrosServiciosPer;

    // P&L del período usando ventas del mismo período
    const mesPrefix = mesFiltro !== 'ALL' ? mesFiltro : null;
    const ventasPer = mesPrefix
      ? ventasAllTime.filter(v => (v.fecha_venta || '').startsWith(mesPrefix))
      : ventasAllTime;
    const ventasCobradasPer = ventasPer.filter(v => ['PAGADO_FINALIZADO', 'PAGADO'].includes(v.estado));
    const ventasPorCobrarPer = ventasPer.filter(v => ['ENTREGADO', 'RETIRADO'].includes(v.estado));
    const ingresosCobradosPer   = ventasCobradasPer.reduce((s, v) => s + (v.monto || 0), 0);
    const ingresosPorCobrarPer  = ventasPorCobrarPer.reduce((s, v) => s + (v.monto || 0), 0);
    const litrosVendidosCobrados = ventasCobradasPer.reduce((s, v) => s + (v.litros || 0), 0);
    const costoVentasPer    = litrosVendidosCobrados * precioPromPer;
    const gananciaBrutaPer  = ingresosCobradosPer - costoVentasPer;
    const costoServiciosPer = litrosServiciosPer * precioPromPer;
    const resultadoNetoPer  = gananciaBrutaPer - costoServiciosPer;

    return {
      tanques,
      litrosDestinadosVD, litrosEntregados, litrosPendientesVD, litrosDisponiblesVD,
      montoCobradoVD, montoPorCobrarVD, pctDestinadoDelTotal,
      cobradasVD: cobradas.length, porCobrarVD: porCobrarL.length, pendientesVD: pendientesL.length,
      litrosCompradosPer, costoCompradoPer, litrosAlmacenPer, litrosServiciosPer, litrosTotalSalidaPer,
      pctAlmacenPer: litrosTotalSalidaPer > 0 ? (litrosAlmacenPer / litrosTotalSalidaPer) * 100 : 0,
      pctServiciosPer: litrosTotalSalidaPer > 0 ? (litrosServiciosPer / litrosTotalSalidaPer) * 100 : 0,
      precioPromPer, ingresosCobradosPer, ingresosPorCobrarPer,
      costoVentasPer, gananciaBrutaPer, costoServiciosPer, resultadoNetoPer,
    };
  }, [isEconomico, consumidores, consumidoresReservaIds, movimientos, movimientosFiltrados, ventasAllTime, consumidoresSurtidorIds, mesFiltro]);

  // Resumen del mes
  const comprasMes = movimientosFiltrados.filter(m => m.tipo === 'COMPRA');
  const litrosMes = comprasMes.reduce((s, m) => s + (m.litros || 0), 0);
  const gastoMes = comprasMes.reduce((s, m) => s + (m.monto || 0), 0);
  const despachosMes = movimientosFiltrados.filter(m => m.tipo === 'DESPACHO');
  const litrosDespachadosMes = despachosMes.reduce((s, m) => s + (m.litros || 0), 0);

  // Consumidores activos
  const consumidoresActivos = consumidores.filter(c => c.activo);

  // Alertas de nivel bajo de combustible — basado en nivel estimado del tanque
  const alertasNivel = useMemo(() => {
    return consumidoresActivos
      .filter(c => {
        if (c.categoria) return c.categoria === 'consumidor';
        const n = (c.tipo_consumidor_nombre || '').toLowerCase();
        return !n.includes('tanque') && !n.includes('reserva') && !n.includes('surtidor');
      })
      .map(c => {
        const capacidad = c.datos_vehiculo?.capacidad_tanque;
        if (!capacidad) return null;
        const fills = movimientos
          .filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.consumidor_id === c.id)
          .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        if (fills.length === 0) return null;
        const last = fills[0];
        let nivel = (last.nivel_tanque || 0) + (last.litros || 0);
        const consumoRef = c.datos_vehiculo?.indice_consumo_real || c.datos_vehiculo?.indice_consumo_fabricante;
        if (last.odometro != null && consumoRef) {
          const post = movimientos
            .filter(m => m.consumidor_id === c.id && m.odometro != null && m.odometro > last.odometro)
            .sort((a, b) => b.odometro - a.odometro);
          if (post.length > 0) nivel = Math.max(0, nivel - (post[0].odometro - last.odometro) / consumoRef);
        }
        const pct = (nivel / capacidad) * 100;
        return pct <= 20 ? { ...c, _nivelEstimado: nivel, _pct: pct, _capacidad: capacidad } : null;
      })
      .filter(Boolean);
  }, [consumidoresActivos, movimientos]);

  // alias para compatibilidad con referencias en modalDataPorCard
  const alertasConsumo = alertasNivel;


  const movimientosFiltradosOrdenados = useMemo(
    () => [...movimientosFiltrados].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))),
    [movimientosFiltrados]
  );

  const choferDelMes = useMemo(
    () => computeChoferDelMes({ month: mesFiltro, movimientos, conductores }),
    [mesFiltro, movimientos, conductores],
  );

  // Km recorridos según GPS backfill (asignacion_ruta tipo recorrido_gps), filtrado por período
  const { data: kmGps = [] } = useQuery({
    queryKey: ['km-gps', mesFiltro],
    queryFn: async () => {
      let q = supabase
        .from('asignacion_ruta')
        .select('consumidor_id, consumidor_nombre, km_reales, fecha')
        .eq('tipo_viaje', 'recorrido_gps')
        .not('km_reales', 'is', null)
        .gt('km_reales', 0);
      if (mesFiltro !== 'ALL') {
        const [y, m] = mesFiltro.split('-');
        q = q.gte('fecha', `${y}-${m}-01`)
             .lte('fecha', new Date(+y, +m, 0).toISOString().slice(0, 10));
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
    throwOnError: false,
  });

  const kmStats = useMemo(() => {
    const totalKm = kmGps.reduce((s, r) => s + (r.km_reales || 0), 0);
    const byVehiculo = {};
    kmGps.forEach(r => {
      const id = r.consumidor_id;
      byVehiculo[id] = (byVehiculo[id] || 0) + (r.km_reales || 0);
    });
    const vehiculosConKm = Object.keys(byVehiculo).length;
    const promedio = vehiculosConKm > 0 ? totalKm / vehiculosConKm : 0;
    return { totalKm, vehiculosConKm, promedio, byVehiculo };
  }, [kmGps]);

  const litrosConsumosPorTipo = useMemo(() =>
    resumenPorCombustible
      .filter(r => r.litrosConsumo > 0)
      .sort((a, b) => b.litrosConsumo - a.litrosConsumo),
    [resumenPorCombustible]
  );

  const disponiblePorTipo = useMemo(() =>
    resumenPorCombustible
      .filter(r => r.litrosEnTanqueEstimado > 0)
      .sort((a, b) => b.litrosEnTanqueEstimado - a.litrosEnTanqueEstimado),
    [resumenPorCombustible]
  );


  const modalDataPorCard = useMemo(() => {
    const agruparPorCombustible = (rows) => {
      const map = {};
      rows.forEach((m) => {
        const key = m.combustible_nombre || 'Sin combustible';
        if (!map[key]) map[key] = [];
        map[key].push(m);
      });
      return Object.entries(map)
        .map(([combustible, movimientos]) => ({ combustible, movimientos }))
        .sort((a, b) => b.movimientos.length - a.movimientos.length);
    };

    if (statModal.tipo === 'consumo') {
      return agruparPorCombustible(
        movimientosFiltradosOrdenados.filter(m => m.tipo === 'DESPACHO' && !consumidoresSurtidorIds.has(m.consumidor_id) && (m.litros || 0) > 0)
      );
    }
    if (statModal.tipo === 'consumidores') {
      return agruparPorCombustible(movimientosFiltradosOrdenados.filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.consumidor_id));
    }
    if (statModal.tipo === 'alertas') {
      const ids = new Set(alertasConsumo.map(c => c.id));
      return agruparPorCombustible(movimientosFiltradosOrdenados.filter(m => m.tipo === 'COMPRA' && ids.has(m.consumidor_id)));
    }
    return [];
  }, [statModal.tipo, movimientosFiltradosOrdenados, alertasConsumo]);

  const gpsResumenMes = useMemo(() => {
    const gpsRecs  = asigGpsMes.filter(a => a.tipo_viaje === 'recorrido_gps');
    const tripRecs = asigGpsMes.filter(a => a.tipo_viaje !== 'recorrido_gps');
    const kmGps   = Math.round(gpsRecs.reduce((s, a)  => s + (Number(a.km_reales) || 0), 0));
    const kmReg   = Math.round(tripRecs.reduce((s, a) => s + (Number(a.km_reales) || 0), 0));
    const diasGps = new Set(gpsRecs.map(a => a.fecha)).size;
    const ultimaFecha = [...asigGpsMes].map(a => a.fecha).filter(Boolean).sort().at(-1) ?? null;
    return { kmGps, kmReg, diasGps, ultimaFecha };
  }, [asigGpsMes]);

  const mesGpsLabel = new Date(mesGps + '-01T12:00:00').toLocaleDateString('es', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">
          {isOperador ? 'Panel Operacional' : isEconomico ? 'Panel Financiero' : 'Panel Global'}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {hoy.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Resumen del mes */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2 mb-1">
          <SectionTitle icon={TrendingDown} title={`Resumen ${mesFiltro === 'ALL' ? 'general' : opcionesMes.find(x => x.key === mesFiltro)?.label || ''}`} iconColor="text-sky-500" />
          <div className="min-w-[220px] flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Período</span>
            <Select value={mesFiltro} onValueChange={setMesFiltro}>
              <SelectTrigger className="h-8 text-xs">
                <CalendarDays className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                <SelectValue placeholder="Filtrar por mes" />
              </SelectTrigger>
              <SelectContent>
                {opcionesMes.map(opt => (
                  <SelectItem key={opt.key} value={opt.key} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className={`grid gap-3 ${isEconomico ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {/* Litros consumidos por tipo */}
          <Card
            className={`border-0 shadow-sm transition ${!isEconomico ? 'cursor-pointer hover:ring-1 hover:ring-sky-200' : ''}`}
            onClick={!isEconomico ? () => setStatModal({ open: true, tipo: 'consumo' }) : undefined}
          >
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Litros consumidos</p>
              {litrosConsumosPorTipo.length === 0 ? (
                <p className="text-sm text-slate-300 mt-2">Sin despachos</p>
              ) : (
                <div className="mt-1.5 space-y-0.5">
                  {litrosConsumosPorTipo.map(r => (
                    <div key={r.nombreCombustible} className="flex items-baseline gap-1">
                      <span className="text-base font-bold text-orange-600 leading-tight tabular-nums">
                        {r.litrosConsumo.toFixed(0)}
                      </span>
                      <span className="text-xs font-semibold text-orange-500">L</span>
                      <span className="text-xs text-slate-400 truncate">{r.nombreCombustible}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1.5">
                {movimientosFiltrados.filter(m => m.tipo === 'DESPACHO').length} despachos
              </p>
            </CardContent>
          </Card>

          {/* Disponible en reserva por tipo */}
          <Card className="border-0 shadow-sm hover:ring-1 hover:ring-sky-200 transition">
            <CardContent className="p-4">
              <p className="text-[11px] text-slate-400 uppercase tracking-wide">Disponible</p>
              {disponiblePorTipo.length === 0 ? (
                <p className="text-sm text-slate-300 mt-2">Sin stock</p>
              ) : (
                <div className="mt-1.5 space-y-0.5">
                  {disponiblePorTipo.map(r => (
                    <div key={r.nombreCombustible} className="flex items-baseline gap-1">
                      <span className="text-base font-bold text-emerald-600 leading-tight tabular-nums">
                        {r.litrosEnTanqueEstimado.toFixed(0)}
                      </span>
                      <span className="text-xs font-semibold text-emerald-500">L</span>
                      <span className="text-xs text-slate-400 truncate">{r.nombreCombustible}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1.5">en tanques · stock actual</p>
            </CardContent>
          </Card>

          {/* Km recorridos GPS — solo operacional */}
          {!isEconomico && (
            <Card className="border-0 shadow-sm hover:ring-1 hover:ring-sky-200 transition">
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">Km recorridos</p>
                {kmStats.totalKm > 0 ? (
                  <>
                    <p className="text-lg font-bold text-sky-700 mt-1 leading-tight tabular-nums">
                      {Math.round(kmStats.totalKm).toLocaleString('es-CU')} km
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {kmStats.vehiculosConKm} veh · prom. {Math.round(kmStats.promedio).toLocaleString('es-CU')} km
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-slate-300 mt-1 leading-tight">— km</p>
                    <p className="text-xs text-slate-400 mt-1">sin registros GPS</p>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Nivel bajo — solo operacional */}
          {!isEconomico && (
            <Card className={`border-0 shadow-sm cursor-pointer transition hover:ring-1 hover:ring-sky-200 ${alertasConsumo.length > 0 ? 'ring-1 ring-red-200 bg-red-50/20' : ''}`} onClick={() => setStatModal({ open: true, tipo: 'alertas' })}>
              <CardContent className="p-4">
                <p className="text-[11px] text-slate-400 uppercase tracking-wide">Nivel bajo</p>
                <p className={`text-lg font-bold mt-1 leading-tight ${alertasNivel.length > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                  {alertasNivel.length}
                </p>
                <p className="text-xs text-slate-400 mt-1">tanques por recargar</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Personal del mes — solo operacional */}
      {!isEconomico && choferDelMes && (
        <div>
          <SectionTitle icon={User} title="Personal del mes" iconColor="text-amber-500" />
          <Card className="border-0 shadow-sm bg-amber-50/30 ring-1 ring-amber-100">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800">{choferDelMes.conductor.nombre}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {choferDelMes.litros.toFixed(1)} L · {choferDelMes.movimientos} movimientos válidos
                </p>
                {choferDelMes.conductor.vehiculo_asignado_chapa && (
                  <p className="text-xs text-slate-400">Vehículo: {choferDelMes.conductor.vehiculo_asignado_chapa}</p>
                )}
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 bg-amber-100 text-amber-700 border-amber-200 text-[11px]">
                ⭐ Chofer del mes
              </Badge>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráfico gasto mensual — solo financiero */}
      {!isOperador && (
        <div>
          <SectionTitle icon={TrendingUp} title="Gastos por mes (últimos 6 meses)" iconColor="text-sky-500" />
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5">
              <GastosMensualesChart movimientos={movimientos} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           SECCIONES EXCLUSIVAS PARA ECONOMICO
      ═══════════════════════════════════════════════════════════════ */}
      {isEconomico && economicoStats && (
        <>
          {/* Inventario actual por tanque */}
          {economicoStats.tanques.length > 0 && (
            <div>
              <SectionTitle icon={Fuel} title="Inventario actual por tanque" iconColor="text-sky-500" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {economicoStats.tanques.map(t => (
                  <Card key={t.id} className="border-0 shadow-sm">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800 truncate">{t.nombre}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {t.combustibleNombre && (
                            <Badge variant="outline" className="text-[10px] px-1.5">{t.combustibleNombre}</Badge>
                          )}
                          {t.pct !== null && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 ${t.pct < 20 ? 'bg-red-50 border-red-200 text-red-600' : t.pct < 50 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                              {Math.round(t.pct)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                      {t.pct !== null && (
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${t.pct < 20 ? 'bg-red-500' : t.pct < 50 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${t.pct}%` }}
                          />
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">Stock actual</span>
                        <span className="font-bold text-slate-800">{t.stockActual.toFixed(1)} L</span>
                      </div>
                      {t.capacidad > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Capacidad</span>
                          <span className="text-slate-500">{t.capacidad.toFixed(0)} L</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Operaciones Logísticas VD */}
          <div>
            <SectionTitle icon={Users} title="Operaciones Logísticas VD" iconColor="text-violet-500" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Columna litros */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Distribución de litros</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total destinado</span>
                      <span className="font-bold text-slate-800">{economicoStats.litrosDestinadosVD.toFixed(1)} L</span>
                    </div>
                    <div className="flex justify-between pl-3 border-l-2 border-violet-200">
                      <span className="text-slate-400">Vendido / Entregado</span>
                      <span className="font-medium text-slate-700">{economicoStats.litrosEntregados.toFixed(1)} L</span>
                    </div>
                    {economicoStats.litrosPendientesVD > 0 && (
                      <div className="flex justify-between pl-3 border-l-2 border-amber-200">
                        <span className="text-amber-600">Pendiente de entrega</span>
                        <span className="font-medium text-amber-700">{economicoStats.litrosPendientesVD.toFixed(1)} L</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-100 pt-1.5">
                      <span className="font-semibold text-violet-700">Disponible en almacén</span>
                      <span className="font-bold text-violet-700">{economicoStats.litrosDisponiblesVD.toFixed(1)} L</span>
                    </div>
                  </div>
                  {economicoStats.pctDestinadoDelTotal > 0 && (
                    <p className="text-[10px] text-slate-400 pt-0.5">
                      Representa el <span className="font-semibold text-slate-600">{economicoStats.pctDestinadoDelTotal.toFixed(1)}%</span> del total comprado
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Columna cobros */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Estado de cobros</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Cobrado ({economicoStats.cobradasVD} ventas)</span>
                      <span className="font-bold text-emerald-700">{formatMoneySymbol(economicoStats.montoCobradoVD)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Por cobrar ({economicoStats.porCobrarVD} ventas)</span>
                      <span className="font-bold text-amber-700">{formatMoneySymbol(economicoStats.montoPorCobrarVD)}</span>
                    </div>
                    {economicoStats.pendientesVD > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Sin entregar ({economicoStats.pendientesVD})</span>
                        <span className="text-slate-500">Pendiente</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-100 pt-1.5">
                      <span className="font-semibold text-slate-700">Total facturado</span>
                      <span className="font-bold text-slate-800">{formatMoneySymbol(economicoStats.montoCobradoVD + economicoStats.montoPorCobrarVD)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Análisis del período */}
          <div>
            <SectionTitle icon={BarChart3} title={`Análisis del período${mesFiltro !== 'ALL' ? ` — ${mesFiltro}` : ' — acumulado'}`} iconColor="text-teal-500" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Clasificación de salidas */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Destino de salidas</p>
                  {economicoStats.litrosTotalSalidaPer > 0 ? (
                    <>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-emerald-700">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                            Almacén VD (ingreso)
                          </span>
                          <span className="font-medium text-emerald-700">
                            {economicoStats.litrosAlmacenPer.toFixed(1)} L · {Math.round(economicoStats.pctAlmacenPer)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${economicoStats.pctAlmacenPer}%` }} />
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="flex items-center gap-1.5 text-rose-600">
                            <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
                            Servicios / Flota (gasto)
                          </span>
                          <span className="font-medium text-rose-600">
                            {economicoStats.litrosServiciosPer.toFixed(1)} L · {Math.round(economicoStats.pctServiciosPer)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className="h-2 rounded-full bg-rose-400" style={{ width: `${economicoStats.pctServiciosPer}%` }} />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 pt-0.5">
                        Total salidas: {economicoStats.litrosTotalSalidaPer.toFixed(1)} L
                        {economicoStats.litrosCompradosPer > 0 && ` de ${economicoStats.litrosCompradosPer.toFixed(1)} L comprados`}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400 py-2">Sin despachos en el período</p>
                  )}
                </CardContent>
              </Card>

              {/* Resultado financiero estimado */}
              <Card className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-1.5">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">Resultado financiero estimado</p>
                  {economicoStats.precioPromPer > 0 ? (
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">+ Ingresos cobrados</span>
                        <span className="font-medium text-emerald-700">{formatMoneySymbol(economicoStats.ingresosCobradosPer)}</span>
                      </div>
                      {economicoStats.ingresosPorCobrarPer > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">  (+ por cobrar)</span>
                          <span className="text-amber-600">{formatMoneySymbol(economicoStats.ingresosPorCobrarPer)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">− Costo de lo vendido</span>
                        <span className="font-medium text-slate-600">−{formatMoneySymbol(economicoStats.costoVentasPer)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-100 pt-1">
                        <span className="font-medium text-slate-700">= Margen en ventas</span>
                        <span className={`font-bold ${economicoStats.gananciaBrutaPer >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {economicoStats.gananciaBrutaPer >= 0 ? '' : '−'}{formatMoneySymbol(Math.abs(economicoStats.gananciaBrutaPer))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">− Gasto servicios/flota</span>
                        <span className="font-medium text-rose-600">−{formatMoneySymbol(economicoStats.costoServiciosPer)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-0.5">
                        <span className="font-semibold text-slate-800">= Resultado neto</span>
                        <span className={`font-bold text-base ${economicoStats.resultadoNetoPer >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {economicoStats.resultadoNetoPer >= 0 ? '' : '−'}{formatMoneySymbol(Math.abs(economicoStats.resultadoNetoPer))}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 pt-0.5">
                        Precio prom. compra: {economicoStats.precioPromPer.toFixed(4)}/L (estimado)
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 py-2">Sin compras en el período para estimar costos</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Resumen GPS del mes — solo operacional */}
      {!isEconomico && (gpsResumenMes.kmGps > 0 || gpsResumenMes.kmReg > 0) && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle icon={Navigation} title={`Flota GPS — ${mesGpsLabel}`} iconColor="text-violet-500" />
            <Link to={createPageUrl('Rutas')} className="text-xs text-violet-600 hover:underline">
              Ver comparativo detallado →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Km GPS</p>
                <p className="text-lg font-bold mt-0.5 text-violet-600 tabular-nums">
                  {gpsResumenMes.kmGps > 0 ? `${gpsResumenMes.kmGps.toLocaleString()} km` : '—'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">recorridos guardados</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Km Reg.</p>
                <p className="text-lg font-bold mt-0.5 text-sky-600 tabular-nums">
                  {gpsResumenMes.kmReg > 0 ? `${gpsResumenMes.kmReg.toLocaleString()} km` : '—'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">declarados en novedades</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Días con GPS</p>
                <p className="text-lg font-bold mt-0.5 text-teal-600 tabular-nums">
                  {gpsResumenMes.diasGps > 0 ? gpsResumenMes.diasGps : '—'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">días registrados</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-3">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Última actualización
                </p>
                <p className="text-sm font-semibold mt-1 text-slate-600 capitalize">
                  {gpsResumenMes.ultimaFecha
                    ? new Date(gpsResumenMes.ultimaFecha + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'long' })
                    : '—'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">del período</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Resumen por combustible */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle icon={TrendingUp} title="Resumen por combustible" iconColor="text-blue-500" />
          <Link to={createPageUrl('Movimientos')} className="text-xs text-sky-600 hover:underline">
            Ver/cargar movimientos relacionados →
          </Link>
        </div>

        {resumenPorCombustible.length === 0 ? (
          <p className="text-sm text-slate-400">No hay datos de consumo para el período seleccionado.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {resumenPorCombustible.map(res => {
              const isExpanded = expandedComb.has(res.nombreCombustible);
              const isComprasExpanded = expandedCompras.has(res.nombreCombustible);
              const CONSUMER_PREVIEW = 4;
              const visibleConsumers = isExpanded ? res.detalleConsumo : res.detalleConsumo.slice(0, CONSUMER_PREVIEW);
              const hasMore = res.detalleConsumo.length > CONSUMER_PREVIEW;
              const comprasOrdenadas = [...res.comprasPeriodo].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
              return (
                <Card key={res.nombreCombustible} className="border border-slate-200 shadow-sm">
                  <CardContent className="p-3 space-y-2">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-800">{res.nombreCombustible}</h3>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        Precio {formatMoneySymbol(res.precioRef, res.moneda)}
                      </Badge>
                    </div>

                    {/* Spreadsheet rows */}
                    <div className="text-xs space-y-0">
                      {/* Inicio período — solo si hay filtro de mes */}
                      {mesFiltro !== 'ALL' && (
                        <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                          <span className="text-slate-500">Inicio período</span>
                          <div className="flex items-center gap-3 text-right">
                            <span className="font-semibold text-slate-700">{res.litrosInicio.toFixed(1)} L</span>
                            <span className="text-slate-400 w-20 text-right">{formatMoneySymbol(res.montoInicio, res.moneda)}</span>
                          </div>
                        </div>
                      )}
                      {/* Compras — fila expandible */}
                      <button
                        onClick={() => toggleCompras(res.nombreCombustible)}
                        className="w-full flex items-center justify-between py-1.5 border-b border-slate-100 hover:bg-slate-50 -mx-3 px-3 transition-colors"
                      >
                        <span className="flex items-center gap-1 text-slate-500">
                          <ChevronDown className={`w-3 h-3 transition-transform text-sky-500 ${isComprasExpanded ? 'rotate-180' : ''}`} />
                          + Compras <span className="text-slate-400">({res.comprasOpsMes})</span>
                        </span>
                        <div className="flex items-center gap-3 text-right">
                          <span className="font-semibold text-slate-700">{res.litrosCompras.toFixed(1)} L</span>
                          <span className="text-slate-400 w-20 text-right">{formatMoneySymbol(res.montoCompras, res.moneda)}</span>
                        </div>
                      </button>
                      {/* Sub-desglose compras: reserva vs directa (solo cuando existen ambos flujos) */}
                      {(() => {
                        const directa = res.litrosCompras - res.litrosComprasReservaMes;
                        if (res.litrosComprasReservaMes > 0 && directa > 0) return (
                          <div className="bg-slate-50/60 -mx-3 px-5 py-1 border-b border-slate-100 space-y-0.5">
                            <div className="flex justify-between text-[11px] text-slate-400">
                              <span>↳ A reserva interna</span>
                              <span className="tabular-nums">{res.litrosComprasReservaMes.toFixed(1)} L</span>
                            </div>
                            <div className="flex justify-between text-[11px] text-slate-400">
                              <span>↳ Compra directa vehículos</span>
                              <span className="tabular-nums">{directa.toFixed(1)} L</span>
                            </div>
                          </div>
                        );
                        return null;
                      })()}
                      {/* Detalle de compras expandido */}
                      {isComprasExpanded && comprasOrdenadas.length > 0 && (
                        <div className="bg-slate-50/80 -mx-3 px-3 pb-1 border-b border-slate-100">
                          <div className="pt-1 space-y-0">
                            {comprasOrdenadas.map(m => (
                              <div key={m.id} className="py-1 border-b border-slate-100 last:border-0 space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400 tabular-nums shrink-0 w-20">{m.fecha}</span>
                                  <span className="text-slate-600 truncate flex-1 min-w-0">
                                    {m.consumidor_nombre || m.referencia || '—'}
                                    {m.vehiculo_chapa && <span className="text-slate-400 ml-1 font-mono">[{m.vehiculo_chapa}]</span>}
                                  </span>
                                  <span className="text-slate-700 font-medium shrink-0">{(m.litros || 0).toFixed(1)} L</span>
                                  <span className="text-slate-400 shrink-0 w-16 text-right">{formatMoneySymbol(m.monto, res.moneda)}</span>
                                </div>
                                {(m.tarjeta_alias || m.consumidor_origen_nombre) && (
                                  <div className="flex items-center gap-1 pl-20">
                                    <span className="text-[10px] text-slate-400">origen:</span>
                                    <span className="text-[10px] font-medium text-sky-700 truncate">
                                      {m.tarjeta_alias || m.consumidor_origen_nombre}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Total disponible */}
                      <div className="flex items-center justify-between py-1.5 border-b border-slate-200 bg-slate-50 -mx-3 px-3">
                        <span className="font-medium text-slate-600">= Total disponible</span>
                        <div className="flex items-center gap-3 text-right">
                          <span className="font-bold text-slate-800">{res.litrosDisponible.toFixed(1)} L</span>
                          <span className="text-slate-500 w-20 text-right">{formatMoneySymbol(res.montoDisponible, res.moneda)}</span>
                        </div>
                      </div>

                      {/* Consumo por consumidor (solo litros — DESPACHO no lleva importe) */}
                      {res.detalleConsumo.length > 0 && (
                        <div className="pt-1">
                          {!isEconomico && (
                            <>
                              <p className="text-[10px] text-slate-400 uppercase tracking-wide pb-0.5">Consumo por consumidor</p>
                              {visibleConsumers.map(d => (
                                <div key={d.id} className="flex items-center justify-between py-1 border-b border-slate-50">
                                  <span className="text-slate-500 truncate max-w-[65%]">
                                    {d.nombre}
                                    {d.chapa && <span className="text-slate-400 ml-1 font-mono text-[10px]">[{d.chapa}]</span>}
                                  </span>
                                  <span className="text-slate-700 font-medium shrink-0">{d.litros.toFixed(1)} L</span>
                                </div>
                              ))}
                              {hasMore && (
                                <button
                                  onClick={() => toggleComb(res.nombreCombustible)}
                                  className="flex items-center gap-1 text-[10px] text-sky-600 mt-0.5 hover:underline"
                                >
                                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                  {isExpanded ? 'Ver menos' : `Ver ${res.detalleConsumo.length - CONSUMER_PREVIEW} más`}
                                </button>
                              )}
                            </>
                          )}
                          {/* Total consumo */}
                          <div className="flex items-center justify-between py-1.5 border-t border-slate-200 mt-0.5">
                            <span className="font-medium text-slate-600">Total consumo <span className="text-slate-400">({res.despachosOpsCombMes})</span></span>
                            <span className="font-bold text-slate-800">{res.litrosConsumo.toFixed(1)} L</span>
                          </div>
                        </div>
                      )}

                      {/* Saldo final */}
                      <div className="flex items-center justify-between py-1.5 rounded-md bg-emerald-50 -mx-3 px-3 mt-1">
                        <span className="font-semibold text-emerald-700">Saldo final</span>
                        <div className="text-right">
                          <span className="font-bold text-emerald-700">{res.litrosSaldoFinal.toFixed(1)} L</span>
                          {res.precioRef > 0 && (
                            <p className="text-[10px] text-emerald-600">≈ {formatMoneySymbol(res.litrosSaldoFinal * res.precioRef, res.moneda)}</p>
                          )}
                        </div>
                      </div>
                      {/* Descomposición del saldo final: reserva + ya en vehículos (suma = saldo final) */}
                      {res.litrosSaldoFinal > 0 && (res.litrosEnTanqueEstimado > 0 || (res.litrosCompras - res.litrosComprasReservaMes) > 0) && (
                        <div className="bg-slate-50 -mx-3 px-3 py-1.5 rounded-b-md border border-slate-100 border-t-0 space-y-0.5">
                          {res.litrosEnTanqueEstimado > 0 && (
                            <div className="flex justify-between text-[11px] text-slate-500">
                              <span>🛢 En reserva (tanques)</span>
                              <div className="text-right">
                                <span className="tabular-nums font-medium">{res.litrosEnTanqueEstimado.toFixed(1)} L</span>
                                {res.precioRef > 0 && <span className="text-slate-400 ml-1">≈ {formatMoneySymbol(res.litrosEnTanqueEstimado * res.precioRef, res.moneda)}</span>}
                              </div>
                            </div>
                          )}
                          {res.litrosSaldoFinal - res.litrosEnTanqueEstimado > 0.05 && (
                            <div className="flex justify-between text-[11px] text-slate-500">
                              <span>🚗 Ya en vehículos</span>
                              <span className="tabular-nums font-medium">{(res.litrosSaldoFinal - res.litrosEnTanqueEstimado).toFixed(1)} L</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end pt-0.5">
                      <Link
                        to={`${createPageUrl('Movimientos')}?combustible=${encodeURIComponent(res.nombreCombustible)}`}
                        className="text-[11px] text-sky-600 hover:underline"
                      >
                        Ver movimientos →
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Surtidores externos — Cupet y similares donde los vehículos cargan con tarjeta */}
      {saldoSurtidores.length > 0 && (
        <div>
          <SectionTitle icon={Warehouse} title="Surtidores / Depósitos Externos" iconColor="text-orange-500" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {saldoSurtidores.map(surt => (
              <Card key={surt.id} className="border-0 shadow-sm ring-1 ring-orange-100">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      <Warehouse className="w-4 h-4 text-orange-500 shrink-0" />
                      {surt.nombre}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {surt.combustibleNombre && (
                        <Badge variant="outline" className="text-[10px] px-1.5">{surt.combustibleNombre}</Badge>
                      )}
                      {surt.tarjetaAlias && (
                        <Badge variant="outline" className="text-[10px] shrink-0 border-orange-200 text-orange-700">🪙 {surt.tarjetaAlias}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Recibido (desde isotanque)</span>
                      <span className="font-medium text-slate-700">{surt.entradasDespacho.toFixed(1)} L</span>
                    </div>
                    {surt.salidasDespacho > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Despachado (manual)</span>
                        <span className="font-medium text-slate-700">- {surt.salidasDespacho.toFixed(1)} L</span>
                      </div>
                    )}
                    {surt.salidasCompra != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Retirado por vehículos (tarjeta)</span>
                        <span className="font-medium text-slate-700">- {surt.salidasCompra.toFixed(1)} L</span>
                      </div>
                    )}
                    {surt.salidasCompra == null && (
                      <p className="text-[10px] text-orange-400 pt-0.5">
                        Sin tarjeta vinculada — edita este surtidor en Consumidores para vincular una tarjeta y calcular el saldo automáticamente.
                      </p>
                    )}
                    <div className="flex justify-between border-t border-slate-100 pt-1 mt-0.5">
                      <span className="font-semibold text-orange-700">Stock disponible</span>
                      <span className={`font-bold ${surt.stockActual <= 0 ? 'text-red-600' : 'text-orange-700'}`}>
                        {surt.stockActual.toFixed(1)} L
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Saldo en depósitos externos */}
      {saldoDepositos.length > 0 && (
        <div>
          <SectionTitle icon={Warehouse} title="Saldo en depósitos externos" iconColor="text-teal-500" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {saldoDepositos.map(dep => (
              <Card key={dep.consumidorId || dep.consumidorNombre} className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      <Warehouse className="w-4 h-4 text-teal-500 shrink-0" />
                      {dep.consumidorNombre}
                    </p>
                    {dep.tarjetaAlias && (
                      <Badge variant="outline" className="text-[10px] shrink-0">🪙 {dep.tarjetaAlias}</Badge>
                    )}
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total depositado</span>
                      <span className="font-medium text-slate-700">{dep.litros.toFixed(1)} L</span>
                    </div>
                    {dep.retirados != null && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Retirado (COMPRAs)</span>
                        <span className="font-medium text-slate-700">{dep.retirados.toFixed(1)} L</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-100 pt-1 mt-0.5">
                      <span className="font-semibold text-teal-700">Saldo disponible</span>
                      <span className={`font-bold ${dep.saldo != null ? (dep.saldo < 0 ? 'text-red-600' : 'text-teal-700') : 'text-slate-600'}`}>
                        {dep.saldo != null ? `${dep.saldo.toFixed(1)} L` : `${dep.litros.toFixed(1)} L`}
                      </span>
                    </div>
                    {dep.retirados == null && (
                      <p className="text-[10px] text-slate-400 pt-0.5">Sin tarjeta asociada — configure una al registrar el depósito para calcular saldo automáticamente.</p>
                    )}
                    {dep.monto > 0 && (
                      <p className="text-[10px] text-slate-400">Costo adquisición: {formatMonto(dep.monto)}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={statModal.open} onOpenChange={(open) => { setStatModal(s => ({ ...s, open })); setModalGrupoIdx(0); }}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
            <DialogTitle className="text-base">
              {statModal.tipo === 'consumo' && 'Despachos por combustible'}
              {statModal.tipo === 'consumidores' && 'Consumidores por combustible'}
              {statModal.tipo === 'alertas' && 'Alertas críticas por combustible'}
            </DialogTitle>
          </DialogHeader>

          {modalDataPorCard.length === 0 ? (
            <p className="text-sm text-slate-500 px-5 py-8 text-center">No hay operaciones para el período.</p>
          ) : (
            <div className="flex h-[62vh]">
              {/* Panel izquierdo: lista de combustibles */}
              <div className="w-44 shrink-0 border-r border-slate-100 overflow-y-auto py-2">
                {modalDataPorCard.map((grupo, idx) => (
                  <button
                    key={grupo.combustible}
                    onClick={() => setModalGrupoIdx(idx)}
                    className={`w-full text-left px-4 py-3 transition-colors ${
                      idx === modalGrupoIdx
                        ? 'bg-sky-50 border-r-2 border-sky-500'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <p className={`text-sm font-semibold truncate ${idx === modalGrupoIdx ? 'text-sky-700' : 'text-slate-700'}`}>
                      {grupo.combustible}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${idx === modalGrupoIdx ? 'text-sky-500' : 'text-slate-400'}`}>
                      {grupo.movimientos.length} ops
                    </p>
                  </button>
                ))}
              </div>

              {/* Panel derecho: movimientos del grupo seleccionado */}
              {(() => {
                const grupo = modalDataPorCard[modalGrupoIdx];
                if (!grupo) return null;
                const totalLitros = grupo.movimientos.reduce((s, m) => s + (m.litros || 0), 0);
                const totalMonto = grupo.movimientos.reduce((s, m) => s + (m.monto || 0), 0);
                return (
                  <div className="flex-1 flex flex-col min-w-0">
                    {/* Cabecera del panel */}
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{grupo.combustible}</p>
                        <p className="text-[11px] text-slate-400">{grupo.movimientos.length} operaciones</p>
                      </div>
                      <div className="flex gap-3 text-right">
                        {totalLitros > 0 && (
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase">Litros</p>
                            <p className="text-sm font-bold text-orange-600">{totalLitros.toFixed(1)} L</p>
                          </div>
                        )}
                        {totalMonto > 0 && (
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase">Monto</p>
                            <p className="text-sm font-bold text-slate-700">{formatMoneySymbol(totalMonto)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Lista de movimientos */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                      {grupo.movimientos.map((m) => (
                        <div key={m.id} className="px-4 py-2.5 hover:bg-slate-50/60 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-800 truncate leading-snug">
                              {m.consumidor_nombre || m.vehiculo_chapa || 'Sin consumidor'}
                            </p>
                            <span className="text-[11px] text-slate-400 shrink-0">{m.fecha}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <div className="flex items-center gap-2 text-[11px] text-slate-500">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{m.tipo}</Badge>
                              {(m.litros || 0) > 0 && <span>{(m.litros).toFixed(1)} L</span>}
                              {(m.monto || 0) > 0 && <span>{formatMoneySymbol(m.monto)}</span>}
                            </div>
                            <Link
                              to={`${createPageUrl('Movimientos')}?movimientoId=${m.id}`}
                              className="text-[11px] text-sky-600 hover:underline shrink-0"
                              onClick={() => { setStatModal({ open: false, tipo: null }); setModalGrupoIdx(0); }}
                            >
                              Ver →
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Alertas de nivel bajo — solo operacional */}
      {!isEconomico && alertasNivel.length > 0 && (
        <div className="space-y-2">
          {alertasNivel.map(c => (
            <div key={c.id} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="font-semibold text-red-700">{c.nombre}</span>
              {c.codigo_interno && <span className="text-red-500 font-mono text-xs">{c.codigo_interno}</span>}
              <span className="text-red-600 text-xs">
                — nivel bajo: {c._nivelEstimado.toFixed(0)} L ({c._pct.toFixed(0)}% de {c._capacidad.toFixed(0)} L)
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Consumidores por tipo — solo operacional */}
      {!isEconomico && (
        <div>
          <SectionTitle icon={Users} title="Estado de consumidores" iconColor="text-slate-500" />
          <ConsumidoresPorTipo
            consumidores={consumidores.filter(c => !consumidoresSurtidorIds.has(c.id))}
            tiposConsumidor={tiposConsumidor}
            movimientos={movimientos}
            mesFiltro={mesFiltro}
          />
          <Link to={createPageUrl('Movimientos')} className="text-xs text-sky-600 hover:underline mt-3 inline-block">
            Ver todos los movimientos →
          </Link>
        </div>
      )}
    </div>
  );
}
