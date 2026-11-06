import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChevronDown, Search, UserPlus, Send, KeyRound, Pencil } from 'lucide-react';
import * as is from '@/api/adminIS';

const msg = (e) => e?.message || 'No se pudo completar la operación.';

function useSistema() {
  return useQuery({ queryKey: ['is-sistema'], queryFn: is.sistemaPropio, staleTime: 10 * 60_000, retry: false });
}

export function useRolesIS(systemId) {
  return useQuery({
    queryKey: ['is-roles', systemId],
    queryFn: () => is.listarRoles(systemId),
    enabled: !!systemId,
  });
}

const SIN_ACCESO = '__sin_acceso__'; // Radix Select no admite value=""

function useSistemaTransfer() {
  return useQuery({ queryKey: ['is-sistema-transfer'], queryFn: is.sistemaTransferencias, staleTime: 10 * 60_000, retry: false });
}

/** Casillas de roles de un sistema: se pueden tener varios a la vez. */
function SelectorRoles({ roles, actuales, titulo, onToggle, className = 'w-44' }) {
  const ids = new Set(actuales.map((r) => r.id));
  const texto = actuales.length === 0 ? 'Sin acceso' : actuales.map((r) => r.name).join(', ');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={`${className} h-8 text-xs justify-between font-normal`} title={texto}>
          <span className="truncate">{texto}</span><ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-[11px]">{titulo}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((r) => (
          <DropdownMenuCheckboxItem key={r.id} checked={ids.has(r.id)} onSelect={(e) => e.preventDefault()}
            onCheckedChange={(dar) => onToggle(r, dar)}>
            {r.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Aviso({ error }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6 text-xs text-red-600">{msg(error)}</CardContent>
    </Card>
  );
}

function DialogoInvitar({ open, onClose, sistema, roles, rolesTransfer }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: '', email: '', roleId: '', transferRoleId: '' });
  const mut = useMutation({
    mutationFn: () => is.invitarUsuario(f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['is-usuarios'] });
      qc.invalidateQueries({ queryKey: ['is-asig-transfer'] });
      toast.success('Invitación enviada');
      setF({ name: '', email: '', roleId: '', transferRoleId: '' });
      onClose();
    },
    onError: (e) => toast.error(msg(e)),
  });
  const ok = f.name.trim() && f.email.trim() && f.roleId;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Invitar usuario a {sistema?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input placeholder="Correo" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Select value={f.roleId} onValueChange={(v) => setF({ ...f, roleId: v })}>
            <SelectTrigger><SelectValue placeholder="Rol" /></SelectTrigger>
            <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
          {rolesTransfer.length > 0 && (
            <Select value={f.transferRoleId || SIN_ACCESO} onValueChange={(v) => setF({ ...f, transferRoleId: v === SIN_ACCESO ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Transferencias" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_ACCESO}>Transferencias: sin acceso</SelectItem>
                {rolesTransfer.map((r) => <SelectItem key={r.id} value={r.id}>Transferencias: {r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <p className="text-[11px] text-slate-400">La persona recibe un enlace para fijar su propia contraseña.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!ok || mut.isPending} onClick={() => mut.mutate()}>Invitar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoEditar({ usuario, onClose }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: usuario.name ?? '', email: usuario.email ?? '' });
  const [activo, setActivo] = useState(usuario.employee ? usuario.employee.active : usuario.active);
  const mut = useMutation({
    mutationFn: () => {
      const datos = { name: f.name.trim(), email: f.email.trim() };
      if (usuario.employee) datos.employee = { active: activo };
      return is.editarUsuario(usuario.id, datos);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['is-usuarios'] }); toast.success('Usuario actualizado'); onClose(); },
    onError: (e) => toast.error(msg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar usuario</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          {usuario.employee && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={!!activo} onChange={(e) => setActivo(e.target.checked)} />
              Cuenta activa (si se desactiva, no puede iniciar sesión)
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={mut.isPending || !f.name.trim() || !f.email.trim()} onClick={() => mut.mutate()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoClave({ usuario, onClose }) {
  const [nueva, setNueva] = useState('');
  const [actual, setActual] = useState('');
  const mut = useMutation({
    mutationFn: () => is.fijarContrasena(usuario.id, nueva, actual),
    onSuccess: () => { toast.success('Contraseña fijada; sus sesiones se cerraron'); onClose(); },
    onError: (e) => toast.error(msg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Fijar contraseña de {usuario.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input type="password" placeholder="Nueva contraseña" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          <Input type="password" placeholder="Tu contraseña (para confirmar)" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={mut.isPending || nueva.length < 8 || !actual} onClick={() => mut.mutate()}>Fijar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsuariosIS() {
  const qc = useQueryClient();
  const sis = useSistema();
  const sistema = sis.data;
  const { data: roles = [] } = useRolesIS(sistema?.id);
  const transfer = useSistemaTransfer().data ?? null;
  const { data: rolesTransfer = [] } = useRolesIS(transfer?.id);
  const { data: asigTransfer = [] } = useQuery({
    queryKey: ['is-asig-transfer', transfer?.id],
    queryFn: () => is.asignacionesDeSistema(transfer.id),
    enabled: !!transfer?.id,
  });
  const [search, setSearch] = useState('');
  const [invitar, setInvitar] = useState(false);
  const [editar, setEditar] = useState(null);
  const [clave, setClave] = useState(null);

  const { data: usuarios = [], isLoading, error } = useQuery({
    queryKey: ['is-usuarios', sistema?.id, search],
    queryFn: () => is.listarUsuarios(sistema.id, search),
    enabled: !!sistema?.id,
  });

  // Cambio optimista: la casilla responde al instante y la lista se recarga cuando no queda nada en vuelo.
  const enVuelo = useRef(0);
  const rolMut = useMutation({
    mutationFn: ({ userId, roleId, systemId, dar }) => is.alternarRol(userId, systemId, roleId, dar),
    onMutate: ({ userId, systemId, rol, dar }) => {
      enVuelo.current++;
      if (systemId === transfer?.id) {
        qc.setQueryData(['is-asig-transfer', transfer.id], (viejo = []) => {
          const resto = viejo.filter((a) => !(a.userId === userId && a.id === rol.id));
          return dar ? [...resto, { userId, id: rol.id, name: rol.name }] : resto;
        });
        return;
      }
      qc.setQueriesData({ queryKey: ['is-usuarios'] }, (viejo) => Array.isArray(viejo)
        ? viejo.map((u) => u.id !== userId ? u : {
            ...u,
            roles: dar
              ? [...(u.roles ?? []).filter((x) => x.id !== rol.id), { id: rol.id, name: rol.name, system: { id: systemId } }]
              : (u.roles ?? []).filter((x) => x.id !== rol.id),
          })
        : viejo);
    },
    onError: (e) => toast.error(msg(e)),
    onSettled: () => {
      if (--enVuelo.current <= 0) { enVuelo.current = 0; qc.invalidateQueries({ queryKey: ['is-usuarios'] }); qc.invalidateQueries({ queryKey: ['is-asig-transfer'] }); }
    },
  });
  const invMut = useMutation({
    mutationFn: (id) => is.reenviarInvitacion(id),
    onSuccess: () => toast.success('Invitación reenviada'),
    onError: (e) => toast.error(msg(e)),
  });

  if (sis.error) return <Aviso error={sis.error} />;

  const rolesDe = (u, sys) => sys?.id === transfer?.id
    ? asigTransfer.filter((a) => a.userId === u.id)
    : (u.roles ?? []).filter((r) => r.system?.id === sys?.id);
  const nombreTransfer = transfer?.name || 'Transferencias';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <Input className="pl-8 h-8 text-xs" placeholder="Buscar por nombre o correo" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" disabled={!sistema} onClick={() => setInvitar(true)}>
          <UserPlus className="w-3.5 h-3.5" />Invitar
        </Button>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {error ? <p className="p-6 text-xs text-red-600">{msg(error)}</p>
            : isLoading || sis.isLoading ? <p className="p-8 text-center text-sm text-slate-400">Cargando usuarios...</p>
            : usuarios.length === 0 ? <p className="p-8 text-center text-sm text-slate-400">Sin usuarios</p>
            : (
              <div className="divide-y divide-slate-100">
                <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <span className="flex-1 min-w-[180px]">Usuario</span>
                  <span className="w-44">Rol en {sistema?.name ?? 'combustible'}</span>
                  {transfer && <span className="w-44">Rol en {nombreTransfer}</span>}
                  <span className="w-[104px]" />
                </div>
                {usuarios.map((u) => {
                  const activo = u.employee ? u.employee.active : u.active;
                  return (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                      <div className="flex-1 min-w-[180px]">
                        <p className="text-xs font-semibold text-slate-700">{u.name}</p>
                        <p className="text-[10px] text-slate-400">{u.email}</p>
                      </div>
                      {!activo && <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500">Inactivo</Badge>}
                      {!u.editable && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200" title="Tiene roles en otro sistema: solo puedes gestionar su rol aquí">
                          Cuenta compartida
                        </Badge>
                      )}
                      <SelectorRoles roles={roles} actuales={rolesDe(u, sistema)} titulo={`Roles en ${sistema?.name ?? 'Combustible'}`}
                        onToggle={(rol, dar) => rolMut.mutate({ userId: u.id, systemId: sistema.id, roleId: rol.id, rol, dar })} />
                      {transfer && (
                        <SelectorRoles roles={rolesTransfer} actuales={rolesDe(u, transfer)} titulo={`Roles en ${nombreTransfer}`}
                            onToggle={(rol, dar) => rolMut.mutate({ userId: u.id, systemId: transfer.id, roleId: rol.id, rol, dar })} />
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Reenviar invitación" onClick={() => invMut.mutate(u.id)}>
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                      {u.editable && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => setEditar(u)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Fijar contraseña" onClick={() => setClave(u)}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      <DialogoInvitar open={invitar} onClose={() => setInvitar(false)} sistema={sistema} roles={roles} rolesTransfer={rolesTransfer} />
      {editar && <DialogoEditar key={editar.id} usuario={editar} onClose={() => setEditar(null)} />}
      {clave && <DialogoClave usuario={clave} onClose={() => setClave(null)} />}
    </div>
  );
}
