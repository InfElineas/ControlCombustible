import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';

const EDITABLE_FIELDS = ['fecha', 'tipo', 'tarjeta_alias', 'vehiculo_chapa', 'combustible_nombre', 'precio', 'litros', 'monto', 'odometro', 'referencia'];

export default function LogsAdmin() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ['admin-logs-movimientos'],
    queryFn: () => base44.entities.Movimiento.list('-updated_date', 1000),
  });

  const logs = useMemo(() => {
    return movimientos.map((m) => {
      const created = m.created_date || '';
      const updated = m.updated_date || '';
      const tipoEvento = created && updated && created !== updated ? 'ACTUALIZACIÓN' : 'CREACIÓN';
      return {
        ...m,
        tipoEvento,
        autor: m.created_by || 'sistema',
        fechaEvento: updated || created || m.fecha,
      };
    });
  }, [movimientos]);

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => base44.entities.Movimiento.update(id, payload),
    onSuccess: () => {
      toast.success('Movimiento actualizado');
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin-logs-movimientos'] });
      queryClient.invalidateQueries({ queryKey: ['movimientos'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'No se pudo actualizar el movimiento');
    },
  });

  const openEdit = (mov) => {
    const nextForm = {};
    EDITABLE_FIELDS.forEach((k) => {
      nextForm[k] = mov[k] ?? '';
    });
    setForm(nextForm);
    setEditing(mov);
  };

  const saveEdit = () => {
    if (!editing) return;
    const payload = { ...form };
    ['precio', 'litros', 'monto', 'odometro'].forEach((k) => {
      if (payload[k] === '') payload[k] = null;
      else payload[k] = Number(payload[k]);
    });
    updateMutation.mutate({ id: editing.id, payload });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Logs del sitio (Superadmin)</h1>
        <p className="text-xs text-slate-400">Historial de creación/actualización de movimientos y edición rápida.</p>
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-0 overflow-auto">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-400">Cargando logs...</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Evento</th>
                  <th className="text-left px-3 py-2">Fecha evento</th>
                  <th className="text-left px-3 py-2">Movimiento</th>
                  <th className="text-left px-3 py-2">Tipo</th>
                  <th className="text-left px-3 py-2">Vehículo</th>
                  <th className="text-left px-3 py-2">Autor</th>
                  <th className="text-left px-3 py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{log.tipoEvento}</td>
                    <td className="px-3 py-2">{log.fechaEvento || '—'}</td>
                    <td className="px-3 py-2">{log.id}</td>
                    <td className="px-3 py-2">{log.tipo}</td>
                    <td className="px-3 py-2">{log.vehiculo_chapa || '—'}</td>
                    <td className="px-3 py-2">{log.autor}</td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(log)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar movimiento</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {EDITABLE_FIELDS.map((field) => (
              <div key={field} className={field === 'referencia' ? 'col-span-2' : ''}>
                <Label className="text-xs text-slate-500">{field}</Label>
                <Input
                  type={['precio', 'litros', 'monto', 'odometro'].includes(field) ? 'number' : 'text'}
                  value={form[field] ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
                  className="mt-1"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
