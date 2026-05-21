import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Calendar, ChevronDown, Clock, Droplets, Eye, Gauge, User } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import CombustibleBadge from '@/components/ui-helpers/CombustibleBadge';

function getIconForTipo(nombre) {
  const n = nombre?.toLowerCase() || '';
  if (n.includes('tanque') || n.includes('reserva')) return '🛢️';
  if (n.includes('equipo') || n.includes('grupo') || n.includes('generador')) return '⚡';
  if (n.includes('moto')) return '🏍️';
  return '🚗';
}

function esTanque(consumidor) {
  const n = (consumidor.tipo_consumidor_nombre || '').toLowerCase();
  return n.includes('tanque') || n.includes('reserva');
}

// Consumidor de tipo "Uso de almacén" = autorizaciones ad-hoc (no vehículo, no tanque)
function esAlmacenUso(consumidor) {
  if (esTanque(consumidor)) return false;
  const n = (consumidor.tipo_consumidor_nombre || '').toLowerCase();
  return n.includes('almac');
}

function fuelColor(nombre) {
  const n = (nombre || '').toLowerCase();
  if (n.includes('diesel'))   return 'text-amber-600';
  if (n.includes('especial')) return 'text-blue-600';
  return 'text-emerald-600';
}

function abbrFuel(nombre) {
  const n = (nombre || '').toLowerCase();
  if (n.includes('gasolina') && n.includes('especial')) return 'G. Especial';
  if (n.includes('gasolina') && n.includes('regular'))  return 'G. Regular';
  return nombre;
}

function StockBar({ pct }) {
  const [hovered, setHovered] = React.useState(false);
  const color = pct < 20 ? 'bg-red-400' : pct < 40 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="relative w-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {hovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap shadow">
          {pct.toFixed(0)}% de capacidad
        </div>
      )}
    </div>
  );
}

function Stat({ label, children, className = '' }) {
  return (
    <div className={`rounded-md bg-slate-50 p-2 ${className}`}>
      <p className="text-[10px] text-slate-400 mb-0.5 leading-none">{label}</p>
      {children}
    </div>
  );
}

function esEquipo(consumidor) {
  const n = (consumidor.tipo_consumidor_nombre || '').toLowerCase();
  return n.includes('equipo') || n.includes('planta') || n.includes('generador') || n.includes('grupo');
}

