import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Save, Loader2, Gauge } from 'lucide-react';
import { obtenerPrecioVigente, calcularSaldo, formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { calcularAuditoriaCompra, obtenerCapacidadTanque, AUDITORIA_ESTADO } from './auditoriaCombustible';

export default function NuevoMovimientoForm({ onSuccess }) {
  const queryClient = useQueryClient();

  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: tiposConsumidor = [] } = useQuery({ queryKey: ['tiposConsumidor'], queryFn: () => base44.entities.TipoConsumidor.list() });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: precios = [] } = useQuery({ queryKey: ['precios'], queryFn: () => base44.entities.PrecioCombustible.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 500) });

  // Keep legacy vehiculos for backward compat in DESPACHO origen
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: () => base44.entities.Vehiculo.list() });

  const [tipo, setTipo] = useState('COMPRA');
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    tarjeta_id: '',
    consumidor_id: '',
    consumidor_origen_id: '',
    combustible_id: '',
    litros: '',
    monto: '',
    odometro: '',
    referencia: '',
  });
  const [errors, setErrors] = useState({});
  const [filtroTipoConsumidor, setFiltroTipoConsumidor] = useState('all');

  const tarjetasActivas = tarjetas.filter(t => t.activa);
  const consumidoresActivos = consumidores.filter(c => c.activo);
  const combustiblesActivos = combustibles.filter(c => c.activa);

  const resolverCombustiblesConsumidor = (consumidor) => {
    if (!consumidor) return [];
    const ids = new Set();
    const nombres = new Set();
    if (consumidor.combustible_id) ids.add(consumidor.combustible_id);
    (consumidor.combustible_ids || []).forEach(id => ids.add(id));
    (consumidor.combustibles_admitidos || []).forEach(v => {
      if (typeof v === 'string') nombres.add(v.toLowerCase());
      else if (v?.id) ids.add(v.id);
    });
    (consumidor.datos_tanque?.combustibles_admitidos || []).forEach(v => {
      if (typeof v === 'string') nombres.add(v.toLowerCase());
      else if (v?.id) ids.add(v.id);
    });
    combustiblesActivos.forEach(c => {
      if (nombres.has((c.nombre || '').toLowerCase())) ids.add(c.id);
    });
    return [...ids];
  };

  const consumidoresFiltradosPorTipo = useMemo(() => {
    if (filtroTipoConsumidor === 'all') return consumidoresActivos;
    return consumidoresActivos.filter(c => c.tipo_consumidor_id === filtroTipoConsumidor);
  }, [consumidoresActivos, filtroTipoConsumidor]);

  const combustiblesPermitidosConsumidor = useMemo(() => {
    const consumidor = consumidores.find(c => c.id === form.consumidor_id);
    return resolverCombustiblesConsumidor(consumidor);
  }, [form.consumidor_id, consumidores, combustiblesActivos]);

  useEffect(() => {
    if (!form.consumidor_id) return;
    if (combustiblesPermitidosConsumidor.length === 1) {
      const unico = combustiblesPermitidosConsumidor[0];
      if (form.combustible_id !== unico) {
        setForm(f => ({ ...f, combustible_id: unico }));
      }
      return;
    }
    if (combustiblesPermitidosConsumidor.length > 1 && form.combustible_id && !combustiblesPermitidosConsumidor.includes(form.combustible_id)) {
      setForm(f => ({ ...f, combustible_id: '' }));
    }
  }, [form.consumidor_id, form.combustible_id, combustiblesPermitidosConsumidor]);

  // Consumidores que pueden ser origen de despacho (tanques y reservas)
  const consumidoresOrigen = consumidoresActivos.filter(c => {
    const tipo_nombre = c.tipo_consumidor_nombre?.toLowerCase() || '';
    return tipo_nombre.includes('tanque') || tipo_nombre.includes('reserva');
  });
  // Si no hay tanques configurados, mostrar todos
  const origenList = consumidoresOrigen.length > 0 ? consumidoresOrigen : consumidoresActivos;

  const tarjetaSeleccionada = tarjetas.find(t => t.id === form.tarjeta_id);
  const saldoTarjeta = tarjetaSeleccionada ? calcularSaldo(tarjetaSeleccionada, movimientos) : null;

  const precioVigente = useMemo(() => {
    if (!form.combustible_id || !form.fecha) return null;
    return obtenerPrecioVigente(precios, form.combustible_id, form.fecha);
  }, [form.combustible_id, form.fecha, precios]);

  const litrosCalculados = useMemo(() => {
    if (tipo !== 'COMPRA' || !precioVigente || !form.monto) return null;
    return parseFloat(form.monto) / precioVigente;
  }, [tipo, precioVigente, form.monto]);

  // Consumidor seleccionado y su tipo
  const consumidorSeleccionado = consumidores.find(c => c.id === form.consumidor_id);
  const tipoConsumidor = tiposConsumidor.find(t => t.id === consumidorSeleccionado?.tipo_consumidor_id);

  // Regla de odómetro por tipo de consumidor:
  // - Priorizar flag del catálogo (requiere_odometro) si existe.
  // - Fallback por nombre: reserva/tanque/equipo/almacén NO requieren.
  const consumidorRequiereOdometro = useMemo(() => {
    if (!consumidorSeleccionado) return false;
    const n = (consumidorSeleccionado.tipo_consumidor_nombre || '').toLowerCase();
    // Reserva/tanque/almacén siempre se tratan como almacenamiento global: sin odómetro.
    if (n.includes('reserva') || n.includes('tanque') || n.includes('equipo') || n.includes('almac')) return false;
    if (tipoConsumidor?.requiere_odometro != null) return !!tipoConsumidor.requiere_odometro;
    return true;
  }, [consumidorSeleccionado, tipoConsumidor]);

  const requiereOdometro = (tipo === 'COMPRA' || tipo === 'DESPACHO') && consumidorRequiereOdometro;

  // Obtener el último odómetro registrado para este consumidor (por odómetro más alto, que es más confiable)
  const ultimoMovConOdometro = useMemo(() => {
    if (!form.consumidor_id) return null;
    const movs = movimientos
      .filter(m => m.consumidor_id === form.consumidor_id && (m.tipo === 'COMPRA' || m.tipo === 'DESPACHO') && m.odometro != null)
      .sort((a, b) => b.odometro - a.odometro); // mayor odómetro = más reciente
    return movs.length > 0 ? movs[0] : null;
  }, [form.consumidor_id, movimientos]);

  const ultimoOdometro = ultimoMovConOdometro?.odometro ?? null;

  // Litros reales: si se ingresaron manualmente (COMPRA con litros) o calculados por precio
  const litrosReales = useMemo(() => {
    if (form.litros && parseFloat(form.litros) > 0) return parseFloat(form.litros);
    return litrosCalculados;
  }, [form.litros, litrosCalculados]);

  // Km recorridos y consumo real calculado
  const kmRecorridos = useMemo(() => {
    if (!form.odometro || ultimoOdometro == null) return null;
    const km = parseFloat(form.odometro) - ultimoOdometro;
    return km > 0 ? km : null;
  }, [form.odometro, ultimoOdometro]);

  const consumoRealCalculado = useMemo(() => {
    if (!kmRecorridos || !litrosReales || kmRecorridos <= 0 || litrosReales <= 0) return null;
    return kmRecorridos / litrosReales;
  }, [kmRecorridos, litrosReales]);

  // Índice de referencia del consumidor para detectar anomalías
  const consumoReferencia = consumidorSeleccionado?.datos_vehiculo?.indice_consumo_real
    || consumidorSeleccionado?.datos_vehiculo?.indice_consumo_fabricante
    || null;

  const anomaliaConsumo = useMemo(() => {
    if (!consumoRealCalculado || !consumoReferencia) return null;
    const desviacion = ((consumoReferencia - consumoRealCalculado) / consumoReferencia) * 100;
    const umbralAlerta = consumidorSeleccionado?.datos_vehiculo?.umbral_alerta_pct ?? 15;
    const umbralCritico = consumidorSeleccionado?.datos_vehiculo?.umbral_critico_pct ?? 30;
    if (desviacion >= umbralCritico) return { nivel: 'critico', desviacion };
    if (desviacion >= umbralAlerta) return { nivel: 'alerta', desviacion };
    return null;
  }, [consumoRealCalculado, consumoReferencia, consumidorSeleccionado]);

  const capacidadTanque = useMemo(
    () => obtenerCapacidadTanque(consumidorSeleccionado),
    [consumidorSeleccionado]
  );

  const auditoriaCompra = useMemo(() => {
    if (tipo !== 'COMPRA') return null;
    return calcularAuditoriaCompra({
      movimientos,
      consumidorId: form.consumidor_id,
      combustibleId: form.combustible_id,
      fecha: form.fecha,
      litrosAbastecidos: litrosReales,
      capacidadTanque,
    });
  }, [tipo, movimientos, form.consumidor_id, form.combustible_id, form.fecha, litrosReales, capacidadTanque]);

  // Stock de un consumidor origen (para DESPACHO)
  const calcularStockConsumidor = (consumidorId, combustibleId) => {
    if (!consumidorId || !combustibleId) return null;
    const con = consumidores.find(c => c.id === consumidorId);
    if (!con) return null;
    const combustibleCompatible = con.combustible_id ? con.combustible_id === combustibleId : true;
    const stockInicial = combustibleCompatible ? (Number(con.litros_iniciales) || 0) : 0;
    const entradas = movimientos
      .filter(m => m.tipo === 'COMPRA' && m.consumidor_id === consumidorId && m.combustible_id === combustibleId)
      .reduce((s, m) => s + (m.litros || 0), 0);
    const salidas = movimientos
      .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === consumidorId && m.combustible_id === combustibleId)
      .reduce((s, m) => s + (m.litros || 0), 0);
    return stockInicial + entradas - salidas;
  };

  const stockOrigenDespacho = useMemo(() => {
    if (tipo !== 'DESPACHO') return null;
    return calcularStockConsumidor(form.consumidor_origen_id, form.combustible_id);
  }, [tipo, form.consumidor_origen_id, form.combustible_id, movimientos, consumidores]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Movimiento.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      toast.success('Movimiento registrado correctamente');
      onSuccess?.();
    },
  });

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.fecha) e.fecha = 'Requerido';
    if (tipo === 'COMPRA') {
      if (!form.tarjeta_id) e.tarjeta_id = 'Seleccione tarjeta';
      if (!form.consumidor_id) e.consumidor_id = 'Seleccione consumidor';
      if (!form.combustible_id) e.combustible_id = 'Seleccione combustible';
      if (!form.monto || parseFloat(form.monto) <= 0) e.monto = 'Monto > 0';
      if (!precioVigente) e.combustible_id = 'Sin precio vigente para esta fecha';
      if (saldoTarjeta != null && parseFloat(form.monto) > 0 && parseFloat(form.monto) > saldoTarjeta) {
        e.monto = `Saldo insuficiente. Disponible: ${formatMonto(saldoTarjeta)}`;
      }
      if (requiereOdometro) {
        if (!form.odometro || parseFloat(form.odometro) <= 0) {
          e.odometro = 'El odómetro actual es obligatorio';
        } else if (ultimoOdometro != null && parseFloat(form.odometro) <= ultimoOdometro) {
          e.odometro = `Debe ser mayor al registro anterior: ${ultimoOdometro.toLocaleString()} km`;
        }
      }
      if (auditoriaCompra?.estado === AUDITORIA_ESTADO.EXCESO && capacidadTanque != null) {
        e.monto = `Excede capacidad de tanque (${capacidadTanque.toFixed(2)} L) según estimación.`;
      }
    } else if (tipo === 'RECARGA') {
      if (!form.tarjeta_id) e.tarjeta_id = 'Seleccione tarjeta';
      if (!form.monto || parseFloat(form.monto) <= 0) e.monto = 'Monto > 0';
    } else if (tipo === 'DESPACHO') {
      if (!form.consumidor_origen_id) e.consumidor_origen_id = 'Seleccione origen (reserva)';
      if (!form.consumidor_id) e.consumidor_id = 'Seleccione consumidor destino';
      if (!form.combustible_id) e.combustible_id = 'Seleccione combustible';
      if (!form.litros || parseFloat(form.litros) <= 0) e.litros = 'Litros > 0';
      if (requiereOdometro) {
        if (!form.odometro || parseFloat(form.odometro) <= 0) {
          e.odometro = 'El odómetro actual es obligatorio para este consumidor';
        } else if (ultimoOdometro != null && parseFloat(form.odometro) <= ultimoOdometro) {
          e.odometro = `Debe ser mayor al registro anterior: ${ultimoOdometro.toLocaleString()} km`;
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const tarjeta = tarjetas.find(t => t.id === form.tarjeta_id);
    const consumidor = consumidores.find(c => c.id === form.consumidor_id);
    const consumidorOrigen = consumidores.find(c => c.id === form.consumidor_origen_id);
    const combustible = combustibles.find(c => c.id === form.combustible_id);

    let data = { fecha: form.fecha, tipo };

    if (tipo === 'COMPRA') {
      data.tarjeta_id = tarjeta.id;
      data.tarjeta_alias = tarjeta.alias || tarjeta.id_tarjeta;
      data.monto = parseFloat(form.monto);
      data.consumidor_id = consumidor.id;
      data.consumidor_nombre = consumidor.nombre;
      // legado para compatibilidad
      data.vehiculo_chapa = consumidor.codigo_interno || consumidor.nombre;
      data.vehiculo_alias = consumidor.nombre;
      data.combustible_id = combustible.id;
      data.combustible_nombre = combustible.nombre;
      data.precio = precioVigente;
      data.litros = litrosCalculados;
      data.remanente_estimado_antes = auditoriaCompra?.remanenteAntes ?? null;
      data.combustible_estimado_post = auditoriaCompra?.combustibleEstimadoPost ?? null;
      data.capacidad_tanque = capacidadTanque;
      data.auditoria_combustible_estado = auditoriaCompra?.estado || AUDITORIA_ESTADO.SIN_ESTIMACION;
      if (form.odometro) data.odometro = parseFloat(form.odometro);
      if (ultimoOdometro != null) data.odometro_anterior = ultimoOdometro;
      if (kmRecorridos != null && requiereOdometro) data.km_recorridos = kmRecorridos;
      if (consumoRealCalculado != null && requiereOdometro) data.consumo_real = consumoRealCalculado;
    } else if (tipo === 'RECARGA') {
      data.tarjeta_id = tarjeta.id;
      data.tarjeta_alias = tarjeta.alias || tarjeta.id_tarjeta;
      data.monto = parseFloat(form.monto);
      data.referencia = form.referencia;
    } else if (tipo === 'DESPACHO') {
      data.consumidor_origen_id = consumidorOrigen.id;
      data.consumidor_origen_nombre = consumidorOrigen.nombre;
      data.vehiculo_origen_chapa = consumidorOrigen.codigo_interno || consumidorOrigen.nombre;
      data.vehiculo_origen_alias = consumidorOrigen.nombre;
      data.consumidor_id = consumidor.id;
      data.consumidor_nombre = consumidor.nombre;
      data.vehiculo_chapa = consumidor.codigo_interno || consumidor.nombre;
      data.vehiculo_alias = consumidor.nombre;
      data.combustible_id = combustible.id;
      data.combustible_nombre = combustible.nombre;
      data.litros = parseFloat(form.litros);
      if (form.odometro) data.odometro = parseFloat(form.odometro);
      data.referencia = form.referencia;
    }
    createMutation.mutate(data);
  };

  return (
    <div className="space-y-4">
      <Tabs value={tipo} onValueChange={v => { setTipo(v); setErrors({}); }}>
        <TabsList className="w-full grid grid-cols-3 h-11">
          <TabsTrigger value="RECARGA" className="gap-1.5 text-xs data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700">
            <ArrowUpCircle className="w-3.5 h-3.5" /> Recarga
          </TabsTrigger>
          <TabsTrigger value="COMPRA" className="gap-1.5 text-xs data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">
            <ArrowDownCircle className="w-3.5 h-3.5" /> Compra
          </TabsTrigger>
          <TabsTrigger value="DESPACHO" className="gap-1.5 text-xs data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Despacho
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {/* Fecha */}
        <div>
          <Label className="text-xs text-slate-500">Fecha</Label>
          <Input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className="mt-1" />
          {errors.fecha && <p className="text-xs text-red-500 mt-1">{errors.fecha}</p>}
        </div>

        {/* Tarjeta - RECARGA y COMPRA */}
        {(tipo === 'RECARGA' || tipo === 'COMPRA') && (
          <div>
            <Label className="text-xs text-slate-500">Tarjeta</Label>
            <Select value={form.tarjeta_id} onValueChange={v => set('tarjeta_id', v)}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar tarjeta" /></SelectTrigger>
              <SelectContent>
                {tarjetasActivas.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.alias || t.id_tarjeta} ({t.moneda})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.tarjeta_id && <p className="text-xs text-red-500 mt-1">{errors.tarjeta_id}</p>}
            {saldoTarjeta != null && (
              <p className={`text-xs mt-1 ${saldoTarjeta <= 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                Saldo actual: {formatMonto(saldoTarjeta, tarjetaSeleccionada?.moneda)}
              </p>
            )}
            {tipo === 'COMPRA' && saldoTarjeta != null && saldoTarjeta <= 0 && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-1">
                <span className="font-semibold">⚠ Tarjeta sin saldo. Recargue antes de registrar compras.</span>
              </div>
            )}
          </div>
        )}

        {/* COMPRA */}
        {tipo === 'COMPRA' && (
          <>
            <div>
              <Label className="text-xs text-slate-500">Tipo de consumidor</Label>
              <Select value={filtroTipoConsumidor} onValueChange={setFiltroTipoConsumidor}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Filtrar tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {tiposConsumidor.filter(t => t.activo !== false).map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Consumidor</Label>
              <Select value={form.consumidor_id} onValueChange={v => set('consumidor_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar consumidor" /></SelectTrigger>
                <SelectContent>
                  {consumidoresFiltradosPorTipo.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}{c.tipo_consumidor_nombre ? ` (${c.tipo_consumidor_nombre})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.consumidor_id && <p className="text-xs text-red-500 mt-1">{errors.consumidor_id}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Combustible</Label>
              <Select
                value={form.combustible_id}
                onValueChange={v => set('combustible_id', v)}
                disabled={combustiblesPermitidosConsumidor.length === 1}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar combustible" /></SelectTrigger>
                <SelectContent>
                  {(combustiblesPermitidosConsumidor.length > 0
                    ? combustiblesActivos.filter(c => combustiblesPermitidosConsumidor.includes(c.id))
                    : combustiblesActivos
                  ).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.combustible_id && <p className="text-xs text-red-500 mt-1">{errors.combustible_id}</p>}
              {precioVigente != null && <p className="text-xs text-slate-400 mt-1">Precio vigente: {formatMonto(precioVigente)}/L</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Monto</Label>
              <Input type="number" step="0.01" min="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0.00" className="mt-1" />
              {errors.monto && <p className="text-xs text-red-500 mt-1">{errors.monto}</p>}
            </div>
            <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center">
              <span className="text-sm text-slate-500">Litros equivalentes</span>
              <span className="text-lg font-bold text-slate-800">{litrosCalculados != null ? `${litrosCalculados.toFixed(2)} L` : '—'}</span>
            </div>
            {auditoriaCompra && (
              <div className={`rounded-xl p-3 border text-xs space-y-1 ${
                auditoriaCompra.estado === AUDITORIA_ESTADO.EXCESO
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <p>Remanente estimado antes: <b>{auditoriaCompra.remanenteAntes != null ? `${auditoriaCompra.remanenteAntes.toFixed(2)} L` : 'No disponible'}</b></p>
                <p>Combustible estimado post-abastecimiento: <b>{auditoriaCompra.combustibleEstimadoPost != null ? `${auditoriaCompra.combustibleEstimadoPost.toFixed(2)} L` : 'No disponible'}</b></p>
                <p>Capacidad de tanque: <b>{capacidadTanque != null ? `${capacidadTanque.toFixed(2)} L` : 'No registrada'}</b></p>
                {auditoriaCompra.estado === AUDITORIA_ESTADO.EXCESO && capacidadTanque != null && (
                  <p className="font-semibold">⚠ Inconsistencia: el estimado supera la capacidad del tanque.</p>
                )}
              </div>
            )}

            {/* Odómetro - requerido solo para tipos que lo necesitan */}
            <div className={`border rounded-xl p-3 space-y-2 ${errors.odometro ? 'border-red-200 bg-red-50/30' : 'border-sky-100 bg-sky-50/40'}`}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700">
                <Gauge className="w-3.5 h-3.5" />
                Odómetro actual {requiereOdometro && <span className="text-red-400">*</span>}
                {ultimoOdometro != null && (
                  <span className="font-normal text-slate-400 ml-auto">Anterior: {ultimoOdometro.toLocaleString()} km</span>
                )}
              </div>
              <Input
                type="number"
                min={ultimoOdometro != null ? ultimoOdometro + 1 : 0}
                step="1"
                value={form.odometro}
                onChange={e => set('odometro', e.target.value)}
                placeholder="Lectura actual (km)"
                className={errors.odometro ? 'border-red-300 focus-visible:ring-red-300' : ''}
              />
              {!requiereOdometro && (
                <p className="text-[11px] text-slate-400">No obligatorio para el tipo de consumidor seleccionado.</p>
              )}
              {errors.odometro && <p className="text-xs text-red-500">{errors.odometro}</p>}
              {kmRecorridos != null && (
                <div className="flex justify-between text-xs text-slate-500 pt-1 flex-wrap gap-1">
                  <span>Km recorridos: <b className="text-slate-700">{kmRecorridos.toFixed(0)} km</b></span>
                  {consumoRealCalculado != null && (
                    <span>Consumo real: <b className="text-sky-700">{consumoRealCalculado.toFixed(2)} km/L</b></span>
                  )}
                </div>
              )}
              {/* Alerta de anomalía de consumo */}
              {anomaliaConsumo && (
                <div className={`flex items-start gap-1.5 text-xs rounded-lg px-2.5 py-2 mt-1 ${
                  anomaliaConsumo.nivel === 'critico'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  <span className="mt-0.5">⚠</span>
                  <span>
                    <b>{anomaliaConsumo.nivel === 'critico' ? 'Consumo crítico' : 'Consumo alto'}:</b>{' '}
                    {consumoRealCalculado.toFixed(2)} km/L vs referencia {consumoReferencia.toFixed(2)} km/L
                    {' '}({anomaliaConsumo.desviacion.toFixed(0)}% de desviación)
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* RECARGA */}
        {tipo === 'RECARGA' && (
          <>
            <div>
              <Label className="text-xs text-slate-500">Monto</Label>
              <Input type="number" step="0.01" min="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0.00" className="mt-1" />
              {errors.monto && <p className="text-xs text-red-500 mt-1">{errors.monto}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Referencia (opcional)</Label>
              <Input value={form.referencia} onChange={e => set('referencia', e.target.value)} placeholder="Factura, nota..." className="mt-1" />
            </div>
          </>
        )}

        {/* DESPACHO */}
        {tipo === 'DESPACHO' && (
          <>
            <div>
              <Label className="text-xs text-slate-500">Origen (Reserva / Tanque)</Label>
              <Select value={form.consumidor_origen_id} onValueChange={v => set('consumidor_origen_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar origen" /></SelectTrigger>
                <SelectContent>
                  {origenList.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.consumidor_origen_id && <p className="text-xs text-red-500 mt-1">{errors.consumidor_origen_id}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Tipo de consumidor</Label>
              <Select value={filtroTipoConsumidor} onValueChange={setFiltroTipoConsumidor}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Filtrar tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {tiposConsumidor.filter(t => t.activo !== false).map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Destino (Consumidor)</Label>
              <Select value={form.consumidor_id} onValueChange={v => set('consumidor_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar destino" /></SelectTrigger>
                <SelectContent>
                  {consumidoresFiltradosPorTipo.filter(c => c.id !== form.consumidor_origen_id).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.consumidor_id && <p className="text-xs text-red-500 mt-1">{errors.consumidor_id}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Combustible</Label>
              <Select
                value={form.combustible_id}
                onValueChange={v => set('combustible_id', v)}
                disabled={combustiblesPermitidosConsumidor.length === 1}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar combustible" /></SelectTrigger>
                <SelectContent>
                  {(combustiblesPermitidosConsumidor.length > 0
                    ? combustiblesActivos.filter(c => combustiblesPermitidosConsumidor.includes(c.id))
                    : combustiblesActivos
                  ).map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.combustible_id && <p className="text-xs text-red-500 mt-1">{errors.combustible_id}</p>}
            </div>
            {stockOrigenDespacho != null && (
              <div className="bg-purple-50 rounded-xl p-3 flex justify-between items-center">
                <span className="text-sm text-purple-600">Stock en origen</span>
                <span className="font-semibold text-purple-800">{stockOrigenDespacho.toFixed(2)} L</span>
              </div>
            )}
            <div>
              <Label className="text-xs text-slate-500">Litros a despachar</Label>
              <Input type="number" step="0.01" min="0.01" value={form.litros} onChange={e => set('litros', e.target.value)} placeholder="0.00" className="mt-1" />
              {errors.litros && <p className="text-xs text-red-500 mt-1">{errors.litros}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Referencia (opcional)</Label>
              <Input value={form.referencia} onChange={e => set('referencia', e.target.value)} placeholder="Nota..." className="mt-1" />
            </div>
            <div className={`border rounded-xl p-3 space-y-2 ${errors.odometro ? 'border-red-200 bg-red-50/30' : 'border-purple-100 bg-purple-50/40'}`}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700">
                <Gauge className="w-3.5 h-3.5" />
                Odómetro despacho {requiereOdometro && <span className="text-red-400">*</span>}
                {ultimoOdometro != null && (
                  <span className="font-normal text-slate-400 ml-auto">Anterior: {ultimoOdometro.toLocaleString()} km</span>
                )}
              </div>
              <Input
                type="number"
                min={ultimoOdometro != null ? ultimoOdometro + 1 : 0}
                step="1"
                value={form.odometro}
                onChange={e => set('odometro', e.target.value)}
                placeholder="Lectura actual (km)"
                className={errors.odometro ? 'border-red-300 focus-visible:ring-red-300' : ''}
              />
              {!requiereOdometro && (
                <p className="text-[11px] text-slate-400">No obligatorio para reserva/tanque/equipo.</p>
              )}
              {errors.odometro && <p className="text-xs text-red-500">{errors.odometro}</p>}
            </div>
          </>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={createMutation.isPending}
        className={`w-full h-11 text-sm font-semibold rounded-xl ${
          tipo === 'RECARGA'
            ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700'
            : tipo === 'COMPRA'
            ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700'
            : 'bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700'
        }`}
      >
        {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        Guardar {tipo === 'RECARGA' ? 'Recarga' : tipo === 'COMPRA' ? 'Compra' : 'Despacho'}
      </Button>
    </div>
  );
}
