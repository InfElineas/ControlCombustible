import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Pencil, Power, Trash2,
  // Transporte
  Truck, Car, Bus, Tractor, Ship, Bike, Plane,
  // Equipos / maquinaria
  Zap, Cog, Wrench, Factory, Gauge, Cpu, Settings,
  // Almacenamiento
  Container, Warehouse, Package, Box, Archive, Database,
  // Combustible / fluidos
  Fuel, Droplets, Flame,
  // Personas / organizaciones
  User, UserCheck, Shield, MapPin, Building2, Star, Home,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';

// ── Catálogo de iconos disponibles ───────────────────────────────────────────

export const ICONO_CATALOG = [
  // Transporte
  { value: 'truck',     label: 'Camión',       icon: Truck,     group: 'Transporte' },
  { value: 'car',       label: 'Auto',         icon: Car,       group: 'Transporte' },
  { value: 'bus',       label: 'Bus',          icon: Bus,       group: 'Transporte' },
  { value: 'tractor',   label: 'Tractor',      icon: Tractor,   group: 'Transporte' },
  { value: 'ship',      label: 'Barco',        icon: Ship,      group: 'Transporte' },
  { value: 'bike',      label: 'Moto',         icon: Bike,      group: 'Transporte' },
  { value: 'plane',     label: 'Avión',        icon: Plane,     group: 'Transporte' },
  // Equipos
  { value: 'zap',       label: 'Eléctrico',    icon: Zap,       group: 'Equipos' },
  { value: 'cog',       label: 'Motor',        icon: Cog,       group: 'Equipos' },
  { value: 'wrench',    label: 'Herramienta',  icon: Wrench,    group: 'Equipos' },
  { value: 'factory',   label: 'Planta',       icon: Factory,   group: 'Equipos' },
  { value: 'gauge',     label: 'Medidor',      icon: Gauge,     group: 'Equipos' },
  { value: 'cpu',       label: 'Sistema',      icon: Cpu,       group: 'Equipos' },
  { value: 'settings',  label: 'Genérico',     icon: Settings,  group: 'Equipos' },
  // Almacenamiento
  { value: 'container', label: 'Contenedor',   icon: Container, group: 'Almacenamiento' },
  { value: 'warehouse', label: 'Almacén',      icon: Warehouse, group: 'Almacenamiento' },
  { value: 'package',   label: 'Paquete',      icon: Package,   group: 'Almacenamiento' },
  { value: 'box',       label: 'Caja',         icon: Box,       group: 'Almacenamiento' },
  { value: 'archive',   label: 'Archivo',      icon: Archive,   group: 'Almacenamiento' },
  { value: 'database',  label: 'Base',         icon: Database,  group: 'Almacenamiento' },
  // Combustible / fluidos
  { value: 'fuel',      label: 'Surtidor',     icon: Fuel,      group: 'Combustible' },
  { value: 'droplets',  label: 'Fluido',       icon: Droplets,  group: 'Combustible' },
  { value: 'flame',     label: 'Llama',        icon: Flame,     group: 'Combustible' },
  // Personas / organizaciones
  { value: 'user',      label: 'Persona',      icon: User,      group: 'Personas' },
  { value: 'user-check',label: 'Conductor',    icon: UserCheck, group: 'Personas' },
  { value: 'shield',    label: 'Seguridad',    icon: Shield,    group: 'Personas' },
  { value: 'map-pin',   label: 'Ubicación',    icon: MapPin,    group: 'Personas' },
  { value: 'building2', label: 'Edificio',     icon: Building2, group: 'Personas' },
  { value: 'star',      label: 'Especial',     icon: Star,      group: 'Personas' },
  { value: 'home',      label: 'Sede',         icon: Home,      group: 'Personas' },
];

const ICONO_MAP = Object.fromEntries(ICONO_CATALOG.map(i => [i.value, i.icon]));

export const IconoComp = ({ icono, className }) => {
  const C = ICONO_MAP[icono] || Settings;
  return <C className={className} />;
};

// ── Picker visual de iconos ───────────────────────────────────────────────────

const GRUPOS = [...new Set(ICONO_CATALOG.map(i => i.group))];

