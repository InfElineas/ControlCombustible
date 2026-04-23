import React from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Detecta si un tipo es "vehículo" por nombre
const esVehiculo = nombre => nombre?.toLowerCase().includes('veh');
const esTanque = nombre => nombre?.toLowerCase().includes('tanque') || nombre?.toLowerCase().includes('reserva');
const esEquipo = nombre => nombre?.toLowerCase().includes('equipo') || nombre?.toLowerCase().includes('planta') || nombre?.toLowerCase().includes('grupo');

function Field({ label, children, required }) {
  return (
    <div>
      <Label className="text-xs text-slate-500">{label}{required && ' *'}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function ConsumidorForm({ form, setForm, tipos, combustibles, editingTipo }) {
  const tipo = tipos.find(t => t.id === form.tipo_consumidor_id);
  const nombreTipo = tipo?.nombre || editingTipo || '';
  const isVeh = esVehiculo(nombreTipo);
  const isTanque = esTanque(nombreTipo);
  const isEquipo = esEquipo(nombreTipo);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));
  const setVeh = (field, val) => setForm(f => ({ ...f, datos_vehiculo: { ...(f.datos_vehiculo || {}), [field]: val } }));
  const setTanq = (field, val) => setForm(f => ({ ...f, datos_tanque: { ...(f.datos_tanque || {}), [field]: val } }));
  const setEquip = (field, val) => setForm(f => ({ ...f, datos_equipo: { ...(f.datos_equipo || {}), [field]: val } }));

  const dv = form.datos_vehiculo || {};
  const dt = form.datos_tanque || {};
  const de = form.datos_equipo || {};

  return (
    <div className="space-y-3">
      {/* Tipo consumidor */}
      <Field label="Tipo de consumidor" required>
        <Select value={form.tipo_consumidor_id} onValueChange={v => {
          const t = tipos.find(x => x.id === v);
          set('tipo_consumidor_id', v);
          set('tipo_consumidor_nombre', t?.nombre || '');
        }}>
          <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
          <SelectContent>
            {tipos.filter(t => t.activo !== false).map(t => (
              <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Nombre */}
      <Field label="Nombre / Descripción" required>
        <Input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Camión Fuso, Tanque Sur, Generador Sala" />
      </Field>

      {/* Código interno */}
      <Field label={isVeh ? "Chapa / Matrícula" : "Código interno"}>
        <Input value={form.codigo_interno || ''} onChange={e => set('codigo_interno', e.target.value)} placeholder={isVeh ? "W004399" : "COD-001"} />
      </Field>

      {/* Combustible */}
      <Field label="Combustible principal">
        <Select value={form.combustible_id || ''} onValueChange={v => {
          const c = combustibles.find(x => x.id === v);
          set('combustible_id', v);
          set('combustible_nombre', c?.nombre || '');
        }}>
          <SelectTrigger><SelectValue placeholder="Seleccionar combustible" /></SelectTrigger>
          <SelectContent>
            {combustibles.filter(c => c.activa !== false).map(c => (
              <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Responsable">
          <Input value={form.responsable || ''} onChange={e => set('responsable', e.target.value)} />
        </Field>
        <Field label="Función">
          <Input value={form.funcion || ''} onChange={e => set('funcion', e.target.value)} placeholder="Transporte, Generación..." />
        </Field>
      </div>

      {isVeh && (
        <Field label="Conductor">
          <Input value={form.conductor || ''} onChange={e => set('conductor', e.target.value)} />
        </Field>
      )}

      {/* Campos específicos vehículo */}
      {isVeh && (
        <div className="border border-slate-100 rounded-xl p-3 space-y-3 bg-slate-50/50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos del Vehículo</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca">
              <Input value={dv.marca || ''} onChange={e => setVeh('marca', e.target.value)} />
            </Field>
            <Field label="Modelo">
              <Input value={dv.modelo || ''} onChange={e => setVeh('modelo', e.target.value)} />
            </Field>
            <Field label="Año">
              <Input type="number" value={dv.anio || ''} onChange={e => setVeh('anio', parseInt(e.target.value) || '')} placeholder="2020" />
            </Field>
            <Field label="Capacidad tanque (L)">
              <Input type="number" step="0.1" value={dv.capacidad_tanque || ''} onChange={e => setVeh('capacidad_tanque', parseFloat(e.target.value) || '')} />
            </Field>
            <Field label={`Índice fabricante (${tipo?.unidad_consumo || 'km/L'})`}>
              <Input type="number" step="0.01" value={dv.indice_consumo_fabricante || ''} onChange={e => setVeh('indice_consumo_fabricante', parseFloat(e.target.value) || '')} />
            </Field>
            <Field label={`Índice real titular (${tipo?.unidad_consumo || 'km/L'})`}>
              <Input type="number" step="0.01" value={dv.indice_consumo_real || ''} onChange={e => setVeh('indice_consumo_real', parseFloat(e.target.value) || '')} />
            </Field>
            <Field label="Umbral alerta (%)">
              <Input type="number" value={dv.umbral_alerta_pct ?? 15} onChange={e => setVeh('umbral_alerta_pct', parseInt(e.target.value) || 15)} />
            </Field>
            <Field label="Umbral crítico (%)">
              <Input type="number" value={dv.umbral_critico_pct ?? 30} onChange={e => setVeh('umbral_critico_pct', parseInt(e.target.value) || 30)} />
            </Field>
          </div>
          <Field label="Estado">
            <Select value={dv.estado_vehiculo || 'Operativo'} onValueChange={v => setVeh('estado_vehiculo', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['Operativo', 'En mantenimiento', 'Fuera de servicio', 'Baja'].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {/* Campos específicos tanque */}
      {isTanque && (
        <div className="border border-slate-100 rounded-xl p-3 space-y-3 bg-slate-50/50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos del Tanque</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacidad (L)">
              <Input type="number" value={dt.capacidad_litros || ''} onChange={e => setTanq('capacidad_litros', parseFloat(e.target.value) || '')} />
            </Field>
            <Field label="Stock mínimo (L)">
              <Input type="number" value={dt.stock_minimo || ''} onChange={e => setTanq('stock_minimo', parseFloat(e.target.value) || '')} />
            </Field>
          </div>
          <Field label="Ubicación">
            <Input value={dt.ubicacion || ''} onChange={e => setTanq('ubicacion', e.target.value)} />
          </Field>
        </div>
      )}

      {/* Campos específicos equipo */}
      {isEquipo && (
        <div className="border border-slate-100 rounded-xl p-3 space-y-3 bg-slate-50/50">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos del Equipo</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <Input value={de.categoria || ''} onChange={e => setEquip('categoria', e.target.value)} placeholder="Planta, Generador..." />
            </Field>
            <Field label="Marca">
              <Input value={de.marca || ''} onChange={e => setEquip('marca', e.target.value)} />
            </Field>
            <Field label="Modelo">
              <Input value={de.modelo || ''} onChange={e => setEquip('modelo', e.target.value)} />
            </Field>
            <Field label="Índice referencia">
              <Input type="number" step="0.01" value={de.indice_consumo_referencia || ''} onChange={e => setEquip('indice_consumo_referencia', parseFloat(e.target.value) || '')} />
            </Field>
          </div>
          <Field label="Unidad medida consumo">
            <Input value={de.unidad_medida_consumo || ''} onChange={e => setEquip('unidad_medida_consumo', e.target.value)} placeholder="L/h, L/ciclo..." />
          </Field>
        </div>
      )}

      {/* Observaciones */}
      <Field label="Observaciones">
        <Textarea
          value={form.observaciones || ''}
          onChange={e => set('observaciones', e.target.value)}
          placeholder="Notas adicionales..."
          className="resize-none"
          rows={2}
        />
      </Field>
    </div>
  );
}