function ConsumidorCard({ consumidor, movimientos, hoy, mesFiltro = 'ALL' }) {
  const mesActual = hoy.toISOString().slice(0, 7);
  const periodo = mesFiltro === 'ALL' ? mesActual : mesFiltro;
  const esTanqueConsumidor = esTanque(consumidor);
  const esEquipoConsumidor = esEquipo(consumidor);
  const [detallesOpen, setDetallesOpen] = useState(false);
  const [mesDetallesOpen, setMesDetallesOpen] = useState(false);

  // ── Compras ordenadas por fecha desc ──────────────────────────────────────
  const compras = React.useMemo(() =>
    movimientos
      .filter(m => m.tipo === 'COMPRA' && m.consumidor_id === consumidor.id)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')),
  [movimientos, consumidor.id]);

  // ── Despachos recibidos (para "Uso de almacén" / Autorizo) ────────────────
  const despachosRecibidos = React.useMemo(() =>
    movimientos
      .filter(m => m.tipo === 'DESPACHO' && m.consumidor_id === consumidor.id)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')),
  [movimientos, consumidor.id]);

  const ultimaCarga = React.useMemo(() => {
    const c = compras[0] ?? null;
    const d = despachosRecibidos[0] ?? null;
    if (!c && !d) return null;
    if (!c) return d;
    if (!d) return c;
    return c.fecha >= d.fecha ? c : d;
  }, [compras, despachosRecibidos]);
  const diasSinAbast = ultimaCarga
    ? Math.floor((hoy - new Date(ultimaCarga.fecha + 'T00:00:00')) / 864e5)
    : null;

  // ── Mes de referencia: usa el filtro activo o, si es ALL, el último mes con actividad
  const mesReferencia = React.useMemo(() => {
    if (mesFiltro !== 'ALL') return mesFiltro;
    const hayEsteMes = [...compras, ...despachosRecibidos]
      .some(m => m.fecha?.startsWith(mesActual));
    if (hayEsteMes) return mesActual;
    const masReciente = [...compras, ...despachosRecibidos]
      .filter(m => m.fecha)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))[0];
    return masReciente?.fecha?.slice(0, 7) ?? mesActual;
  }, [mesFiltro, compras, despachosRecibidos, mesActual]);

  const esMesActual = mesFiltro === 'ALL' && mesReferencia === mesActual;

  // ── Cargas del mes de referencia ─────────────────────────────────────────
  const comprasMes = React.useMemo(() =>
    compras.filter(m => m.fecha?.startsWith(mesReferencia)),
  [compras, mesReferencia]);

  const despachosRecibidosMes = React.useMemo(() =>
    despachosRecibidos.filter(m => m.fecha?.startsWith(mesReferencia)),
  [despachosRecibidos, mesReferencia]);

  const litrosMes    = comprasMes.reduce((s, m) => s + (m.litros || 0), 0)
                     + despachosRecibidosMes.reduce((s, m) => s + (m.litros || 0), 0);
  const gastoMes     = comprasMes.reduce((s, m) => s + (m.monto  || 0), 0);
  const numCargasMes = comprasMes.length + despachosRecibidosMes.length;

  // ── Odómetro: todas las lecturas (COMPRA + DESPACHO recibidos) ───────────
  // DESPACHO puede registrar odómetro igual que COMPRA; ignorarlos causaría
  // que vehículos abastecidos solo por despacho no mostraran km ni consumo.
  const abastecimientosConOdo = React.useMemo(() =>
    [...compras, ...despachosRecibidos]
      .filter(m => m.odometro != null)
      .sort((a, b) => (b.odometro || 0) - (a.odometro || 0)),
  [compras, despachosRecibidos]);

  const ultimoOdometro    = abastecimientosConOdo[0]?.odometro    ?? null;
  const ultimoConsumoReal = abastecimientosConOdo[0]?.consumo_real ?? null;

  // ── Odómetro: últimas dos lecturas registradas (sin filtro de mes) ─────────
  // abastecimientosConOdo ordenado por odómetro DESC → [0] = última, [1] = anterior
  const odoFin      = abastecimientosConOdo[0]?.odometro ?? null;
  const odoFinFecha = abastecimientosConOdo[0]?.fecha    ?? null;
  const odoInicio   = abastecimientosConOdo[1]?.odometro ?? null;

  const kmEntreOdo = odoFin != null && odoInicio != null && odoFin > odoInicio
    ? odoFin - odoInicio
    : null;

  // Índice de consumo del período: promedio de consumo_real de las cargas del mes
  // incluyendo DESPACHO recibidos (pueden tener consumo_real si se registró odómetro).
  const indiceConsumoRealMes = React.useMemo(() => {
    const movsCon = [...comprasMes, ...despachosRecibidosMes]
      .filter(m => m.consumo_real != null && m.consumo_real > 0);
    if (movsCon.length === 0) return null;
    return movsCon.reduce((s, m) => s + m.consumo_real, 0) / movsCon.length;
  }, [comprasMes, despachosRecibidosMes]);

  // ── Consumo verificado por nivel de tanque ────────────────────────────────
  // Requiere dos cargas consecutivas con nivel_tanque registrado
  const fillsConNivel = React.useMemo(() => {
    if (esEquipoConsumidor) return [];
    return [...compras, ...despachosRecibidos]
      .filter(m => m.nivel_tanque != null && m.nivel_tanque >= 0)
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [esEquipoConsumidor, compras, despachosRecibidos]);

  const nivelData = React.useMemo(() => {
    if (fillsConNivel.length < 2) return null;
    const actual   = fillsConNivel[0]; // carga más reciente con nivel
    const anterior = fillsConNivel[1]; // carga anterior con nivel

    // Litros en tanque tras la carga anterior
    const nivelPostAnterior = (anterior.nivel_tanque || 0) + (anterior.litros || 0);
    // Litros en tanque antes de la carga actual (lo que quedaba)
    const nivelPreActual = actual.nivel_tanque || 0;
    // Combustible realmente consumido entre ambas cargas
    const litrosConsumidos = nivelPostAnterior - nivelPreActual;
    if (litrosConsumidos <= 0) return null; // dato inconsistente

    // Km del intervalo: usar km_recorridos del movimiento o diferencia de odómetros
    const kmIntervalo =
      (actual.km_recorridos && actual.km_recorridos > 0 ? actual.km_recorridos : null) ??
      (actual.odometro != null && anterior.odometro != null
        ? actual.odometro - anterior.odometro
        : null);

    const indice = kmIntervalo != null && kmIntervalo > 0
      ? kmIntervalo / litrosConsumidos
      : null;

    // Discrepancia entre litros cargados y litros realmente consumidos
    const litrosCargados    = actual.litros || 0;
    const discrepanciaL     = litrosConsumidos - litrosCargados;
    // Positivo = consumió más de lo que cargó (déficit)
    // Negativo = consumió menos de lo que cargó (sobra en tanque, normal si no lo llenó completo)
    const discrepanciaPct   = litrosCargados > 0
      ? (Math.abs(discrepanciaL) / litrosCargados) * 100
      : null;

    return {
      litrosConsumidos,
      litrosCargados,
      nivelPostAnterior,
      nivelPreActual,
      indice,
      kmIntervalo,
      discrepanciaL,
      discrepanciaPct,
      fechaActual:   actual.fecha,
      fechaAnterior: anterior.fecha,
    };
  }, [fillsConNivel]);

  // ── Horas de uso (equipos/generadores) ───────────────────────────────────
  const movsConHoras = React.useMemo(() => {
    if (!esEquipoConsumidor) return [];
    const todos = [...compras, ...despachosRecibidos].filter(m => m.horas_uso != null);
    return todos.sort((a, b) => (b.horas_uso || 0) - (a.horas_uso || 0));
  }, [esEquipoConsumidor, compras, despachosRecibidos]);

  const ultimasHoras      = movsConHoras[0]?.horas_uso ?? null;
  const ultimasHorasFecha = movsConHoras[0]?.fecha     ?? null;
  const horasMes = React.useMemo(() => {
    if (!esEquipoConsumidor) return 0;
    const lecturaMes   = movsConHoras.find(m => m.fecha?.startsWith(periodo))?.horas_uso ?? null;
    const lecturaAntes = movsConHoras.find(m => !m.fecha?.startsWith(periodo) && (m.fecha || '') < periodo)?.horas_uso ?? null;
    if (lecturaMes == null) return 0;
    if (lecturaAntes == null) return 0;
    return Math.max(0, lecturaMes - lecturaAntes);
  }, [esEquipoConsumidor, movsConHoras, periodo]);

  // ── Referencias de consumo ────────────────────────────────────────────────
  const consumoRealRef    = consumidor.datos_vehiculo?.indice_consumo_real      ?? null;
  const consumoFabricante = consumidor.datos_vehiculo?.indice_consumo_fabricante ?? null;
  const consumoRef        = consumoRealRef || consumoFabricante || null;
  const umbralCritico     = consumidor.datos_vehiculo?.umbral_critico_pct ?? 30;
  const umbralAlerta      = consumidor.datos_vehiculo?.umbral_alerta_pct  ?? 15;


  // ── Estado vehículo ───────────────────────────────────────────────────────
  const estadoVehiculo = consumidor.datos_vehiculo?.estado_vehiculo;
  const estadoBadgeStyle = {
    'En mantenimiento': 'border-amber-200 text-amber-700',
    'Fuera de servicio': 'border-red-200 text-red-700',
    'Baja': 'border-slate-300 text-slate-500',
  }[estadoVehiculo] ?? null;

  // ── Tanques: stock / cobertura / despacho ─────────────────────────────────
  const capacidad = consumidor.datos_tanque?.capacidad_litros || null;

  const stockActual = React.useMemo(() => {
    if (!esTanqueConsumidor) return null;
    const ini    = Number(consumidor.litros_iniciales) || 0;
    const entras = movimientos.filter(m => (m.tipo === 'COMPRA' || m.tipo === 'DEPOSITO') && m.consumidor_id        === consumidor.id).reduce((s, m) => s + (m.litros || 0), 0);
    const sales  = movimientos.filter(m =>  m.tipo === 'DESPACHO'                         && m.consumidor_origen_id === consumidor.id).reduce((s, m) => s + (m.litros || 0), 0);
    return Math.max(0, ini + entras - sales);
  }, [esTanqueConsumidor, movimientos, consumidor.id, consumidor.litros_iniciales]);

  const coberturaDias = React.useMemo(() => {
    if (!esTanqueConsumidor || stockActual == null) return null;
    const hace30Str = new Date(hoy.getTime() - 30 * 864e5).toISOString().slice(0, 10);
    const total30   = movimientos
      .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === consumidor.id && m.fecha >= hace30Str)
      .reduce((s, m) => s + (m.litros || 0), 0);
    if (!total30) return null;
    return Math.floor(stockActual / (total30 / 30));
  }, [esTanqueConsumidor, stockActual, movimientos, consumidor.id, hoy]);

  const despachadoMes = React.useMemo(() => {
    if (!esTanqueConsumidor) return 0;
    return movimientos
      .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === consumidor.id && m.fecha?.startsWith(periodo))
      .reduce((s, m) => s + (m.litros || 0), 0);
  }, [esTanqueConsumidor, movimientos, consumidor.id, periodo]);

  const stockPct = capacidad && stockActual != null ? (stockActual / capacidad) * 100 : null;

  // ── Desglose mensual ─────────────────────────────────────────────────────
  const monthlyStats = React.useMemo(() => {
    const todos = [...compras, ...despachosRecibidos]
      .filter(m => m.fecha)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    const meses = [...new Set(todos.map(m => m.fecha.slice(0, 7)))].sort((a, b) => b.localeCompare(a));
    return meses.map((mes, mesIdx) => {
      const movsDelMes    = todos.filter(m => m.fecha.startsWith(mes));
      const comprasDelMes = movsDelMes.filter(m => m.tipo === 'COMPRA');
      const litros        = movsDelMes.reduce((s, m) => s + (m.litros || 0), 0);
      const monto         = comprasDelMes.reduce((s, m) => s + (m.monto || 0), 0);
      const conOdo        = movsDelMes.filter(m => m.odometro != null).sort((a, b) => a.odometro - b.odometro);
      const odoFinMes     = conOdo.length > 0 ? conOdo[conOdo.length - 1].odometro : null;
      const antesDelMes   = todos.filter(m => m.fecha < mes + '-01' && m.odometro != null);
      const odoInicioMes  = antesDelMes.length > 0
        ? Math.max(...antesDelMes.map(m => m.odometro))
        : (conOdo.length > 0 ? conOdo[0].odometro : null);
      const kmRecorridos  = odoFinMes != null && odoInicioMes != null && odoFinMes > odoInicioMes
        ? odoFinMes - odoInicioMes
        : null;
      const odoInconsistente = odoInicioMes != null && odoFinMes != null && odoFinMes < odoInicioMes;
      // Calcular km/L directamente desde los odómetros en orden cronológico,
      // sin leer consumo_real de la BD (que puede quedar obsoleto al editar un odo anterior).
      const todosConOdoAsc = todos
        .filter(m => m.odometro != null)
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.odometro - b.odometro));

      const kmlPorFill = conOdo
        .slice()
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.odometro - b.odometro))
        .map(fill => {
          const idx = todosConOdoAsc.findIndex(m => m.id === fill.id);
          if (idx <= 0) return null; // sin carga anterior con odo → no se puede calcular
          const prev = todosConOdoAsc[idx - 1];
          const km  = (fill.odometro || 0) - (prev.odometro || 0);
          const lit = fill.litros || 0;
          return (km > 0 && lit > 0) ? km / lit : null;
        })
        .filter(v => v != null);

      const consumoReal = kmlPorFill.length > 0
        ? kmlPorFill.reduce((s, v) => s + v, 0) / kmlPorFill.length
        : null;

      // sinCierre: hay odo en el mes pero no se puede calcular km/L aún
      // (ninguna carga del mes tiene una carga previa con odómetro registrado)
      const sinCierre = conOdo.length > 0 && consumoReal == null && !odoInconsistente;

      // consumoAnomalo: km/L > 200 = salto de odo incorrecto o litros casi nulos
      const consumoAnomalo = consumoReal != null && consumoReal > 200;

      const litrosConsumidosEst = kmRecorridos != null && consumoReal != null && consumoReal > 0 && !consumoAnomalo
        ? kmRecorridos / consumoReal
        : null;

      // Cargas del mes sin carga previa con odo (para tooltip de diagnóstico)
      const fillsSinConsumoReal = sinCierre
        ? conOdo.filter(fill => todosConOdoAsc.findIndex(m => m.id === fill.id) <= 0)
        : [];

      // ── Nivel físico en tanque al cierre del mes ──────────────────────────
      // Estrategia A (exacto): nivel_tanque de la 1ª carga del mes siguiente
      // = cuánto había en el tanque al llegar a esa carga = cierre exacto del mes actual
      const mesSiguiente = mesIdx > 0 ? meses[mesIdx - 1] : null; // meses está desc → el anterior en idx es el más reciente
      const primeraDelMesSig = mesSiguiente
        ? todos
            .filter(m => m.fecha.startsWith(mesSiguiente) && m.nivel_tanque != null)
            .sort((a, b) => a.fecha.localeCompare(b.fecha))[0]
        : null;
      const nivelCierreExacto = primeraDelMesSig?.nivel_tanque ?? null;

      // Estrategia B (estimado superior): nivel_tanque + litros de la última carga del mes con nivel
      // Solo aplicable al mes más reciente (mesIdx === 0), representa el nivel justo tras la última carga
      const ultimaConNivel = mesIdx === 0
        ? movsDelMes
            .filter(m => m.nivel_tanque != null)
            .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
        : null;
      const nivelCierreEst = ultimaConNivel != null
        ? (ultimaConNivel.nivel_tanque || 0) + (ultimaConNivel.litros || 0)
        : null;

      const nivelCierre    = nivelCierreExacto ?? nivelCierreEst;
      const nivelCierreEsExacto = nivelCierreExacto != null;

      return { mes, cargas: movsDelMes.length, litros, monto, odoInicioMes, odoFinMes, kmRecorridos, consumoReal, odoInconsistente, sinCierre, consumoAnomalo, litrosConsumidosEst, nivelCierre, nivelCierreEsExacto, fillsSinConsumoReal };
    });
  }, [compras, despachosRecibidos]);

  // Consumo real calculado desde secuencia de odómetros (no desde campo BD)
  const statMesRef = monthlyStats.find(s => s.mes === mesReferencia) ?? null;
  const consumoRealCalculado = statMesRef?.consumoReal ?? null;

  // Prioridad para alertas: nivel_tanque > índice_odo_mes
  const consumoParaAlerta = nivelData?.indice ?? consumoRealCalculado;
  let estadoConsumo = null;
  let desvPct       = null;
  if (consumoRef && consumoParaAlerta != null) {
    desvPct = ((consumoRef - consumoParaAlerta) / consumoRef) * 100;
    if (desvPct >= umbralCritico) estadoConsumo = 'critico';
    else if (desvPct >= umbralAlerta) estadoConsumo = 'alerta';
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const ringCard = estadoConsumo === 'critico' ? 'ring-1 ring-red-200'
    : estadoConsumo === 'alerta' ? 'ring-1 ring-amber-200'
    : '';

  const diasStyle = diasSinAbast === null ? 'bg-slate-50 text-slate-400'
    : diasSinAbast > 30 ? 'bg-red-50 text-red-700'
    : diasSinAbast > 14 ? 'bg-amber-50 text-amber-700'
    : 'bg-emerald-50 text-emerald-700';

  // ━━━━━━━━━━━━━━━━━━━━━━ TANQUE CARD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (esTanqueConsumidor) {
    return (
      <Card className="border border-slate-200 shadow-sm">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{consumidor.nombre}</p>
              {consumidor.codigo_interno && (
                <p className="text-[11px] text-slate-400 font-mono">{consumidor.codigo_interno}</p>
              )}
            </div>
            {consumidor.combustible_nombre && (
              <CombustibleBadge nombre={consumidor.combustible_nombre} className="shrink-0" />
            )}
          </div>

          {stockActual != null && (
            <div>
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span className="flex items-center gap-1"><Droplets className="w-3 h-3 text-blue-400" />Stock actual</span>
                <span className="font-bold text-slate-700">{stockActual.toFixed(1)} L{capacidad ? ` / ${capacidad} L` : ''}</span>
              </div>
              {capacidad && <StockBar pct={stockPct} />}
              {coberturaDias != null && (
                <p className={`text-[10px] mt-1 font-medium ${coberturaDias < 3 ? 'text-red-500' : coberturaDias < 7 ? 'text-amber-500' : 'text-emerald-600'}`}>
                  Cobertura estimada: ~{coberturaDias} días
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <Stat label="Último reaprov.">
              {ultimaCarga ? (
                <>
                  <p className="font-semibold text-slate-700">{Number(ultimaCarga.litros || 0).toFixed(1)} L</p>
                  <p className="text-[10px] text-slate-400">{ultimaCarga.fecha}</p>
                </>
              ) : <p className="text-slate-300">Sin datos</p>}
            </Stat>
            <Stat label="Despachado (mes)">
              <p className="font-semibold text-slate-700">{despachadoMes > 0 ? `${despachadoMes.toFixed(1)} L` : '—'}</p>
            </Stat>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━ USO DE ALMACÉN / AUTORIZO CARD ━━━━━━━━━━━━━━━━━━━━━
  // Autorizaciones ad-hoc: reciben DESPACHO (no COMPRA); no tienen odómetro ni monto
  if (esAlmacenUso(consumidor)) {
    const despachosRecibidosMes = despachosRecibidos.filter(m => m.fecha?.startsWith(periodo));
    const ultimaAutorizacion    = despachosRecibidos[0] ?? null;
    const litrosMesAlmacen      = despachosRecibidosMes.reduce((s, m) => s + (m.litros || 0), 0);
    const numAlmacenMes         = despachosRecibidosMes.length;
    const totalAutorizaciones   = despachosRecibidos.length;
    const totalLitrosHistorico  = despachosRecibidos.reduce((s, m) => s + (m.litros || 0), 0);
    const diasSinAutorizacion   = ultimaAutorizacion
      ? Math.floor((hoy - new Date(ultimaAutorizacion.fecha + 'T00:00:00')) / 864e5)
      : null;
    const diasStyleAlmacen = diasSinAutorizacion === null ? 'bg-slate-50 text-slate-400'
      : diasSinAutorizacion > 30 ? 'bg-red-50 text-red-700'
      : diasSinAutorizacion > 14 ? 'bg-amber-50 text-amber-700'
      : 'bg-emerald-50 text-emerald-700';

    return (
      <>
      <Card className="border border-slate-200 shadow-sm border-l-4 border-l-violet-300">
        <CardContent className="p-3 space-y-2">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{consumidor.nombre}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Autorización de uso</p>
            </div>
            {consumidor.combustible_nombre && (
              <CombustibleBadge nombre={consumidor.combustible_nombre} className="shrink-0" />
            )}
          </div>

          {/* Última autorización */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5 text-xs gap-2">
            <span className="text-slate-400 shrink-0">Última autorización</span>
            {ultimaAutorizacion ? (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <span className="text-slate-500 tabular-nums">{ultimaAutorizacion.fecha}</span>
                {ultimaAutorizacion.combustible_nombre && (
                  <CombustibleBadge nombre={ultimaAutorizacion.combustible_nombre} />
                )}
                <span className="font-semibold text-slate-700">{Number(ultimaAutorizacion.litros || 0).toFixed(1)} L</span>
              </div>
            ) : <span className="text-slate-300">Sin registros</span>}
          </div>

          {/* Stats: mes vs histórico */}
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <Stat label={`${mesFiltro === 'ALL' ? 'Este mes' : 'Período'} (${numAlmacenMes} autorización${numAlmacenMes !== 1 ? 'es' : ''})`}>
              {numAlmacenMes > 0
                ? <p className="font-semibold text-slate-700">{litrosMesAlmacen.toFixed(1)} L</p>
                : <p className="text-slate-300 font-medium">Sin autorizaciones</p>}
            </Stat>
            <Stat label={`Histórico (${totalAutorizaciones} total)`}>
              {totalAutorizaciones > 0
                ? <p className="font-semibold text-slate-700">{totalLitrosHistorico.toFixed(1)} L</p>
                : <p className="text-slate-300 font-medium">—</p>}
            </Stat>
          </div>

          {/* Días desde última autorización */}
          <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${diasStyleAlmacen}`}>
            <span className="opacity-75">Desde última autorización</span>
            <span className="font-bold tabular-nums">
              {diasSinAutorizacion != null ? `${diasSinAutorizacion} días` : '—'}
            </span>
          </div>

          {/* Botón ver detalles */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs text-violet-600 border-violet-200 hover:bg-violet-50 dark:border-violet-800/50 dark:text-violet-400 dark:hover:bg-violet-900/20"
            onClick={() => setDetallesOpen(true)}
          >
            <Eye className="w-3 h-3 mr-1.5" />
            Ver autorizaciones ({totalAutorizaciones})
          </Button>
        </CardContent>
      </Card>

      {/* Modal de autorizaciones */}
      <Dialog open={detallesOpen} onOpenChange={setDetallesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Autorizaciones — {consumidor.nombre}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {despachosRecibidos.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">Sin autorizaciones registradas</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-100 dark:border-slate-700 text-[11px] text-slate-400 uppercase tracking-wide">
                    <th className="text-left py-2 pr-3">Fecha</th>
                    <th className="text-left py-2 pr-3">Combustible</th>
                    <th className="text-right py-2 pr-3">Litros</th>
                    <th className="text-left py-2 pr-2 hidden sm:table-cell">Origen</th>
                    <th className="text-left py-2">Referencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {despachosRecibidos.map(m => (
                    <tr key={m.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-300 tabular-nums">{m.fecha}</td>
                      <td className="py-2 pr-3">
                        {m.combustible_nombre
                          ? <CombustibleBadge nombre={m.combustible_nombre} />
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                        {Number(m.litros || 0).toFixed(1)} L
                      </td>
                      <td className="py-2 pr-2 text-slate-500 dark:text-slate-400 hidden sm:table-cell max-w-[100px] truncate">
                        {m.consumidor_origen_nombre || '—'}
                      </td>
                      <td className="py-2 text-slate-400 max-w-[80px] truncate">
                        {m.referencia || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {despachosRecibidos.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between text-xs text-slate-500">
              <span>{despachosRecibidos.length} autorización{despachosRecibidos.length !== 1 ? 'es' : ''}</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Total: {despachosRecibidos.reduce((s, m) => s + (m.litros || 0), 0).toFixed(1)} L
              </span>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━ VEHÍCULO / EQUIPO CARD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <>
    <Card className={`border border-slate-200 shadow-sm ${ringCard}`}>
      <CardContent className="p-3 space-y-2">

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold text-slate-800 truncate leading-tight">{consumidor.nombre}</p>
              {estadoConsumo && (
                <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${estadoConsumo === 'critico' ? 'text-red-500' : 'text-amber-500'}`} />
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap mt-0.5">
              {consumidor.codigo_interno && (
                <span className="text-[11px] text-slate-400 font-mono">{consumidor.codigo_interno}</span>
              )}
              {(consumidor.conductor || consumidor.responsable) && (
                <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                  {consumidor.codigo_interno && <span className="mr-0.5">·</span>}
                  <User className="w-2.5 h-2.5 inline" />
                  {consumidor.conductor || consumidor.responsable}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {consumidor.combustible_nombre && <CombustibleBadge nombre={consumidor.combustible_nombre} />}
            {estadoBadgeStyle && (
              <Badge variant="outline" className={`text-[10px] ${estadoBadgeStyle}`}>{estadoVehiculo}</Badge>
            )}
          </div>
        </div>

        {/* ── EQUIPO: horas ── */}
        {esEquipoConsumidor && (
          <div className="grid grid-cols-3 gap-1.5 text-xs">
            <Stat label="Horas usadas">
              {ultimasHoras != null ? (
                <>
                  <p className="font-semibold text-slate-700 tabular-nums">{ultimasHoras.toLocaleString()} h</p>
                  <p className="text-[10px] text-slate-400">{ultimasHorasFecha}</p>
                </>
              ) : <p className="text-slate-300 font-medium">—</p>}
            </Stat>
            <Stat label="Horas este mes">
              {horasMes > 0
                ? <p className="font-semibold text-slate-700 tabular-nums">{horasMes.toFixed(1)} h</p>
                : <p className="text-slate-300 font-medium">—</p>}
            </Stat>
            <Stat label="Cargas (mes)">
              {numCargasMes > 0
                ? <p className="font-semibold text-slate-700"><span className="text-sky-700">{numCargasMes}</span> · {litrosMes.toFixed(1)} L</p>
                : <p className="text-slate-300 font-medium">Sin cargas</p>}
            </Stat>
          </div>
        )}
        {esEquipoConsumidor && consumidor.datos_equipo?.indice_consumo_referencia && (
          <div className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5 text-xs gap-2">
            <span className="flex items-center gap-1 text-slate-400 shrink-0">
              <Gauge className="w-3 h-3" /> Consumo ref.
            </span>
            <span className="font-semibold text-slate-700">
              {consumidor.datos_equipo.indice_consumo_referencia} {consumidor.datos_equipo.unidad_medida_consumo || 'L/h'}
            </span>
          </div>
        )}

        {/* ── VEHÍCULO: resumen mensual ── */}
        {!esEquipoConsumidor && (
          <div className="rounded-lg border border-slate-100 bg-slate-50/60 text-xs overflow-hidden">
            <p className="text-[9px] uppercase tracking-widest px-2.5 pt-2 pb-1 flex items-center gap-1.5">
              <span className={esMesActual ? 'text-slate-400' : mesFiltro !== 'ALL' ? 'text-sky-500' : 'text-amber-500'}>
                {esMesActual
                  ? 'Resumen del mes'
                  : mesFiltro !== 'ALL'
                    ? `Período · ${new Date(mesReferencia + '-02').toLocaleDateString('es', { month: 'long', year: 'numeric' })}`
                    : `Último activo · ${new Date(mesReferencia + '-02').toLocaleDateString('es', { month: 'long', year: 'numeric' })}`}
              </span>
            </p>

            {/* Fila odómetro */}
            <div className="grid grid-cols-3 gap-0 border-b border-slate-100">
              {[
                { label: 'Odo. inicio', value: odoInicio != null ? `${odoInicio.toLocaleString()} km` : null },
                { label: 'Odo. final',  value: odoFin    != null ? `${odoFin.toLocaleString()} km`    : null, sub: odoFinFecha },
                { label: 'Km recorridos', value: kmEntreOdo != null ? `${kmEntreOdo.toLocaleString()} km` : null, highlight: true },
              ].map(({ label, value, highlight, sub }) => (
                <div key={label} className="px-2.5 py-1.5 border-r border-slate-100 last:border-r-0">
                  <p className="text-[9px] text-slate-400 leading-none mb-0.5">{label}</p>
                  <p className={`font-semibold tabular-nums ${highlight ? 'text-sky-700' : 'text-slate-700'}`}>
                    {value ?? <span className="text-slate-300 font-normal">—</span>}
                  </p>
                  {sub && <p className="text-[9px] text-slate-400 leading-none mt-0.5">{sub}</p>}
                </div>
              ))}
            </div>

            {/* Fila litros / consumo */}
            <div className="grid grid-cols-3 gap-0">
              <div className="px-2.5 py-1.5 border-r border-slate-100">
                <p className="text-[9px] text-slate-400 leading-none mb-0.5">
                  {esMesActual
                    ? 'Total abastecido'
                    : `Total abastecido (${new Date(mesReferencia + '-02').toLocaleDateString('es', { month: 'short', year: 'numeric' })})`}
                </p>
                <p className="font-semibold text-slate-700">{litrosMes > 0 ? `${litrosMes.toFixed(1)} L` : <span className="text-slate-300 font-normal">—</span>}</p>
                {gastoMes > 0 && <p className="text-[9px] text-slate-400">{formatMonto(gastoMes)}</p>}
                {numCargasMes > 0 && <p className="text-[9px] text-slate-400">{numCargasMes} carga{numCargasMes !== 1 ? 's' : ''}</p>}
              </div>
              <div className="px-2.5 py-1.5 border-r border-slate-100">
                {/* Prioridad: nivel_tanque > odo_mes > última_carga */}
                {nivelData?.indice != null ? (
                  <>
                    <p className="text-[9px] text-slate-400 leading-none mb-0.5 flex items-center gap-1">
                      Consumo real
                      <span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded font-semibold">nivel ✓</span>
                    </p>
                    <p className={`font-semibold tabular-nums ${estadoConsumo === 'critico' ? 'text-red-600' : estadoConsumo === 'alerta' ? 'text-amber-600' : 'text-emerald-700'}`}>
                      {nivelData.indice.toFixed(2)} km/L
                    </p>
                    <p className="text-[9px] text-slate-400">{nivelData.litrosConsumidos.toFixed(1)} L cons.</p>
                  </>
                ) : (
                  <>
                    <p className="text-[9px] text-slate-400 leading-none mb-0.5">Consumo real</p>
                    {(() => {
                      const val = consumoRealCalculado;
                      if (val == null) {
                        const reason = statMesRef?.odoInconsistente
                          ? 'Inconsistencia de odómetro: el valor final es menor al inicial. Revise los registros en Movimientos → Editar.'
                          : statMesRef?.sinCierre
                            ? 'Pendiente: el km/L se calculará cuando haya una carga posterior con odómetro registrado.'
                            : 'Sin odómetro registrado en los abastecimientos de este período, o es la primera carga histórica del vehículo. Registre el odómetro en la carga para calcular el consumo.';
                        return (
                          <p className="text-slate-300 font-normal cursor-help" title={reason}>—</p>
                        );
                      }
                      const colorClass = estadoConsumo === 'critico' ? 'text-red-600' : estadoConsumo === 'alerta' ? 'text-amber-600' : 'text-emerald-700';
                      return (
                        <p className={`font-semibold tabular-nums ${colorClass}`}>{val.toFixed(2)} km/L</p>
                      );
                    })()}
                  </>
                )}
              </div>
              <div className="px-2.5 py-1.5">
                <p className="text-[9px] text-slate-400 leading-none mb-0.5">Consumo fab.</p>
                <p className="font-medium text-slate-500">{consumoRef != null ? `${consumoRef} km/L` : <span className="text-slate-300 font-normal">—</span>}</p>
                {desvPct !== null && Math.abs(desvPct) >= umbralAlerta && (
                  <span className={`text-[9px] font-bold px-1 rounded ${desvPct >= umbralCritico ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {desvPct > 0 ? '↓' : '↑'}{Math.abs(desvPct).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>

            {/* Discrepancia de nivel — solo si es significativa (>15%) */}
            {nivelData?.discrepanciaPct != null && nivelData.discrepanciaPct > 15 && (
              <div className={`flex items-start gap-1.5 px-2.5 py-1.5 border-t text-[10px] ${
                nivelData.discrepanciaL > 0
                  ? 'border-orange-100 bg-orange-50/60 text-orange-700'
                  : 'border-sky-100 bg-sky-50/40 text-sky-700'
              }`}>
                <span className="shrink-0 mt-0.5">{nivelData.discrepanciaL > 0 ? '⚠' : 'ℹ'}</span>
                <span>
                  {nivelData.discrepanciaL > 0
                    ? <>Consumió <b>{nivelData.litrosConsumidos.toFixed(1)} L</b> pero cargó <b>{nivelData.litrosCargados.toFixed(1)} L</b> — diferencia de <b>+{nivelData.discrepanciaL.toFixed(1)} L</b> ({nivelData.discrepanciaPct.toFixed(0)}%)</>
                    : <>Cargó <b>{nivelData.litrosCargados.toFixed(1)} L</b> pero consumió <b>{nivelData.litrosConsumidos.toFixed(1)} L</b> — tanque no se llenó completo ({Math.abs(nivelData.discrepanciaL).toFixed(1)} L de margen)</>
                  }
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── ÚLTIMA CARGA ── */}
        <div className="flex items-center justify-between bg-slate-50 rounded-lg px-2.5 py-1.5 text-xs gap-2">
          <span className="text-slate-400 shrink-0">Última carga</span>
          {ultimaCarga ? (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <span className="text-slate-500 tabular-nums">{ultimaCarga.fecha}</span>
              <span className="font-semibold text-slate-700">{Number(ultimaCarga.litros || 0).toFixed(1)} L</span>
              {ultimaCarga.monto != null && <span className="text-slate-400">{formatMonto(ultimaCarga.monto)}</span>}
            </div>
          ) : <span className="text-slate-300">Sin registros</span>}
        </div>

        {/* ── VER DETALLES POR MES ── */}
        {monthlyStats.length > 1 && (
          <Button
            variant="outline" size="sm"
            className="w-full h-7 text-xs text-sky-600 border-sky-200 hover:bg-sky-50 dark:border-sky-800/50 dark:text-sky-400 dark:hover:bg-sky-900/20"
            onClick={() => setMesDetallesOpen(true)}
          >
            <Calendar className="w-3 h-3 mr-1.5" />
            Ver detalles por mes ({monthlyStats.length} meses)
          </Button>
        )}

        {/* ── DÍAS SIN ABASTECIMIENTO ── */}
        <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${diasStyle}`}>
          <span className="opacity-75">Sin abastecimiento</span>
          <span className="font-bold tabular-nums">
            {diasSinAbast != null ? `${diasSinAbast} días` : '—'}
          </span>
        </div>

      </CardContent>
    </Card>

    {/* ── MODAL DETALLES POR MES ── */}
    {mesDetallesOpen && (
      <Dialog open={mesDetallesOpen} onOpenChange={setMesDetallesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Consumo por mes — {consumidor.nombre}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white dark:bg-slate-900">
                <tr className="border-b border-slate-100 dark:border-slate-700 text-[11px] text-slate-400 uppercase tracking-wide">
                  <th className="text-left py-2 pr-3">Mes</th>
                  <th className="text-right py-2 pr-3">Cargas</th>
                  <th className="text-right py-2 pr-3">Litros</th>
                  <th className="text-right py-2 pr-3 hidden sm:table-cell">Monto</th>
                  {!esEquipoConsumidor && <th className="text-right py-2 pr-3 hidden md:table-cell">Odo. inicio</th>}
                  {!esEquipoConsumidor && <th className="text-right py-2 pr-3 hidden md:table-cell">Odo. fin</th>}
                  {!esEquipoConsumidor && <th className="text-right py-2 pr-3">Km rec.</th>}
                  {!esEquipoConsumidor && <th className="text-right py-2 pr-3">km/L</th>}
                  {!esEquipoConsumidor && monthlyStats.some(m => m.nivelCierre != null) && (
                    <th className="text-right py-2 text-sky-500" title="Litros físicos en el tanque al cierre del mes (dato registrado)">En tanque</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {monthlyStats.map(({ mes, cargas, litros, monto, odoInicioMes, odoFinMes, kmRecorridos, consumoReal, odoInconsistente, sinCierre, consumoAnomalo, nivelCierre, nivelCierreEsExacto, fillsSinConsumoReal }, rowIdx) => {
                  const esMesReciente = rowIdx === 0;
                  const pendienteIntermedio = sinCierre && !esMesReciente;
                  return (
                  <tr key={mes} className={
                    odoInconsistente ? 'bg-amber-50/60 dark:bg-amber-900/10'
                    : pendienteIntermedio ? 'bg-amber-50/40 dark:bg-amber-900/10'
                    : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                  }>
                    <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200 capitalize">
                      {new Date(mes + '-02').toLocaleDateString('es', { month: 'long', year: 'numeric' })}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{cargas}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-200">{litros.toFixed(1)} L</td>
                    <td className="py-2 pr-3 text-right text-slate-500 hidden sm:table-cell">{monto > 0 ? formatMonto(monto) : '—'}</td>
                    {!esEquipoConsumidor && (
                      <td className={`py-2 pr-3 text-right tabular-nums hidden md:table-cell ${odoInconsistente ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                        {odoInicioMes != null ? odoInicioMes.toLocaleString() : '—'}
                      </td>
                    )}
                    {!esEquipoConsumidor && (
                      <td className={`py-2 pr-3 text-right tabular-nums hidden md:table-cell ${odoInconsistente ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>
                        {odoFinMes != null ? odoFinMes.toLocaleString() : '—'}
                      </td>
                    )}
                    {!esEquipoConsumidor && (
                      <td className="py-2 pr-3 text-right tabular-nums text-sky-700 font-semibold">
                        {odoInconsistente
                          ? <span className="flex items-center justify-end gap-1 text-amber-600"><AlertTriangle className="w-3 h-3" />—</span>
                          : kmRecorridos != null ? kmRecorridos.toLocaleString() : '—'
                        }
                      </td>
                    )}
                    {!esEquipoConsumidor && (
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {consumoReal != null
                          ? consumoAnomalo
                            ? <span className="inline-flex items-center justify-end gap-1 text-red-500 font-semibold" title="Valor atípico: probable error de carga en odómetro o litros de un movimiento de este mes">
                                <AlertTriangle className="w-3 h-3" />{consumoReal.toFixed(0)}
                              </span>
                            : <span className="text-emerald-700">{consumoReal.toFixed(2)}</span>
                          : sinCierre
                            ? pendienteIntermedio
                              ? <span
                                  className="inline-flex items-center gap-1 text-amber-600 font-semibold cursor-help"
                                  title={
                                    `Mes intermedio sin km/L calculable.\n` +
                                    `${fillsSinConsumoReal.length} carga${fillsSinConsumoReal.length !== 1 ? 's' : ''} sin carga anterior con odómetro registrado:\n` +
                                    fillsSinConsumoReal.map(m => `  · ${m.fecha}  odo ${m.odometro?.toLocaleString()} km  ${m.litros?.toFixed(1)} L`).join('\n') +
                                    `\n\nCausa probable: la carga inmediatamente anterior a este mes no tiene odómetro registrado.\n` +
                                    `Solución: registre el odómetro en esa carga previa (Movimientos → Editar) y el km/L aparecerá automáticamente.`
                                  }
                                >
                                  <AlertTriangle className="w-3 h-3" />pend.
                                </span>
                              : <span className="inline-flex items-center gap-1 text-slate-400" title="Pendiente: el km/L se calculará cuando se registre la siguiente carga del vehículo (necesita el odómetro de cierre del tramo).">
                                  <Clock className="w-3 h-3" />pend.
                                </span>
                            : <span className="text-slate-300">—</span>
                        }
                      </td>
                    )}
                    {!esEquipoConsumidor && monthlyStats.some(m => m.nivelCierre != null) && (
                      <td className="py-2 text-right tabular-nums">
                        {nivelCierre != null ? (
                          <span
                            className={`font-semibold ${nivelCierreEsExacto ? 'text-sky-600' : 'text-sky-400'}`}
                            title={nivelCierreEsExacto
                              ? 'Dato exacto: nivel registrado al inicio de la siguiente carga'
                              : 'Estimado: nivel + litros de la última carga del mes (antes del consumo posterior)'}
                          >
                            {!nivelCierreEsExacto && '≈ '}{nivelCierre.toFixed(1)} L
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {monthlyStats.some(m => m.consumoAnomalo) && (
            <div className="mt-3 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Los meses con <strong>⚠</strong> tienen un km/L superior a 200, lo que es físicamente imposible para cualquier vehículo. Esto indica un error en los datos: litros casi nulos o un odómetro con salto incorrecto en algún movimiento de ese mes. Revisá los movimientos del mes marcado en el módulo de Movimientos.</span>
            </div>
          )}
          {monthlyStats.some((m, idx) => m.sinCierre && idx === 0) && (
            <div className="mt-3 flex items-start gap-2 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span><strong>pend.</strong> — el km/L del mes más reciente se calcula cuando se registre la siguiente carga del vehículo (necesita el odómetro de cierre del tramo). Es normal mientras no haya una carga posterior.</span>
            </div>
          )}
          {monthlyStats.some((m, idx) => m.sinCierre && idx > 0) && (
            <div className="mt-2 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                <strong>⚠ pend. en mes intermedio</strong> — hay cargas con odómetro pero el km/L no puede calcularse
                porque la carga inmediatamente anterior a ese mes no tiene odómetro registrado. <br />
                <strong>Cómo corregirlo:</strong> registre el odómetro en la carga anterior al mes marcado
                (en <em>Movimientos → Editar</em>); el km/L aparecerá automáticamente sin necesidad de tocar
                ningún otro registro. Pase el cursor sobre <strong>⚠ pend.</strong> en la fila para ver
                qué cargas específicas no tienen punto de partida.
              </span>
            </div>
          )}
          {monthlyStats.some(m => m.odoInconsistente) && (
            <div className="mt-2 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Los meses marcados en amarillo tienen una inconsistencia en el odómetro: el valor final registrado es menor al valor inicial del período, lo que impide calcular km recorridos. Esto suele deberse a un error de carga de datos. Revisá los registros de esos meses.</span>
            </div>
          )}
          {(() => {
            const totalLitros = monthlyStats.reduce((s, m) => s + m.litros, 0);
            const totalMonto  = monthlyStats.reduce((s, m) => s + m.monto, 0);
            const totalCargas = monthlyStats.reduce((s, m) => s + m.cargas, 0);
            const valsKml = monthlyStats.filter(m => m.consumoReal != null && !m.consumoAnomalo);
            const promKml = valsKml.length > 0 ? valsKml.reduce((s, m) => s + m.consumoReal, 0) / valsKml.length : null;
            return (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-slate-400 mb-0.5">Total litros</p>
                    <p className="font-bold text-slate-700 dark:text-slate-200">{totalLitros.toFixed(1)} L</p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-0.5">Total monto</p>
                    <p className="font-bold text-slate-700 dark:text-slate-200">{formatMonto(totalMonto)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 mb-0.5">Total cargas</p>
                    <p className="font-bold text-slate-700 dark:text-slate-200">{totalCargas}</p>
                  </div>
                  {!esEquipoConsumidor && (
                    <div>
                      <p className="text-slate-400 mb-0.5">km/L promedio</p>
                      <p className="font-bold text-emerald-700">{promKml != null ? promKml.toFixed(2) : '—'}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}

export default function ConsumidoresPorTipo({ consumidores, tiposConsumidor, movimientos, mesFiltro = 'ALL' }) {
  const hoy = new Date();
  const mesActual = hoy.toISOString().slice(0, 7);
  const periodo = mesFiltro === 'ALL' ? mesActual : mesFiltro;
  const consumidoresActivos = consumidores.filter(c => c.activo);

  const grupos = tiposConsumidor
    .filter(t => t.activo !== false)
    .map(tipo => ({
      tipo,
      items: consumidoresActivos.filter(c => c.tipo_consumidor_id === tipo.id),
    }))
    .filter(g => g.items.length > 0);

  const tipoIds = new Set(tiposConsumidor.map(t => t.id));
  const sinTipo = consumidoresActivos.filter(c => !tipoIds.has(c.tipo_consumidor_id));
  if (sinTipo.length > 0) {
    grupos.push({ tipo: { id: '__none', nombre: 'Sin clasificar' }, items: sinTipo });
  }

  // Todos los grupos abiertos por defecto
  const [openGroups, setOpenGroups] = useState(() => new Set(grupos.map(g => g.tipo.id)));
  const [tabByGroup, setTabByGroup] = useState({});
  const toggle = (id) => setOpenGroups(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  if (grupos.length === 0) {
    return <p className="text-sm text-slate-400">No hay consumidores activos registrados</p>;
  }

  return (
    <div className="space-y-2">
      {grupos.map(({ tipo, items }) => {
        const isOpen = openGroups.has(tipo.id);

        const comprasMes = movimientos.filter(m =>
          m.tipo === 'COMPRA' && m.fecha?.startsWith(periodo) &&
          items.some(c => c.id === m.consumidor_id)
        );
        const despachosMesRecibidos = movimientos.filter(m =>
          m.tipo === 'DESPACHO' && m.fecha?.startsWith(periodo) &&
          items.some(c => c.id === m.consumidor_id)
        );
        const litrosMes = comprasMes.reduce((s, m) => s + (m.litros || 0), 0)
                        + despachosMesRecibidos.reduce((s, m) => s + (m.litros || 0), 0);
        const gastoMes  = comprasMes.reduce((s, m) => s + (m.monto  || 0), 0);
        const kmMes     = comprasMes.reduce((s, m) => s + (m.km_recorridos || 0), 0);

        // Litros por combustible este mes (para el header colapsado)
        const litrosPorCombustible = {};
        [...comprasMes, ...despachosMesRecibidos].forEach(m => {
          const nombre = m.combustible_nombre;
          if (nombre) litrosPorCombustible[nombre] = (litrosPorCombustible[nombre] || 0) + (m.litros || 0);
        });

        // Tipos de combustible únicos en este grupo (para tabs)
        const combustiblesGrupo = [...new Set(items.map(c => c.combustible_nombre).filter(Boolean))].sort();
        const tabActual = tabByGroup[tipo.id] ?? 'all';
        const itemsFiltrados = tabActual === 'all' ? items : items.filter(c => c.combustible_nombre === tabActual);

        return (
          <div key={tipo.id} className="glass rounded-xl overflow-hidden">
            {/* ── Cabecera del grupo (clickable) ── */}
            <button
              onClick={() => toggle(tipo.id)}
              className="w-full flex items-center gap-3 px-4 py-3 glass-subtle hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              <span className="text-sm">{getIconForTipo(tipo.nombre)}</span>
              <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex-1 min-w-0 truncate">
                {tipo.nombre}
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 shrink-0">{items.length}</Badge>
              {/* Mini-stats siempre visibles */}
              <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 shrink-0 flex-wrap">
                {/* Etiqueta de período para que quede claro a qué mes corresponden las cifras */}
                {(litrosMes > 0 || gastoMes > 0 || kmMes > 0) && (
                  <span className="text-[10px] bg-slate-100 text-slate-400 rounded px-1.5 py-0.5 font-medium shrink-0">
                    {new Date(periodo + '-02').toLocaleDateString('es', { month: 'short', year: '2-digit' })}
                  </span>
                )}
                {Object.entries(litrosPorCombustible).map(([nombre, litros], i) => (
                  <span key={nombre} className="flex items-center gap-1">
                    {i > 0 && <span className="text-slate-300">·</span>}
                    <b className={fuelColor(nombre)}>{litros.toFixed(1)} L</b>
                    <span className="text-[10px]">{abbrFuel(nombre)}</span>
                  </span>
                ))}
                {Object.keys(litrosPorCombustible).length === 0 && litrosMes > 0 && (
                  <span><b className="text-slate-600">{litrosMes.toFixed(1)} L</b></span>
                )}
                {gastoMes > 0 && <span className="text-slate-300 ml-1">·</span>}
                {gastoMes > 0 && <span><b className="text-slate-600">{formatMonto(gastoMes)}</b></span>}
                {kmMes    > 0 && <span className="text-slate-300">·</span>}
                {kmMes    > 0 && <span><b className="text-slate-600">{kmMes.toLocaleString()} km</b></span>}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {/* ── Cards del grupo (colapsable) ── */}
            {isOpen && (
              <div className="bg-white/30 dark:bg-slate-900/20">
                {combustiblesGrupo.length > 1 && (
                  <div className="flex gap-0.5 flex-wrap border-b border-slate-200/70 dark:border-slate-700/50 px-3">
                    {[
                      { value: 'all', label: `Todos (${items.length})` },
                      ...combustiblesGrupo.map(n => ({ value: n, label: `${n} (${items.filter(c => c.combustible_nombre === n).length})` })),
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setTabByGroup(prev => ({ ...prev, [tipo.id]: value }))}
                        className={`px-2.5 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors ${
                          tabActual === value
                            ? 'border-sky-500 text-sky-700 dark:text-sky-400'
                            : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {itemsFiltrados.map(c => (
                    <ConsumidorCard key={c.id} consumidor={c} movimientos={movimientos} hoy={hoy} mesFiltro={mesFiltro} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