function IconPicker({ value, onChange }) {
  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? ICONO_CATALOG.filter(i =>
        i.label.toLowerCase().includes(search.toLowerCase()) ||
        i.group.toLowerCase().includes(search.toLowerCase())
      )
    : ICONO_CATALOG;

  const selected = ICONO_CATALOG.find(i => i.value === value);

  return (
    <div className="space-y-2">
      {/* Preview del icono seleccionado */}
      <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 dark:bg-sky-950/40 rounded-lg border border-sky-100 dark:border-sky-800">
        <div className="w-7 h-7 rounded-md bg-sky-100 dark:bg-sky-900 flex items-center justify-center shrink-0">
          <IconoComp icono={value} className="w-4 h-4 text-sky-600 dark:text-sky-400" />
        </div>
        <span className="text-xs font-medium text-sky-700 dark:text-sky-300">
          {selected?.label ?? 'Genérico'}
        </span>
      </div>

      {/* Búsqueda */}
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar icono…"
        className="h-7 text-xs"
      />

      {/* Grid de iconos por grupo */}
      <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-3">
        {(search.trim() ? [null] : GRUPOS).map(grupo => {
          const items = grupo === null ? filtered : filtered.filter(i => i.group === grupo);
          if (items.length === 0) return null;
          return (
            <div key={grupo ?? 'results'}>
              {!search.trim() && (
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-0.5">
                  {grupo}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {items.map(({ value: v, label, icon: Icon }) => (
                  <button
                    key={v}
                    type="button"
                    title={label}
                    onClick={() => onChange(v)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                      value === v
                        ? 'bg-sky-500 text-white shadow-sm ring-2 ring-sky-300 dark:ring-sky-600'
                        : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">Sin resultados</p>
        )}
      </div>
    </div>
  );
}

// ── Panel principal ───────────────────────────────────────────────────────────

const empty = { nombre: '', icono: 'truck', requiere_odometro: false, unidad_consumo: 'km/L', activo: true };

export default function TiposConsumidorPanel() {
  const queryClient = useQueryClient();
  const { data: tipos = [] } = useQuery({
    queryKey: ['tipos_consumidor'],
    queryFn: () => base44.entities.TipoConsumidor.list(),
  });
  const { data: consumidores = [] } = useQuery({
    queryKey: ['consumidores'],
    queryFn: () => base44.entities.Consumidor.list(),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [confirmDel, setConfirmDel] = useState(null);

  const createMut = useMutation({
    mutationFn: d => base44.entities.TipoConsumidor.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tipos_consumidor'] }); toast.success('Tipo creado'); close(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.TipoConsumidor.update(id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tipos_consumidor'] }); toast.success('Tipo actualizado'); close(); },
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.TipoConsumidor.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tipos_consumidor'] }); toast.success('Tipo eliminado'); setConfirmDel(null); },
  });

  const close = () => { setOpen(false); setEditing(null); setForm(empty); };
  const openEdit = t => {
    setEditing(t);
    setForm({
      nombre: t.nombre,
      icono: t.icono || 'truck',
      requiere_odometro: t.requiere_odometro || false,
      unidad_consumo: t.unidad_consumo || 'km/L',
      activo: t.activo !== false,
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    editing ? updateMut.mutate({ id: editing.id, d: form }) : createMut.mutate(form);
  };

  const handleDelete = t => {
    if (consumidores.some(c => c.tipo_consumidor_id === t.id)) {
      toast.error('Tiene consumidores asociados. Desactívelo o reasigne primero.');
      return;
    }
    setConfirmDel(t);
  };

  const toggleActivo = t => updateMut.mutate({ id: t.id, d: { activo: !t.activo } });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tipos de Consumidor</p>
          <p className="text-xs text-slate-400">Configura categorías: Vehículo, Tanque, Equipo, etc.</p>
        </div>
        <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700"
          onClick={() => { setForm(empty); setEditing(null); setOpen(true); }}>
          <Plus className="w-3.5 h-3.5" /> Nuevo tipo
        </Button>
      </div>

      <div className="grid gap-2">
        {tipos.map(t => (
          <Card key={t.id} className={`border-0 shadow-sm ${!t.activo ? 'opacity-60' : ''}`}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center shrink-0">
                <IconoComp icono={t.icono} className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t.nombre}</p>
                <div className="flex gap-1.5 mt-0.5 flex-wrap">
                  {t.requiere_odometro && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">Odómetro</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t.unidad_consumo || 'km/L'}</Badge>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${t.activo !== false ? 'border-emerald-200 text-emerald-700' : 'border-slate-200 text-slate-400'}`}>
                    {t.activo !== false ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActivo(t)}>
                  <Power className={`w-3.5 h-3.5 ${t.activo !== false ? 'text-emerald-500' : 'text-slate-300'}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500"
                  onClick={() => handleDelete(t)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {tipos.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No hay tipos configurados. Crea uno para comenzar.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar tipo' : 'Nuevo tipo de consumidor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-xs text-slate-500">Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Vehículo, Tanque reserva"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-xs text-slate-500">Icono</Label>
              <div className="mt-1">
                <IconPicker
                  value={form.icono}
                  onChange={v => setForm(f => ({ ...f, icono: v }))}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-500">Unidad de consumo</Label>
              <Select value={form.unidad_consumo} onValueChange={v => setForm(f => ({ ...f, unidad_consumo: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="km/L">km/L — kilómetros por litro</SelectItem>
                  <SelectItem value="L/100km">L/100km — litros cada 100 km</SelectItem>
                  <SelectItem value="L/h">L/hora — consumo por hora</SelectItem>
                  <SelectItem value="L/ciclo">L/ciclo — por ciclo de operación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="req_odo"
                checked={form.requiere_odometro}
                onChange={e => setForm(f => ({ ...f, requiere_odometro: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="req_odo" className="text-xs text-slate-600 cursor-pointer">
                Requiere odómetro en cada carga
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={close}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}
              disabled={createMut.isPending || updateMut.isPending}
              className="bg-sky-600 hover:bg-sky-700">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={() => setConfirmDel(null)}
        title="Eliminar tipo"
        description={`¿Eliminar el tipo "${confirmDel?.nombre}"?`}
        onConfirm={() => deleteMut.mutate(confirmDel.id)}
        destructive
      />
    </div>
  );
}
