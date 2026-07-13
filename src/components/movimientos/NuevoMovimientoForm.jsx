import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowLeftRight, Warehouse, Save, Loader2, Gauge, Satellite, Paperclip, X, Tag } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { obtenerPrecioVigente, formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { calcularAuditoriaCompra, obtenerCapacidadTanque, AUDITORIA_ESTADO } from './auditoriaCombustible';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { gpsApi, metersToKm } from '@/api/gpsClient';

export default function NuevoMovimientoForm({ onSuccess }) {
  const queryClient = useQueryClient();
  const { canRecargar, canDepositar, canComprar, canDespachar, canVerPrecios } = useUserRole();

  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });
  const { data: tiposConsumidor = [] } = useQuery({ queryKey: ['tiposConsumidor'], queryFn: () => base44.entities.TipoConsumidor.list() });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: precios = [] } = useQuery({ queryKey: ['precios'], queryFn: () => base44.entities.PrecioCombustible.list() });
  const { data: preciosDespacho = [] } = useQuery({ queryKey: ['precios-despacho'], queryFn: () => base44.entities.PrecioDespachoTipo.list('-fecha_desde', 200) });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-fecha', 5000), staleTime: 5 * 60_000 });

  // Tipos de movimiento que el rol actual puede registrar
  const tiposPermitidos = useMemo(() => {
    const all = [
      { value: 'COMPRA',   label: 'Compra',   Icon: ArrowDownCircle, activeClass: 'data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700' },
      { value: 'DESPACHO', label: 'Despacho', Icon: ArrowLeftRight,  activeClass: 'data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700' },
      { value: 'DEPOSITO', label: 'Depósito', Icon: Warehouse,       activeClass: 'data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700' },
    ];
    return all.filter(t => {
      if (t.value === 'COMPRA')   return canComprar;
      if (t.value === 'DESPACHO') return canDespachar;
      if (t.value === 'DEPOSITO') return canDepositar;
      return false;
    });
  }, [canComprar, canDespachar, canDepositar]);

  const [tipo, setTipo] = useState('COMPRA');

  // Ajustar tipo si el rol cargado no lo permite (ej. economico no puede COMPRA)
  useEffect(() => {
    if (tiposPermitidos.length > 0 && !tiposPermitidos.find(t => t.value === tipo)) {
      setTipo(tiposPermitidos[0].value);
    }
  }, [tiposPermitidos]);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    tarjeta_id: '',
    consumidor_id: '',
    consumidor_origen_id: '',
    combustible_id: '',
    litros: '',
    monto: '',
    odometro: '',
    horas_uso: '',
    nivel_tanque: '',
    referencia: '',
    precio_costo_unitario: '',
  });
  const [errors, setErrors] = useState({});
  const [filtroTipoConsumidor, setFiltroTipoConsumidor] = useState('all');
  const [adjuntoFile, setAdjuntoFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [gpsOdoLoading, setGpsOdoLoading] = useState(false);

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

  // Helpers de categoría con fallback por keyword para datos pre-migración
  const esDeposito = (c) => {
    if (c.categoria) return c.categoria === 'deposito';
    const n = (c.tipo_consumidor_nombre || '').toLowerCase();
    return n.includes('tanque') || n.includes('reserva');
  };
  const esSurtidor = (c) => {
    if (c.categoria) return c.categoria === 'surtidor';
    return (c.tipo_consumidor_nombre || '').toLowerCase().includes('surtidor');
  };

  // COMPRA: todos los consumidores activos (incluyendo depósitos que también se abastecen)
  const consumidoresParaCompra = consumidoresFiltradosPorTipo;
  // DESPACHO destino: consumidores reales + surtidores (isotanque → Cupet es un despacho válido)
  const consumidoresParaDespachoDestino = useMemo(() =>
    consumidoresFiltradosPorTipo.filter(c => !esDeposito(c)),
  [consumidoresFiltradosPorTipo]);

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

  // Origen de DESPACHO: depósitos internos + surtidores externos
  const consumidoresOrigen = consumidoresActivos.filter(c => esDeposito(c) || esSurtidor(c));
  // Si no hay configurados aún, mostrar todos (período de transición)
  const origenList = consumidoresOrigen.length > 0 ? consumidoresOrigen : consumidoresActivos;

  // Depósitos y surtidores (ambos pueden recibir combustible de cisterna/proveedor o isotanque)
  const depositos = consumidoresActivos.filter(c => esDeposito(c));
  const depositosYSurtidores = consumidoresActivos.filter(c => esDeposito(c) || esSurtidor(c));

  const tarjetaSeleccionada = tarjetas.find(t => t.id === form.tarjeta_id);

  const precioVigente = useMemo(() => {
    if (!form.combustible_id || !form.fecha) return null;
    return obtenerPrecioVigente(precios, form.combustible_id, form.fecha);
  }, [form.combustible_id, form.fecha, precios]);

  const montoCalculado = useMemo(() => {
    if (tipo !== 'COMPRA' || !precioVigente || !form.litros) return null;
    return parseFloat(form.litros) * precioVigente;
  }, [tipo, precioVigente, form.litros]);

  // Consumidor seleccionado y su tipo
  const consumidorSeleccionado = consumidores.find(c => c.id === form.consumidor_id);
  const tipoConsumidor = tiposConsumidor.find(t => t.id === consumidorSeleccionado?.tipo_consumidor_id);

  // Precio de despacho vigente para el tipo de consumidor seleccionado
  const precioDespachoVigente = useMemo(() => {
    if (tipo !== 'DESPACHO' || !consumidorSeleccionado || preciosDespacho.length === 0) return null;
    const tcId   = consumidorSeleccionado.tipo_consumidor_id;
    const fecha  = form.fecha || new Date().toISOString().slice(0, 10);
    const combId = form.combustible_id || null;
    const candidatos = preciosDespacho
      .filter(p => p.tipo_consumidor_id === tcId && p.fecha_desde <= fecha)
      .sort((a, b) => b.fecha_desde.localeCompare(a.fecha_desde));
    return candidatos.find(p => p.combustible_id === combId)
        ?? candidatos.find(p => !p.combustible_id)
        ?? null;
  }, [tipo, consumidorSeleccionado, form.fecha, form.combustible_id, preciosDespacho]);

  const montoDespachoCalculado = useMemo(() => {
    if (!precioDespachoVigente || !form.litros) return null;
    return parseFloat(form.litros) * precioDespachoVigente.precio_por_litro;
  }, [precioDespachoVigente, form.litros]);

  // Flag por consumidor individual: vehículos sin control de km/odómetro
  const consumidorSinOdometro = !!consumidorSeleccionado?.datos_vehiculo?.sin_odometro;

  // Regla de odómetro: depósitos y surtidores nunca requieren; equipos usan horas; vehículos sí.
  const consumidorRequiereOdometro = useMemo(() => {
    if (!consumidorSeleccionado) return false;
    if (consumidorSinOdometro) return false;
    if (esDeposito(consumidorSeleccionado) || esSurtidor(consumidorSeleccionado)) return false;
    const n = (consumidorSeleccionado.tipo_consumidor_nombre || '').toLowerCase();
    if (n.includes('equipo') || n.includes('almac')) return false;
    if (tipoConsumidor?.requiere_odometro != null) return !!tipoConsumidor.requiere_odometro;
    return true;
  }, [consumidorSeleccionado, tipoConsumidor, consumidorSinOdometro]);

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

  const consumidorEsEquipo = useMemo(() => {
    const n = (consumidorSeleccionado?.tipo_consumidor_nombre || '').toLowerCase();
    return n.includes('equipo') || n.includes('planta') || n.includes('generador') || n.includes('grupo');
  }, [consumidorSeleccionado]);

  const consumidorEsTanque = useMemo(() =>
    consumidorSeleccionado ? esDeposito(consumidorSeleccionado) : false,
  [consumidorSeleccionado]);

  const consumidorEsSurtidorDestino = useMemo(() =>
    consumidorSeleccionado ? esSurtidor(consumidorSeleccionado) : false,
  [consumidorSeleccionado]);

  const ultimasHorasEquipo = useMemo(() => {
    if (!form.consumidor_id || !consumidorEsEquipo) return null;
    const movs = movimientos
      .filter(m => m.consumidor_id === form.consumidor_id && m.horas_uso != null)
      .sort((a, b) => b.horas_uso - a.horas_uso);
    return movs.length > 0 ? movs[0].horas_uso : null;
  }, [form.consumidor_id, movimientos, consumidorEsEquipo]);

  const litrosReales = useMemo(() => {
    if (!form.litros || parseFloat(form.litros) <= 0) return null;
    return parseFloat(form.litros);
  }, [form.litros]);

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
      litrosIniciales: consumidorSeleccionado?.litros_iniciales ?? 0,
      nivelTanqueActual: form.nivel_tanque !== '' ? parseFloat(form.nivel_tanque) : undefined,
    });
  }, [tipo, movimientos, form.consumidor_id, form.combustible_id, form.fecha, litrosReales, capacidadTanque, consumidorSeleccionado, form.nivel_tanque]);

  // Stock de un consumidor origen (para DESPACHO)
  const calcularStockConsumidor = (consumidorId, combustibleId) => {
    if (!consumidorId || !combustibleId) return null;
    const con = consumidores.find(c => c.id === consumidorId);
    if (!con) return null;
    const combustibleCompatible = con.combustible_id ? con.combustible_id === combustibleId : true;
    const stockInicial = combustibleCompatible ? (Number(con.litros_iniciales) || 0) : 0;
    const esSurtidorOrigen = esSurtidor(con);
    // Entradas por COMPRA directa al origen
    const entradasCompra = movimientos
      .filter(m => m.tipo === 'COMPRA' && m.consumidor_id === consumidorId && m.combustible_id === combustibleId)
      .reduce((s, m) => s + (m.litros || 0), 0);
    // Para surtidores: también cuentan los DESPACHO que recibió desde los tanques
    const entradasDespacho = esSurtidorOrigen
      ? movimientos
          .filter(m => m.tipo === 'DESPACHO' && m.consumidor_id === consumidorId && m.combustible_id === combustibleId)
          .reduce((s, m) => s + (m.litros || 0), 0)
      : 0;
    const salidas = movimientos
      .filter(m => m.tipo === 'DESPACHO' && m.consumidor_origen_id === consumidorId && m.combustible_id === combustibleId)
      .reduce((s, m) => s + (m.litros || 0), 0);
    // Para surtidores: los vehículos retiran con COMPRA usando la tarjeta vinculada
    const tarjetaVinculadaId = con.datos_tanque?.tarjeta_vinculada_id;
    const salidasTarjeta = (esSurtidorOrigen && tarjetaVinculadaId)
      ? movimientos
          .filter(m => m.tipo === 'COMPRA' && m.tarjeta_id === tarjetaVinculadaId)
          .reduce((s, m) => s + (m.litros || 0), 0)
      : 0;
    return stockInicial + entradasCompra + entradasDespacho - salidas - salidasTarjeta;
  };

  const stockOrigenDespacho = useMemo(() => {
    if (tipo !== 'DESPACHO') return null;
    return calcularStockConsumidor(form.consumidor_origen_id, form.combustible_id);
  }, [tipo, form.consumidor_origen_id, form.combustible_id, movimientos, consumidores]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Movimiento.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
      queryClient.invalidateQueries({ queryKey: ['v-stock-tanques'] });
      toast.success('Movimiento registrado correctamente');
      setAdjuntoFile(null);
      onSuccess?.();
    },
    onError: (error) => {
      const msg = (error?.message || '').toLowerCase();
      console.error('[movimiento:create]', error);
      if (msg.includes('permission') || msg.includes('denied') || msg.includes('policy')) {
        toast.error('Sin permiso para esta operación');
      } else if (msg.includes('duplicate') || msg.includes('unique')) {
        toast.error('El registro ya existe');
      } else {
        toast.error(`Error: ${error?.message || error?.details || 'desconocido'}`, { duration: 8000 });
      }
    },
  });

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };

  const fetchGpsOdometer = async () => {
    if (!consumidorSeleccionado?.gps_device_id) return;
    setGpsOdoLoading(true);
    try {
      const positions = await gpsApi.position(consumidorSeleccionado.gps_device_id);
      if (positions?.length > 0) {
        const km = metersToKm(positions[0].attributes?.totalDistance ?? 0);
        if (km > 0) {
          set('odometro', String(km));
          toast.success(`Odómetro GPS: ${km.toLocaleString()} km`);
        } else {
          toast.warning('El GPS no reporta odómetro para este vehículo');
        }
      } else {
        toast.warning('Sin posición GPS disponible para este vehículo');
      }
    } catch (err) {
      toast.error(`GPS: ${err.message}`);
    } finally {
      setGpsOdoLoading(false);
    }
  };

  const validate = () => {
    const e = {};
    if (!form.fecha) e.fecha = 'Requerido';
    if (tipo === 'COMPRA') {
      if (!form.tarjeta_id) e.tarjeta_id = 'Seleccione tarjeta';
      if (!form.consumidor_id) e.consumidor_id = 'Seleccione consumidor';
      if (!form.combustible_id) e.combustible_id = 'Seleccione combustible';
      const litrosCompra = parseFloat(form.litros);
      if (!form.litros || isNaN(litrosCompra) || !isFinite(litrosCompra) || litrosCompra <= 0) e.litros = 'Litros debe ser mayor a 0';
      else if (litrosCompra > 50000) e.litros = 'Valor excede el máximo permitido (50 000 L)';
      if (!precioVigente) e.combustible_id = 'Sin precio vigente para esta fecha';
      if (requiereOdometro) {
        if (form.odometro === '' || form.odometro === null || form.odometro === undefined) {
          e.odometro = 'El odómetro actual es obligatorio';
        } else if (parseFloat(form.odometro) < 0) {
          e.odometro = 'El odómetro no puede ser negativo';
        } else if (ultimoOdometro != null && parseFloat(form.odometro) <= ultimoOdometro) {
          e.odometro = `Debe ser mayor al registro anterior: ${ultimoOdometro.toLocaleString()} km`;
        }
      }
    } else if (tipo === 'DEPOSITO') {
      if (!form.consumidor_id) e.consumidor_id = 'Seleccione el depósito destino';
      if (!form.combustible_id) e.combustible_id = 'Seleccione combustible';
      const litrosDeposito = parseFloat(form.litros);
      if (!form.litros || isNaN(litrosDeposito) || !isFinite(litrosDeposito) || litrosDeposito <= 0) e.litros = 'Litros debe ser mayor a 0';
    } else if (tipo === 'DESPACHO') {
      if (!form.consumidor_origen_id) e.consumidor_origen_id = 'Seleccione origen (reserva)';
      if (!form.consumidor_id) e.consumidor_id = 'Seleccione consumidor destino';
      if (!form.combustible_id) e.combustible_id = 'Seleccione combustible';
      const litrosDespacho = parseFloat(form.litros);
      if (!form.litros || isNaN(litrosDespacho) || !isFinite(litrosDespacho) || litrosDespacho <= 0) e.litros = 'Litros debe ser mayor a 0';
      else if (litrosDespacho > 50000) e.litros = 'Valor excede el máximo permitido (50 000 L)';
      if (requiereOdometro) {
        if (form.odometro === '' || form.odometro === null || form.odometro === undefined) {
          e.odometro = 'El odómetro actual es obligatorio para este consumidor';
        } else if (parseFloat(form.odometro) < 0) {
          e.odometro = 'El odómetro no puede ser negativo';
        } else if (ultimoOdometro != null && parseFloat(form.odometro) <= ultimoOdometro) {
          e.odometro = `Debe ser mayor al registro anterior: ${ultimoOdometro.toLocaleString()} km`;
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const tarjeta = tarjetas.find(t => t.id === form.tarjeta_id);
    const consumidor = consumidores.find(c => c.id === form.consumidor_id);
    const consumidorOrigen = consumidores.find(c => c.id === form.consumidor_origen_id);
    const combustible = combustibles.find(c => c.id === form.combustible_id);

    let data = { fecha: form.fecha, tipo };

    if (tipo === 'COMPRA') {
      data.tarjeta_id = tarjeta.id;
      data.tarjeta_alias = tarjeta.alias || tarjeta.id_tarjeta;
      data.litros = parseFloat(form.litros);
      data.monto = montoCalculado ?? null;
      data.consumidor_id = consumidor.id;
      data.consumidor_nombre = consumidor.nombre;
      // legado para compatibilidad
      data.vehiculo_chapa = consumidor.codigo_interno || consumidor.nombre;
      data.vehiculo_alias = consumidor.nombre;
      data.combustible_id = combustible.id;
      data.combustible_nombre = combustible.nombre;
      data.precio = precioVigente;
      data.remanente_estimado_antes = auditoriaCompra?.remanenteAntes ?? null;
      data.combustible_estimado_post = auditoriaCompra?.combustibleEstimadoPost ?? null;
      data.capacidad_tanque = capacidadTanque;
      data.auditoria_combustible_estado = auditoriaCompra?.estado || AUDITORIA_ESTADO.SIN_ESTIMACION;
      if (consumidorEsEquipo) {
        if (form.horas_uso) data.horas_uso = parseFloat(form.horas_uso);
      } else {
        if (form.odometro) data.odometro = parseFloat(form.odometro);
        if (ultimoOdometro != null) data.odometro_anterior = ultimoOdometro;
        if (kmRecorridos != null && requiereOdometro) data.km_recorridos = kmRecorridos;
        if (consumoRealCalculado != null && requiereOdometro) data.consumo_real = consumoRealCalculado;
      }
      if (form.nivel_tanque) data.nivel_tanque = parseFloat(form.nivel_tanque);
    } else if (tipo === 'DEPOSITO') {
      data.consumidor_id = consumidor.id;
      data.consumidor_nombre = consumidor.nombre;
      data.combustible_id = combustible.id;
      data.combustible_nombre = combustible.nombre;
      data.litros = parseFloat(form.litros);
      if (form.monto) data.monto = parseFloat(form.monto);
      if (form.tarjeta_id && tarjeta) {
        data.tarjeta_id = tarjeta.id;
        data.tarjeta_alias = tarjeta.alias || tarjeta.id_tarjeta;
      }
      if (form.nivel_tanque) data.nivel_tanque = parseFloat(form.nivel_tanque);
      if (form.consumidor_origen_id) {
        data.consumidor_origen_id = consumidorOrigen.id;
        data.consumidor_origen_nombre = consumidorOrigen.nombre;
        data.referencia = consumidorOrigen.nombre;
      } else if (form.referencia) {
        data.referencia = form.referencia;
      }
      if (canVerPrecios && form.precio_costo_unitario) data.precio_costo_unitario = parseFloat(form.precio_costo_unitario);
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
      if (consumidorEsEquipo) {
        if (form.horas_uso) data.horas_uso = parseFloat(form.horas_uso);
      } else {
        if (form.odometro) data.odometro = parseFloat(form.odometro);
      }
      if (form.nivel_tanque) data.nivel_tanque = parseFloat(form.nivel_tanque);
      data.referencia = form.referencia;
      if (precioDespachoVigente) {
        data.precio = precioDespachoVigente.precio_por_litro;
        if (montoDespachoCalculado != null) data.monto = montoDespachoCalculado;
      } else if (form.monto) {
        data.monto = parseFloat(form.monto);
      }
    }
    if (adjuntoFile) {
      setIsUploading(true);
      const ext = adjuntoFile.name.split('.').pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('movimiento-adjuntos')
        .upload(path, adjuntoFile);
      setIsUploading(false);
      if (uploadError) { toast.error('Error al subir adjunto'); return; }
      const { data: { publicUrl } } = supabase.storage.from('movimiento-adjuntos').getPublicUrl(path);
      data.adjunto_url = publicUrl;
      data.adjunto_nombre = adjuntoFile.name;
    }

    createMutation.mutate(data);
  };

  return (
    <div className="space-y-4">
      {tiposPermitidos.length > 1 ? (
        <Tabs value={tipo} onValueChange={v => { setTipo(v); setErrors({}); }}>
          <TabsList className={`w-full grid h-11 ${{ 2: 'grid-cols-2', 3: 'grid-cols-3' }[tiposPermitidos.length] ?? 'grid-cols-3'}`}>
            {tiposPermitidos.map(({ value, label, Icon, activeClass }) => (
              <TabsTrigger key={value} value={value} className={`gap-1.5 text-xs ${activeClass}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : tiposPermitidos.length === 1 ? (
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 px-1">
          {(() => { const { Icon, label } = tiposPermitidos[0]; return <><Icon className="w-4 h-4" /> {label}</> })()}
        </div>
      ) : null}

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
                  {consumidoresParaCompra.map(c => (
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
              <Label className="text-xs text-slate-500">Litros</Label>
              <Input type="number" step="0.01" min="0.01" value={form.litros} onChange={e => set('litros', e.target.value)} placeholder="0.00" className="mt-1" />
              {errors.litros && <p className="text-xs text-red-500 mt-1">{errors.litros}</p>}
            </div>
            {montoCalculado != null && (
              <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center">
                <span className="text-sm text-slate-500">Monto estimado</span>
                <span className="text-lg font-bold text-slate-800">{formatMonto(montoCalculado, tarjetaSeleccionada?.moneda)}</span>
              </div>
            )}
            {auditoriaCompra && !consumidorEsTanque && (
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

            <div>
              <Label className="text-xs text-slate-500">Referencia (opcional)</Label>
              <Input value={form.referencia} onChange={e => set('referencia', e.target.value)} placeholder="N° factura, remisión, nota…" className="mt-1" />
            </div>

            {/* Nivel en tanque y odómetro solo para vehículos/equipos con control de km */}
            {!consumidorEsTanque && !consumidorSinOdometro && (
            <div className="border border-slate-100 rounded-xl p-3 space-y-1.5 bg-slate-50/60">
              <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                Nivel en tanque antes de cargar
                <span className="font-normal text-slate-400">(opcional)</span>
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={form.nivel_tanque}
                onChange={e => set('nivel_tanque', e.target.value)}
                placeholder="Litros actuales en el tanque"
                className="mt-0.5"
              />
              <p className="text-[11px] text-slate-400">Lectura del tanque del vehículo antes de cargar. Ayuda a verificar consumo real.</p>
            </div>
            )}

            {/* Horas de uso (equipos/generadores) o Odómetro (vehículos) — oculto para tanques/reservas y vehículos sin control de km */}
            {!consumidorEsTanque && !consumidorSinOdometro && (consumidorEsEquipo ? (
              <div className={`border rounded-xl p-3 space-y-2 ${errors.horas_uso ? 'border-red-200 bg-red-50/30' : 'border-amber-100 bg-amber-50/40'}`}>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <Gauge className="w-3.5 h-3.5" />
                  Horas de uso (lectura acumulada)
                  {ultimasHorasEquipo != null && (
                    <span className="font-normal text-slate-400 ml-auto">Anterior: {ultimasHorasEquipo.toLocaleString()} h</span>
                  )}
                </div>
                <Input
                  type="number"
                  min={ultimasHorasEquipo != null ? ultimasHorasEquipo + 0.1 : 0}
                  step="0.1"
                  value={form.horas_uso}
                  onChange={e => set('horas_uso', e.target.value)}
                  placeholder="Lectura actual (h)"
                  className={errors.horas_uso ? 'border-red-300 focus-visible:ring-red-300' : ''}
                />
                {errors.horas_uso && <p className="text-xs text-red-500">{errors.horas_uso}</p>}
                <p className="text-[11px] text-slate-400">Lectura del horómetro al momento de la carga.</p>
              </div>
            ) : (
              <div className={`border rounded-xl p-3 space-y-2 ${errors.odometro ? 'border-red-200 dark:border-red-800/60 bg-red-50/30 dark:bg-red-900/20' : 'border-sky-100 dark:border-sky-800/50 bg-sky-50/40 dark:bg-sky-900/20'}`}>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
                  <Gauge className="w-3.5 h-3.5" />
                  Odómetro actual {requiereOdometro && <span className="text-red-400">*</span>}
                  {ultimoOdometro != null && (
                    <span className="font-normal text-slate-400 ml-auto">Anterior: {ultimoOdometro.toLocaleString()} km</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={ultimoOdometro != null ? ultimoOdometro + 1 : 0}
                    step="1"
                    value={form.odometro}
                    onChange={e => set('odometro', e.target.value)}
                    placeholder="Lectura actual (km)"
                    className={errors.odometro ? 'border-red-300 focus-visible:ring-red-300' : ''}
                  />
                  {consumidorSeleccionado?.gps_device_id != null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1 text-xs px-2 border-sky-200 text-sky-600 hover:bg-sky-50"
                      onClick={fetchGpsOdometer}
                      disabled={gpsOdoLoading}
                      title="Leer odómetro desde GPS"
                    >
                      {gpsOdoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Satellite className="w-3.5 h-3.5" />}
                    </Button>
                  )}
                </div>
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
            ))}
          </>
        )}

        {/* DEPOSITO */}
        {tipo === 'DEPOSITO' && (
          <>
            {/* Origen — cisterna externa o depósito interno como fuente */}
            <div>
              <Label className="text-xs text-slate-500">Origen (cisterna / proveedor)</Label>
              <Select
                value={form.consumidor_origen_id || '_externo'}
                onValueChange={v => {
                  if (v === '_externo') {
                    set('consumidor_origen_id', '');
                  } else {
                    const c = consumidores.find(x => x.id === v);
                    set('consumidor_origen_id', v);
                    set('referencia', c?.nombre || '');
                  }
                }}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar origen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_externo">Externo / Proveedor / Referencia libre</SelectItem>
                  {depositos.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">
                {form.consumidor_origen_id ? 'Referencia / Nota (opcional)' : 'N° cisterna / Remisión / Referencia'}
              </Label>
              <Input
                value={form.referencia}
                onChange={e => set('referencia', e.target.value)}
                placeholder={form.consumidor_origen_id ? 'Nota adicional…' : 'Ej: Cisterna-045, Remisión 00123…'}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Tarjeta de pago asociada (opcional)</Label>
              <Select
                value={form.tarjeta_id || '_none'}
                onValueChange={v => set('tarjeta_id', v === '_none' ? '' : v)}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Sin tarjeta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sin tarjeta</SelectItem>
                  {tarjetasActivas.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.alias || t.id_tarjeta} ({t.moneda})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Destino — depósito interno que recibe el combustible */}
            <div>
              <Label className="text-xs text-slate-500">Destino (depósito / surtidor) *</Label>
              <Select value={form.consumidor_id} onValueChange={v => set('consumidor_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar destino" /></SelectTrigger>
                <SelectContent>
                  {(depositosYSurtidores.length > 0 ? depositosYSurtidores : consumidoresActivos).map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.consumidor_id && <p className="text-xs text-red-500 mt-1">{errors.consumidor_id}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Combustible *</Label>
              <Select value={form.combustible_id} onValueChange={v => set('combustible_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar combustible" /></SelectTrigger>
                <SelectContent>
                  {combustiblesActivos.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.combustible_id && <p className="text-xs text-red-500 mt-1">{errors.combustible_id}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Litros recibidos *</Label>
              <Input type="number" step="0.01" min="0.01" value={form.litros} onChange={e => set('litros', e.target.value)} placeholder="0.00" className="mt-1" />
              {errors.litros && <p className="text-xs text-red-500 mt-1">{errors.litros}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Monto (opcional)</Label>
                <Input type="number" step="0.01" value={form.monto} onChange={e => set('monto', e.target.value)} placeholder="0.00" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Nivel antes (L, opcional)</Label>
                <Input
                  type="number" step="0.1" min="0"
                  value={form.nivel_tanque}
                  onChange={e => set('nivel_tanque', e.target.value)}
                  placeholder="Litros previos"
                  className="mt-1"
                />
              </div>
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
                  {tiposConsumidor.filter(t => t.activo !== false && !esDeposito({ tipo_consumidor_nombre: t.nombre })).map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Destino (Consumidor)</Label>
              <Select value={form.consumidor_id} onValueChange={v => set('consumidor_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar destino" /></SelectTrigger>
                <SelectContent>
                  {consumidoresParaDespachoDestino.filter(c => c.id !== form.consumidor_origen_id).map(c => (
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
            {/* Nivel en tanque al momento del despacho — solo para consumidores con control de km */}
            {!consumidorSinOdometro && !consumidorEsSurtidorDestino && (
            <div className="border border-slate-100 rounded-xl p-3 space-y-1.5 bg-slate-50/60">
              <Label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                Nivel en tanque antes de recibir
                <span className="font-normal text-slate-400">(opcional)</span>
              </Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={form.nivel_tanque}
                onChange={e => set('nivel_tanque', e.target.value)}
                placeholder="Litros actuales en el tanque"
                className="mt-0.5"
              />
              <p className="text-[11px] text-slate-400">Lectura del tanque antes del despacho. Ayuda a verificar consumo real.</p>
            </div>
            )}
            <div>
              <Label className="text-xs text-slate-500">Referencia (opcional)</Label>
              <Input value={form.referencia} onChange={e => set('referencia', e.target.value)} placeholder="Nota..." className="mt-1" />
            </div>
            {!consumidorSinOdometro && !consumidorEsSurtidorDestino && (consumidorEsEquipo ? (
              <div className={`border rounded-xl p-3 space-y-2 ${errors.horas_uso ? 'border-red-200 bg-red-50/30' : 'border-amber-100 bg-amber-50/40'}`}>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                  <Gauge className="w-3.5 h-3.5" />
                  Horas de uso (lectura acumulada)
                  {ultimasHorasEquipo != null && (
                    <span className="font-normal text-slate-400 ml-auto">Anterior: {ultimasHorasEquipo.toLocaleString()} h</span>
                  )}
                </div>
                <Input
                  type="number"
                  min={ultimasHorasEquipo != null ? ultimasHorasEquipo + 0.1 : 0}
                  step="0.1"
                  value={form.horas_uso}
                  onChange={e => set('horas_uso', e.target.value)}
                  placeholder="Lectura actual (h)"
                  className={errors.horas_uso ? 'border-red-300 focus-visible:ring-red-300' : ''}
                />
                {errors.horas_uso && <p className="text-xs text-red-500">{errors.horas_uso}</p>}
              </div>
            ) : (
              <div className={`border rounded-xl p-3 space-y-2 ${errors.odometro ? 'border-red-200 bg-red-50/30' : 'border-purple-100 bg-purple-50/40'}`}>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700">
                  <Gauge className="w-3.5 h-3.5" />
                  Odómetro despacho {requiereOdometro && <span className="text-red-400">*</span>}
                  {ultimoOdometro != null && (
                    <span className="font-normal text-slate-400 ml-auto">Anterior: {ultimoOdometro.toLocaleString()} km</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={ultimoOdometro != null ? ultimoOdometro + 1 : 0}
                    step="1"
                    value={form.odometro}
                    onChange={e => set('odometro', e.target.value)}
                    placeholder="Lectura actual (km)"
                    className={errors.odometro ? 'border-red-300 focus-visible:ring-red-300' : ''}
                  />
                  {consumidorSeleccionado?.gps_device_id != null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1 text-xs px-2 border-purple-200 text-purple-600 hover:bg-purple-50"
                      onClick={fetchGpsOdometer}
                      disabled={gpsOdoLoading}
                      title="Leer odómetro desde GPS"
                    >
                      {gpsOdoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Satellite className="w-3.5 h-3.5" />}
                    </Button>
                  )}
                </div>
                {!requiereOdometro && (
                  <p className="text-[11px] text-slate-400">No obligatorio para reserva/tanque/equipo.</p>
                )}
                {errors.odometro && <p className="text-xs text-red-500">{errors.odometro}</p>}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Precio de despacho calculado */}
      {tipo === 'DESPACHO' && precioDespachoVigente && (
        <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-700 flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 shrink-0" />
          <span>
            Precio despacho: <strong>{Number(precioDespachoVigente.precio_por_litro).toFixed(4)} {precioDespachoVigente.moneda}/L</strong>
            {montoDespachoCalculado != null && <> · Monto: <strong>{formatMonto(montoDespachoCalculado)}</strong></>}
          </span>
        </div>
      )}

      {/* Precio de costo (solo COMPRA/DEPOSITO, solo economico/superadmin) */}
      {canVerPrecios && tipo === 'DEPOSITO' && (
        <div>
          <Label className="text-xs text-slate-500 font-medium block mb-1">Precio de costo/L (opcional)</Label>
          <Input
            type="number"
            step="0.0001"
            min="0"
            placeholder="Ej: 25.5000"
            className="h-9 text-sm"
            value={form.precio_costo_unitario}
            onChange={e => setForm(f => ({ ...f, precio_costo_unitario: e.target.value }))}
          />
          <p className="text-[11px] text-slate-400 mt-0.5">Se usa para calcular el costo promedio ponderado del tanque.</p>
        </div>
      )}

      {/* Adjunto */}
      <div>
        <label className="text-xs text-slate-500 font-medium block mb-1">Adjunto (opcional)</label>
        {adjuntoFile ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-700 truncate flex-1">{adjuntoFile.name}</span>
            <button type="button" onClick={() => setAdjuntoFile(null)} className="text-slate-400 hover:text-red-500">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
            <Paperclip className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-400">Seleccionar archivo…</span>
            <input type="file" className="hidden" onChange={e => setAdjuntoFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={createMutation.isPending || isUploading}
        className={`w-full h-11 text-sm font-semibold rounded-xl ${
          tipo === 'RECARGA'
            ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700'
            : tipo === 'COMPRA'
            ? 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700'
            : tipo === 'DEPOSITO'
            ? 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700'
            : 'bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700'
        }`}
      >
        {(createMutation.isPending || isUploading) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        {isUploading ? 'Subiendo archivo…' : `Guardar ${tipo === 'RECARGA' ? 'Recarga' : tipo === 'COMPRA' ? 'Compra' : tipo === 'DEPOSITO' ? 'Depósito' : 'Despacho'}`}
      </Button>
    </div>
  );
}
