import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import * as is from '@/api/adminIS';
import { useRolesIS } from '@/components/admin/UsuariosIS';

const msg = (e) => e?.message || 'No se pudo completar la operación.';
const ADMIN = 'admin'; // comodín local del IS: lleva todos los permisos y no se edita

export default function RolesPermisosIS() {
  const qc = useQueryClient();
  const sis = useQuery({ queryKey: ['is-sistema'], queryFn: is.sistemaPropio, staleTime: 10 * 60_000, retry: false });
  const transfer = useQuery({ queryKey: ['is-sistema-transfer'], queryFn: is.sistemaTransferencias, staleTime: 10 * 60_000, retry: false }).data ?? null;
  const [cual, setCual] = useState('combustible');
  const sistemaSel = cual === 'transferencias' && transfer ? transfer : sis.data;
  const sid = sistemaSel?.id;
  const { data: roles = [] } = useRolesIS(sid);
  const { data: permisos = [], isLoading } = useQuery({
    queryKey: ['is-permisos', sid],
    queryFn: () => is.listarPermisos(sid),
    enabled: !!sid,
  });
  const [nuevoRol, setNuevoRol] = useState('');
  const [np, setNp] = useState({ resource: '', action: '', roleId: '' });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['is-roles'] });
    qc.invalidateQueries({ queryKey: ['is-permisos'] });
  };
  const fallo = (e) => { refrescar(); toast.error(msg(e)); };

  const toggle = useMutation({
    mutationFn: ({ permisoId, roleId, dar }) => (dar ? is.darPermiso(permisoId, roleId) : is.quitarPermiso(permisoId, roleId)),
    onSuccess: refrescar, onError: fallo,
  });
  const crearRol = useMutation({
    mutationFn: () => is.crearRol(sid, nuevoRol.trim()),
    onSuccess: () => { setNuevoRol(''); refrescar(); toast.success('Rol creado'); }, onError: fallo,
  });
  const borrarRol = useMutation({
    mutationFn: (id) => is.borrarRol(id),
    onSuccess: () => { refrescar(); toast.success('Rol eliminado'); }, onError: fallo,
  });
  const crearPermiso = useMutation({
    mutationFn: () => is.crearPermiso(sid, np.roleId, np.resource.trim(), np.action.trim()),
    onSuccess: () => { setNp({ resource: '', action: '', roleId: '' }); refrescar(); toast.success('Permiso creado'); }, onError: fallo,
  });

  if (sis.error) return <Card className="border-0 shadow-sm"><CardContent className="p-6 text-xs text-red-600">{msg(sis.error)}</CardContent></Card>;

  const ordenados = [...permisos].sort((a, b) => `${a.resource}:${a.action}`.localeCompare(`${b.resource}:${b.action}`));

  return (
    <div className="space-y-3">
      {transfer && (
        <div className="flex gap-2">
          {[['combustible', 'Combustible'], ['transferencias', 'Transferencias']].map(([k, n]) => (
            <Button key={k} size="sm" variant={cual === k ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setCual(k)}>{n}</Button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        Los permisos se leen y se editan en elineas-auth.{' '}
        {sid === transfer?.id
          ? 'Los de transferencias los aplica elineas-transferencia: un permiso nuevo no concede acceso a nada hasta que ese sistema lo use.'
          : <>La pasarela solo reconoce los que define en<span className="font-mono"> gateway/src/catalogo.ts</span>: un permiso nuevo no concede acceso a nada hasta que el código lo use.</>}
      </p>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {isLoading || sis.isLoading ? <p className="p-8 text-center text-sm text-slate-400">Cargando permisos...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Permiso</th>
                    {roles.map((r) => (
                      <th key={r.id} className="text-center px-3 py-3">
                        <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-600">
                          {r.name}
                          {r.name !== ADMIN && (
                            <button title="Eliminar rol" className="text-slate-300 hover:text-red-500"
                              onClick={() => confirm(`¿Eliminar el rol "${r.name}"?`) && borrarRol.mutate(r.id)}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ordenados.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 font-mono text-slate-700">{p.resource}:{p.action}</td>
                      {roles.map((r) => {
                        const tiene = r.name === ADMIN || p.roles?.some((x) => x.id === r.id);
                        return (
                          <td key={r.id} className="px-3 py-2.5 text-center">
                            <input type="checkbox" checked={tiene} disabled={r.name === ADMIN || toggle.isPending}
                              onChange={(e) => toggle.mutate({ permisoId: p.id, roleId: r.id, dar: e.target.checked })} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {ordenados.length === 0 && (
                    <tr><td className="px-4 py-8 text-center text-slate-400" colSpan={roles.length + 1}>Sin permisos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-0 shadow-sm"><CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-700">Nuevo rol</p>
          <div className="flex gap-2">
            <Input className="h-8 text-xs" placeholder="Nombre del rol" value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} />
            <Button size="sm" className="h-8 gap-1" disabled={!nuevoRol.trim() || crearRol.isPending} onClick={() => crearRol.mutate()}>
              <Plus className="w-3.5 h-3.5" />Crear
            </Button>
          </div>
        </CardContent></Card>

        <Card className="border-0 shadow-sm"><CardContent className="p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-700">Nuevo permiso</p>
          <div className="flex gap-2 flex-wrap">
            <Input className="h-8 text-xs flex-1 min-w-[100px]" placeholder="recurso" value={np.resource} onChange={(e) => setNp({ ...np, resource: e.target.value })} />
            <Input className="h-8 text-xs flex-1 min-w-[100px]" placeholder="acción" value={np.action} onChange={(e) => setNp({ ...np, action: e.target.value })} />
            <Select value={np.roleId} onValueChange={(v) => setNp({ ...np, roleId: v })}>
              <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="Rol" /></SelectTrigger>
              <SelectContent>{roles.filter((r) => r.name !== ADMIN).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" className="h-8 gap-1" disabled={!np.resource.trim() || !np.action.trim() || !np.roleId || crearPermiso.isPending}
              onClick={() => crearPermiso.mutate()}>
              <Plus className="w-3.5 h-3.5" />Crear
            </Button>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
