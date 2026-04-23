import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Power, Trash2, Truck, Zap, Container, Settings, Search } from 'lucide-react';
import StatusBadge from '@/components/ui-helpers/StatusBadge';
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import ConsumidorForm from '@/components/consumidores/ConsumidorForm';
import { useUserRole } from '@/components/ui-helpers/useUserRole';

const ICONO_MAP = { truck: Truck, zap: Zap, container: Container, settings: Settings };
const IconComp = ({ icono, className }) => {
  const C = ICONO_MAP[icono] || Settings;
  return <C className={className} />;
};

const emptyForm = {
  tipo_consumidor_id: '', tipo_consumidor_nombre: '',
  nombre: '', codigo_interno: '',
  combustible_id: '', combustible_nombre: '',
  activo: true, responsable: '', conductor: '', funcion: '', observaciones: '',
  litros_iniciales: 0,
  datos_vehiculo: {}, datos_tanque: {}, datos_equipo: {},
};

export default function Consumidores() {
  const { canDelete, canWrite } = useUserRole();
  const queryClient = useQueryClient();

  const { data: consumidores = [], isLoading } = useQuery({
    queryKey: ['consumidores'],
    queryFn: () => base44.entities.Consumidor.list(),
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ['tipos_consumidor'],
    queryFn: () => base44.entities.TipoConsumidor.list(),
  });
  const { data: combustibles = [] } = useQuery({
    queryKey: ['combustibles'],
    queryFn: () => base44.entities.TipoCombustible.list(),
  });

  const [filterTipo, setFilterTipo] = useState('all');
  const [filterActivo, setFilterActivo] = useState('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDel, setConfirmDel] = useState(null);

  const createMut = useMutation({
    mutationFn: d => base44.entities.Consumidor.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Consumidor creado'); closeDialog(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => base44.entities.Consumidor.update(id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Actualizado'); closeDialog(); },
  });
  const deleteMut = useMutation({
    mutationFn: id => base44.entities.Consumidor.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['consumidores'] }); toast.success('Eliminado'); setConfirmDel(null); },
  });

  const closeDialog = () => { setDialogOpen(false); setEditing(null); setForm(emptyForm); };

  const openEdit = c => {
    setEditing(c);
    setForm({
      tipo_consumidor_id: c.tipo_consumidor_id || '',
      tipo_consumidor_nombre: c.tipo_consumidor_nombre || '',
      nombre: c.nombre || '',
      codigo_interno: c.codigo_interno || '',
      combustible_id: c.combustible_id || '',
      combustible_nombre: c.combustible_nombre || '',
      activo: c.activo !== false,
      responsable: c.responsable || '',
      conductor: c.conductor || '',
      funcion: c.funcion || '',
      observaciones: c.observaciones || '',
      litros_iniciales: Number.isFinite(Number(c.litros_iniciales)) ? Number(c.litros_iniciales) : 0,
      datos_vehiculo: c.datos_vehiculo || {},
      datos_tanque: c.datos_tanque || {},
      datos_equipo: c.datos_equipo || {},
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.tipo_consumidor_id) { toast.error('Seleccione un tipo de consumidor'); return; }
    if (!form.nombre.trim()) { toast.error('Nombre requerido'); return; }
    if (form.litros_iniciales === '' || Number.isNaN(Number(form.litros_iniciales)) || Number(form.litros_iniciales) < 0) {
      toast.error('Litros iniciales es obligatorio y debe ser un número ≥ 0');
      return;
    }
    const payload = { ...form, litros_iniciales: Number(form.litros_iniciales) };
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  };

  const toggleActivo = c => updateMut.mutate({ id: c.id, d: { activo: !c.activo } });

  const filtered = consumidores.filter(c => {
    if (filterTipo !== 'all' && c.tipo_consumidor_id !== filterTipo) return false;
    if (filterActivo === 'activos' && !c.activo) return false;
    if (filterActivo === 'inactivos' && c.activo) return false;
    if (search && !`${c.nombre} ${c.codigo_interno || ''} ${c.tipo_consumidor_nombre || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Consumidores</h1>
          <p className="text-xs text-slate-400">{filtered.length} registros</p>
        </div>
        {canWrite && (
          <Button size="sm" className="gap-1.5 bg-sky-600 hover:bg-sky-700" onClick={() => { setForm(emptyForm); setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </Button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="pl-8 h-8 text-sm w-48"
          />
        </div>
        <Select value={filterTipo} onValueChange={setFilterTipo}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterActivo} onValueChange={setFilterActivo}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <div className="grid gap-2">
        {isLoading && <p className="text-sm text-slate-400 text-center py-8">Cargando...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-8">No hay consumidores registrados</p>
        )}
        {filtered.map(c => {
          const tipo = tipos.find(t => t.id === c.tipo_consumidor_id);
          return (
            <Card key={c.id} className={`border-0 shadow-sm ${!c.activo ? 'opacity-60' : ''}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                  <IconComp icono={tipo?.icono} className="w-4 h-4 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700 truncate">{c.nombre}</span>
                    {c.codigo_interno && (
                      <span className="font-mono text-xs text-slate-500">{c.codigo_interno}</span>
                    )}
                    <StatusBadge active={c.activo !== false} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {c.tipo_consumidor_nombre || tipo?.nombre || '—'}
                    </Badge>
                    {c.combustible_nombre && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-200 text-orange-700">
                        {c.combustible_nombre}
                      </Badge>
                    )}
                    {c.responsable && (
                      <span className="text-[11px] text-slate-400 truncate">{c.responsable}</span>
                    )}
                    {c.datos_vehiculo?.estado_vehiculo && c.datos_vehiculo.estado_vehiculo !== 'Operativo' && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-200 text-amber-700">
                        {c.datos_vehiculo.estado_vehiculo}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {canWrite && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {canWrite && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActivo(c)}>
                      <Power className={`w-3.5 h-3.5 ${c.activo !== false ? 'text-emerald-500' : 'text-slate-300'}`} />
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => setConfirmDel(c)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar consumidor' : 'Nuevo consumidor'}</DialogTitle>
          </DialogHeader>
          <ConsumidorForm
            form={form}
            setForm={setForm}
            tipos={tipos}
            combustibles={combustibles}
            editingTipo={editing?.tipo_consumidor_nombre}
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={closeDialog}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} className="bg-sky-600 hover:bg-sky-700">
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={() => setConfirmDel(null)}
        title="Eliminar consumidor"
        description={`¿Eliminar "${confirmDel?.nombre}"? Esta acción no se puede deshacer.`}
        onConfirm={() => deleteMut.mutate(confirmDel.id)}
        destructive
      />
    </div>
  );
}
