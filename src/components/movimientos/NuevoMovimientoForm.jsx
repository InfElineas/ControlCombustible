import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Save, Loader2 } from 'lucide-react';
import { obtenerPrecioVigente, calcularSaldo, formatMonto } from '@/components/ui-helpers/SaldoUtils';

export default function NuevoMovimientoForm({ onSuccess }) {
  const queryClient = useQueryClient();

  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: vehiculos = [] } = useQuery({ queryKey: ['vehiculos'], queryFn: () => base44.entities.Vehiculo.list() });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: precios = [] } = useQuery({ queryKey: ['precios'], queryFn: () => base44.entities.PrecioCombustible.list() });
  const { data: movimientos = [] } = useQuery({ queryKey: ['movimientos'], queryFn: () => base44.entities.Movimiento.list('-created_date', 500) });

  const [tipo, setTipo] = useState('COMPRA');
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    tarjeta_id: '',
    vehiculo_chapa: '',
    vehiculo_origen_chapa: '',
    combustible_id: '',
    odometro: '',
    litros: '',
    monto: '',
    referencia: '',
  });
  const [errors, setErrors] = useState({});

  const tarjetasActivas = tarjetas.filter(t => t.activa);
  const vehiculosActivos = vehiculos.filter(v => v.activa);
  const combustiblesActivos = combustibles.filter(c => c.activa);

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

  const ultimaLecturaOdometro = useMemo(() => {
    if (!form.vehiculo_chapa) return null;
    const vehiculo = vehiculos.find(v => v.id === form.vehiculo_chapa);
    if (!vehiculo) return null;

    const comprasVehiculo = movimientos
      .filter(m => m.tipo === 'COMPRA' && m.vehiculo_chapa === vehiculo.chapa && m.odometro != null)
      .sort((a, b) => {
        const fechaA = a.fecha || '';
        const fechaB = b.fecha || '';
        return fechaB.localeCompare(fechaA);
      });

    return comprasVehiculo[0]?.odometro ?? null;
  }, [form.vehiculo_chapa, vehiculos, movimientos]);

  const calcularStockLitros = (vehiculoId, combustibleId) => {
    if (!vehiculoId || !combustibleId) return null;
    const veh = vehiculos.find(v => v.id === vehiculoId);
    if (!veh) return null;
    const entradas = movimientos
      .filter(m => m.tipo === 'COMPRA' && m.vehiculo_chapa === veh.chapa && m.combustible_id === combustibleId)
      .reduce((s, m) => s + (m.litros || 0), 0);
    const salidas = movimientos
      .filter(m => m.tipo === 'DESPACHO' && m.vehiculo_origen_chapa === veh.chapa && m.combustible_id === combustibleId)
      .reduce((s, m) => s + (m.litros || 0), 0);
    return entradas - salidas;
  };

  const stockOrigenDespacho = useMemo(() => {
    if (tipo !== 'DESPACHO') return null;
    return calcularStockLitros(form.vehiculo_origen_chapa, form.combustible_id);
  }, [tipo, form.vehiculo_origen_chapa, form.combustible_id, movimientos, vehiculos]);

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
      if (!form.vehiculo_chapa) e.vehiculo_chapa = 'Seleccione vehículo';
      if (!form.combustible_id) e.combustible_id = 'Seleccione combustible';
      if (!form.monto || parseFloat(form.monto) <= 0) e.monto = 'Monto > 0';
      if (!form.odometro || parseFloat(form.odometro) < 0) e.odometro = 'Podómetro >= 0';
      if (ultimaLecturaOdometro != null && parseFloat(form.odometro) < ultimaLecturaOdometro) {
        e.odometro = `No puede ser menor a la última lectura (${ultimaLecturaOdometro} km)`;
      }
      if (!precioVigente) e.combustible_id = 'Sin precio vigente para esta fecha';
    } else if (tipo === 'RECARGA') {
      if (!form.tarjeta_id) e.tarjeta_id = 'Seleccione tarjeta';
      if (!form.monto || parseFloat(form.monto) <= 0) e.monto = 'Monto > 0';
    } else if (tipo === 'DESPACHO') {
      if (!form.vehiculo_origen_chapa) e.vehiculo_origen_chapa = 'Seleccione origen (reserva)';
      if (!form.vehiculo_chapa) e.vehiculo_chapa = 'Seleccione vehículo destino';
      if (!form.combustible_id) e.combustible_id = 'Seleccione combustible';
      if (!form.litros || parseFloat(form.litros) <= 0) e.litros = 'Litros > 0';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const tarjeta = tarjetas.find(t => t.id === form.tarjeta_id);
    const vehiculo = vehiculos.find(v => v.id === form.vehiculo_chapa);
    const vehiculoOrigen = vehiculos.find(v => v.id === form.vehiculo_origen_chapa);
    const combustible = combustibles.find(c => c.id === form.combustible_id);

    let data = { fecha: form.fecha, tipo };
    if (tipo === 'COMPRA') {
      data.tarjeta_id = tarjeta.id;
      data.tarjeta_alias = tarjeta.alias || tarjeta.id_tarjeta;
      data.monto = parseFloat(form.monto);
      data.vehiculo_chapa = vehiculo.chapa;
      data.vehiculo_alias = vehiculo.alias || vehiculo.chapa;
      data.combustible_id = combustible.id;
      data.combustible_nombre = combustible.nombre;
      data.precio = precioVigente;
      data.litros = litrosCalculados;
      data.odometro = parseFloat(form.odometro);

      if (ultimaLecturaOdometro != null && litrosCalculados > 0) {
        const kmRecorridos = data.odometro - ultimaLecturaOdometro;
        if (kmRecorridos > 0) {
          data.km_recorridos = kmRecorridos;
          data.rendimiento_km_l = kmRecorridos / litrosCalculados;
          data.consumo_l_100km = (litrosCalculados / kmRecorridos) * 100;
        }
      }
    } else if (tipo === 'RECARGA') {
      data.tarjeta_id = tarjeta.id;
      data.tarjeta_alias = tarjeta.alias || tarjeta.id_tarjeta;
      data.monto = parseFloat(form.monto);
      data.referencia = form.referencia;
    } else if (tipo === 'DESPACHO') {
      data.vehiculo_origen_chapa = vehiculoOrigen.chapa;
      data.vehiculo_origen_alias = vehiculoOrigen.alias || vehiculoOrigen.chapa;
      data.vehiculo_chapa = vehiculo.chapa;
      data.vehiculo_alias = vehiculo.alias || vehiculo.chapa;
      data.combustible_id = combustible.id;
      data.combustible_nombre = combustible.nombre;
      data.litros = parseFloat(form.litros);
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
        {/* Fecha - siempre visible */}
        <div>
          <Label className="text-xs text-slate-500">Fecha</Label>
          <Input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className="mt-1" />
          {errors.fecha && <p className="text-xs text-red-500 mt-1">{errors.fecha}</p>}
        </div>

        {/* Tarjeta - solo RECARGA y COMPRA */}
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
              <p className={`text-xs mt-1 ${saldoTarjeta < 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                Saldo actual: {formatMonto(saldoTarjeta, tarjetaSeleccionada?.moneda)}
              </p>
            )}
          </div>
        )}

        {/* COMPRA fields */}
        {tipo === 'COMPRA' && (
          <>
            <div>
              <Label className="text-xs text-slate-500">Vehículo</Label>
              <Select value={form.vehiculo_chapa} onValueChange={v => set('vehiculo_chapa', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar vehículo" /></SelectTrigger>
                <SelectContent>
                  {vehiculosActivos.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.chapa}{v.alias ? ` · ${v.alias}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.vehiculo_chapa && <p className="text-xs text-red-500 mt-1">{errors.vehiculo_chapa}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Combustible</Label>
              <Select value={form.combustible_id} onValueChange={v => set('combustible_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar combustible" /></SelectTrigger>
                <SelectContent>
                  {combustiblesActivos.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
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
            <div>
              <Label className="text-xs text-slate-500">Lectura podómetro (km)</Label>
              <Input type="number" step="1" min="0" value={form.odometro} onChange={e => set('odometro', e.target.value)} placeholder="0" className="mt-1" />
              {errors.odometro && <p className="text-xs text-red-500 mt-1">{errors.odometro}</p>}
              <p className="text-xs text-slate-400 mt-1">
                Última lectura: {ultimaLecturaOdometro != null ? `${ultimaLecturaOdometro} km` : 'sin registros'}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center">
              <span className="text-sm text-slate-500">Litros equivalentes</span>
              <span className="text-lg font-bold text-slate-800">{litrosCalculados != null ? `${litrosCalculados.toFixed(2)} L` : '—'}</span>
            </div>
          </>
        )}

        {/* RECARGA fields */}
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

        {/* DESPACHO fields */}
        {tipo === 'DESPACHO' && (
          <>
            <div>
              <Label className="text-xs text-slate-500">Origen (Reserva)</Label>
              <Select value={form.vehiculo_origen_chapa} onValueChange={v => set('vehiculo_origen_chapa', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar reserva" /></SelectTrigger>
                <SelectContent>
                  {vehiculosActivos.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.chapa}{v.alias ? ` · ${v.alias}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.vehiculo_origen_chapa && <p className="text-xs text-red-500 mt-1">{errors.vehiculo_origen_chapa}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Destino (Vehículo)</Label>
              <Select value={form.vehiculo_chapa} onValueChange={v => set('vehiculo_chapa', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar vehículo" /></SelectTrigger>
                <SelectContent>
                  {vehiculosActivos.filter(v => v.id !== form.vehiculo_origen_chapa).map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.chapa}{v.alias ? ` · ${v.alias}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.vehiculo_chapa && <p className="text-xs text-red-500 mt-1">{errors.vehiculo_chapa}</p>}
            </div>
            <div>
              <Label className="text-xs text-slate-500">Combustible</Label>
              <Select value={form.combustible_id} onValueChange={v => set('combustible_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar combustible" /></SelectTrigger>
                <SelectContent>
                  {combustiblesActivos.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.combustible_id && <p className="text-xs text-red-500 mt-1">{errors.combustible_id}</p>}
            </div>
            {stockOrigenDespacho != null && (
              <div className="bg-purple-50 rounded-xl p-3 flex justify-between items-center">
                <span className="text-sm text-purple-600">Stock en reserva</span>
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
