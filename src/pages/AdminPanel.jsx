import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { logAudit } from '@/api/auditLog';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Users, Shield, Activity, ShieldCheck, ShieldAlert,
  Pencil, Check, X, Search, ChevronLeft, ChevronRight, ChevronDown,
  Clock, UserX, UserCheck,
} from 'lucide-react';

// ── Constantes ───────────────────────────────────────────────────────────────

const ROLES = ['superadmin', 'operador', 'auditor', 'economico', 'cajero'];

const ROLE_META = {
  superadmin: { label: 'Super Admin', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  operador:   { label: 'Operador',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  auditor:    { label: 'Auditor',     color: 'bg-violet-100 text-violet-700 border-violet-200' },
  economico:  { label: 'Económico',   color: 'bg-amber-100 text-amber-700 border-amber-200' },
  cajero:     { label: 'Cajero',      color: 'bg-rose-100 text-rose-700 border-rose-200' },
};

const PERMISOS_TABLA = [
  { permiso: 'Ver dashboard y resúmenes',         desc: '',                                   superadmin: true,  operador: true,  auditor: true,  economico: true  },
  { permiso: 'Ver movimientos',                   desc: '',                                   superadmin: true,  operador: true,  auditor: true,  economico: true  },
  { permiso: 'Registrar compras y despachos',     desc: 'Crear nuevos movimientos',           superadmin: true,  operador: true,  auditor: false, economico: false },
  { permiso: 'Registrar depósitos externos',      desc: 'Cupet/Refinería (iso tanque, etc.)', superadmin: true,  operador: false, auditor: false, economico: true  },
  { permiso: 'Ver y gestionar consumidores',      desc: 'Vehículos, equipos, almacenamiento', superadmin: true,  operador: true,  auditor: false, economico: false },
  { permiso: 'Ver reportes',                      desc: '',                                   superadmin: true,  operador: true,  auditor: true,  economico: true  },
  { permiso: 'Gestionar catálogo de conductores', desc: 'Crear y editar conductores',         superadmin: true,  operador: true,  auditor: false, economico: false },
  { permiso: 'Gestionar catálogos generales',     desc: 'Tipos, combustibles, tarjetas',      superadmin: true,  operador: false, auditor: false, economico: false },
  { permiso: 'Importar datos',                    desc: 'CSV / JSON masivo',                  superadmin: true,  operador: true,  auditor: false, economico: false },
  { permiso: 'Gestionar finanzas',                desc: 'Recargas, precios, saldos',          superadmin: true,  operador: false, auditor: false, economico: true  },
  { permiso: 'Eliminar registros',                desc: '',                                   superadmin: true,  operador: false, auditor: false, economico: false },
  { permiso: 'Panel de administración del sitio', desc: 'Este panel',                         superadmin: true,  operador: false, auditor: false, economico: false },
];

const AUD_PAGE = 50;

const ACTION_CFG = {
  CREATE:      { label: 'Creó',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  UPDATE:      { label: 'Editó',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  DELETE:      { label: 'Eliminó',    cls: 'bg-red-50 text-red-700 border-red-200' },
  ROLE_CHANGE: { label: 'Cambió rol', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
};

const ENTITY_ES = {
  Movimiento:        'Movimiento',
  Tarjeta:           'Tarjeta',
  Consumidor:        'Consumidor',
  TipoConsumidor:    'Tipo consumidor',
  TipoCombustible:   'Combustible',
  PrecioCombustible: 'Precio combustible',
  Conductor:         'Conductor',
  Vehiculo:          'Vehículo',
  ConfigAlerta:      'Alerta',
  UserRole:          'Rol usuario',
};

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1)  return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `Hace ${diffH}h`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' +
         d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function AdminPanel() {
  const { isSuperAdmin, loading } = useUserRole();
  const [tab, setTab] = useState('usuarios');

  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pending_users_count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      return count ?? 0;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="py-20 text-center space-y-3">
        <ShieldAlert className="w-12 h-12 text-red-300 mx-auto" />
        <p className="text-slate-500 text-sm">Acceso denegado. Solo superadmin puede acceder a este panel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center shadow-sm">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Administración del Sistema</h1>
          <p className="text-xs text-slate-400">Gestión de accesos, roles y trazabilidad. Visible solo para superadmin.</p>
        </div>
      </div>

      <div className="flex gap-0.5 flex-wrap border-b border-slate-200 dark:border-slate-700">
        {[
          { value: 'usuarios',  label: 'Usuarios',        icon: <Users       className="w-3.5 h-3.5" /> },
          { value: 'permisos',  label: 'Roles y Permisos', icon: <ShieldCheck className="w-3.5 h-3.5" /> },
          { value: 'auditoria', label: 'Auditoría',        icon: <Activity    className="w-3.5 h-3.5" /> },
        ].map(({ value: v, label, icon }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors -mb-px ${
              tab === v
                ? 'border-sky-500 text-sky-700 dark:text-sky-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {icon}{label}
            {v === 'usuarios' && pendingCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center bg-amber-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <Tabs value={tab}>
        <TabsContent value="usuarios"  className="mt-4"><UsuariosTab /></TabsContent>
        <TabsContent value="permisos"  className="mt-4"><PermisosTab /></TabsContent>
        <TabsContent value="auditoria" className="mt-4"><AuditoriaTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tab: Usuarios ────────────────────────────────────────────────────────────

function UsuariosTab() {
  const qc = useQueryClient();
  const [editing, setEditing]         = useState({});
  const [approving, setApproving]     = useState({});
  const [confirmDisable, setConfirmDisable] = useState(null);
  const [search, setSearch]           = useState('');

  const { data: users = [], isLoading, error: usersError } = useQuery({
    queryKey: ['admin_user_roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, email, full_name, role, status, created_date')
        .order('created_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    retry: 1,
    staleTime: 60_000,
  });

  const updateMut = useMutation({
    mutationFn: async ({ userId, role, newStatus }) => {
      const upd = { role };
      if (newStatus) upd.status = newStatus;
      const { error } = await supabase.from('user_roles').update(upd).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_, { userId, role, newStatus }) => {
      qc.invalidateQueries({ queryKey: ['admin_user_roles'] });
      qc.invalidateQueries({ queryKey: ['pending_users_count'] });
      setEditing(p => { const n = { ...p }; delete n[userId]; return n; });
      setApproving(p => { const n = { ...p }; delete n[userId]; return n; });
      toast.success(newStatus === 'active' ? 'Usuario aprobado' : 'Rol actualizado');
      const u = users.find(x => x.user_id === userId);
      logAudit({ action: 'ROLE_CHANGE', entityType: 'UserRole', entityId: userId, entityLabel: u?.email, metadata: { newRole: role, prevRole: u?.role, newStatus } });
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const setStatusMut = useMutation({
    mutationFn: async ({ userId, status }) => {
      const { error } = await supabase.from('user_roles').update({ status }).eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: (_, { userId, status }) => {
      qc.invalidateQueries({ queryKey: ['admin_user_roles'] });
      qc.invalidateQueries({ queryKey: ['pending_users_count'] });
      setConfirmDisable(null);
      toast.success(status === 'disabled' ? 'Usuario desactivado' : 'Usuario reactivado');
      const u = users.find(x => x.user_id === userId);
      logAudit({ action: 'ROLE_CHANGE', entityType: 'UserRole', entityId: userId, entityLabel: u?.email, metadata: { newStatus: status } });
    },
    onError: () => toast.error('Error al cambiar estado'),
  });

  const STATUS_ORDER = { pending: 0, active: 1, disabled: 2 };

  const filtered = [...users]
    .sort((a, b) => (STATUS_ORDER[a.status ?? 'active'] ?? 1) - (STATUS_ORDER[b.status ?? 'active'] ?? 1))
    .filter(u => !search || `${u.full_name || ''} ${u.email || ''}`.toLowerCase().includes(search.toLowerCase()));

  const pendingCount = users.filter(u => u.status === 'pending').length;
  const countByRole  = ROLES.reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r && u.status !== 'disabled').length;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* KPIs de roles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ROLES.map(r => {
          const m = ROLE_META[r];
          return (
            <Card key={r} className="border-0 shadow-sm">
              <CardContent className="p-3 flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-bold ${m.color}`}>
                  {countByRole[r] ?? 0}
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{m.label}</p>
                  <p className="text-xs text-slate-600">{countByRole[r] === 1 ? '1 usuario' : `${countByRole[r] ?? 0} usuarios`}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Banner pendientes */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl dark:bg-amber-950/20 dark:border-amber-800">
          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <span className="font-semibold">{pendingCount} usuario{pendingCount > 1 ? 's' : ''}</span> esperando aprobación
          </p>
        </div>
      )}

      {usersError && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-600">Error cargando usuarios. Verifique que la migración 2026-07-22 haya sido aplicada.</p>
        </div>
      )}

      {/* Lista */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 px-4 pt-3 flex flex-row items-center gap-3">
          <CardTitle className="text-sm font-semibold text-slate-600 flex-1">
            {filtered.length} usuario{filtered.length !== 1 ? 's' : ''}
          </CardTitle>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-8 h-7 text-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">Cargando usuarios...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Sin resultados</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(u => {
                const isPending   = u.status === 'pending';
                const isDisabled  = u.status === 'disabled';
                const isEditing   = !isPending && !isDisabled && u.user_id in editing;
                const isConfirming = confirmDisable === u.user_id;
                const m       = ROLE_META[u.role] ?? { label: u.role, color: 'bg-slate-100 text-slate-600' };
                const initial = (u.full_name || u.email || '?')[0].toUpperCase();
                const appRole = approving[u.user_id] ?? 'auditor';

                return (
                  <div
                    key={u.user_id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      isPending  ? 'bg-amber-50/50 dark:bg-amber-950/10' :
                      isDisabled ? 'opacity-50' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-slate-600">{initial}</span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate leading-tight">
                        {u.full_name || u.email}
                      </p>
                      {u.full_name && (
                        <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                      )}
                    </div>

                    {/* Controls */}
                    {isPending ? (
                      // ── Pending: select role + approve + reject ──
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        <Badge className="bg-amber-100 text-amber-700 border border-amber-200 text-[10px]">
                          <Clock className="w-2.5 h-2.5 mr-1" />Pendiente
                        </Badge>
                        <Select value={appRole} onValueChange={v => setApproving(p => ({ ...p, [u.user_id]: v }))}>
                          <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map(r => (
                              <SelectItem key={r} value={r}>{ROLE_META[r]?.label ?? r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon" className="h-7 w-7 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => updateMut.mutate({ userId: u.user_id, role: appRole, newStatus: 'active' })}
                          disabled={updateMut.isPending}
                          title="Aprobar acceso"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setStatusMut.mutate({ userId: u.user_id, status: 'disabled' })}
                          disabled={setStatusMut.isPending}
                          title="Rechazar solicitud"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : isDisabled ? (
                      // ── Disabled: show badge + reactivate ──
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-400">
                          Desactivado
                        </Badge>
                        <Button
                          size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => setStatusMut.mutate({ userId: u.user_id, status: 'active' })}
                          disabled={setStatusMut.isPending}
                        >
                          <UserCheck className="w-3 h-3 mr-1" />Reactivar
                        </Button>
                      </div>
                    ) : isEditing ? (
                      // ── Active, editing role ──
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Select
                          value={editing[u.user_id]}
                          onValueChange={v => setEditing(p => ({ ...p, [u.user_id]: v }))}
                        >
                          <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map(r => (
                              <SelectItem key={r} value={r}>{ROLE_META[r]?.label ?? r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon" className="h-7 w-7 bg-sky-600 hover:bg-sky-700"
                          onClick={() => updateMut.mutate({ userId: u.user_id, role: editing[u.user_id] })}
                          disabled={!editing[u.user_id] || updateMut.isPending}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setEditing(p => { const n = { ...p }; delete n[u.user_id]; return n; })}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : isConfirming ? (
                      // ── Active, confirming disable ──
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-red-600 dark:text-red-400">¿Desactivar?</span>
                        <Button
                          size="sm" variant="destructive" className="h-7 text-xs px-2"
                          onClick={() => setStatusMut.mutate({ userId: u.user_id, status: 'disabled' })}
                          disabled={setStatusMut.isPending}
                        >
                          Sí
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs px-2"
                          onClick={() => setConfirmDisable(null)}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      // ── Active, normal ──
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className={`text-[10px] ${m.color}`}>{m.label}</Badge>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-slate-600"
                          onClick={() => setEditing(p => ({ ...p, [u.user_id]: u.role }))}
                          title="Cambiar rol"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-slate-300 hover:text-red-500"
                          onClick={() => setConfirmDisable(u.user_id)}
                          title="Desactivar usuario"
                        >
                          <UserX className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Roles y Permisos ────────────────────────────────────────────────────

function PermisosTab() {
  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Permiso
                </th>
                {ROLES.map(r => {
                  const m = ROLE_META[r];
                  return (
                    <th key={r} className="text-center px-3 py-3">
                      <Badge variant="outline" className={`text-[10px] ${m.color}`}>{m.label}</Badge>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {PERMISOS_TABLA.map(p => (
                <tr key={p.permiso} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <p className="text-slate-700 font-medium">{p.permiso}</p>
                    {p.desc && <p className="text-[10px] text-slate-400">{p.desc}</p>}
                  </td>
                  {ROLES.map(r => (
                    <td key={r} className="px-3 py-2.5 text-center">
                      {p[r]
                        ? <span className="text-emerald-600 font-bold text-base leading-none">✓</span>
                        : <span className="text-slate-200 text-sm">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Tab: Auditoría ───────────────────────────────────────────────────────────

function AuditoriaTab() {
  const [page, setPage] = useState(1);
  const [filtroAction, setFiltroAction] = useState('all');
  const [filtroEntity, setFiltroEntity] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['audit_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayLogs = logs.filter(l => l.created_at?.startsWith(today));
  const kpi = { all: todayLogs.length, CREATE: 0, UPDATE: 0, DELETE: 0 };
  todayLogs.forEach(l => { if (l.action in kpi) kpi[l.action]++; });

  const entityTypes = [...new Set(logs.map(l => l.entity_type).filter(Boolean))].sort();

  const filtered = logs.filter(l => {
    if (filtroAction !== 'all' && l.action !== filtroAction) return false;
    if (filtroEntity !== 'all' && l.entity_type !== filtroEntity) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${l.user_name || ''} ${l.user_email || ''} ${l.entity_label || ''} ${l.entity_type || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / AUD_PAGE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * AUD_PAGE, safePage * AUD_PAGE);

  if (error) {
    return (
      <div className="py-10 text-center space-y-2">
        <p className="text-sm text-red-600 font-medium">Error cargando el log de auditoría.</p>
        <p className="text-xs text-slate-400">
          Verifique que la tabla <code className="bg-slate-100 px-1 rounded">audit_log</code> exista en Supabase y que las políticas RLS estén configuradas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs: actividad de hoy */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Eventos hoy',   value: kpi.all,    cls: 'bg-slate-50 border-slate-200 text-slate-700' },
          { label: 'Creaciones',    value: kpi.CREATE,  cls: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
          { label: 'Ediciones',     value: kpi.UPDATE,  cls: 'bg-amber-50 border-amber-100 text-amber-700' },
          { label: 'Eliminaciones', value: kpi.DELETE,  cls: 'bg-red-50 border-red-100 text-red-700' },
        ].map(k => (
          <div key={k.label} className={`rounded-xl border p-3 ${k.cls}`}>
            <p className="text-[10px] uppercase tracking-wide opacity-60">{k.label}</p>
            <p className="text-lg font-bold mt-0.5">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar usuario o entidad..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={filtroAction} onValueChange={v => { setFiltroAction(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            {Object.entries(ACTION_CFG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroEntity} onValueChange={v => { setFiltroEntity(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-40">
            <SelectValue placeholder="Entidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las entidades</SelectItem>
            {entityTypes.map(et => (
              <SelectItem key={et} value={et}>{ENTITY_ES[et] ?? et}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="pb-2 px-4 pt-3 flex flex-row items-center gap-2">
          <CardTitle className="text-sm font-semibold text-slate-600 flex-1">
            {filtered.length} evento{filtered.length !== 1 ? 's' : ''}
            {(filtroAction !== 'all' || filtroEntity !== 'all' || search) && (
              <span className="ml-1 text-slate-400 font-normal">· filtrado</span>
            )}
          </CardTitle>
          {totalPages > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="outline" size="icon" className="h-7 w-7"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-slate-500 tabular-nums px-1">{safePage}/{totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">Cargando auditoría...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Sin eventos registrados aún</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {paginated.map(log => {
                const cfg       = ACTION_CFG[log.action] ?? { label: log.action, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
                const isExp     = expandedId === log.id;
                const initial   = (log.user_name || log.user_email || '?')[0].toUpperCase();
                const hasDetail = log.payload || log.metadata;
                return (
                  <div key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-[11px] font-bold text-slate-600 shrink-0">
                        {initial}
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700">
                            {log.user_name || log.user_email || 'Sistema'}
                          </span>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${cfg.cls}`}>
                            {cfg.label}
                          </Badge>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {ENTITY_ES[log.entity_type] ?? log.entity_type}
                          </span>
                          {log.entity_label && (
                            <span className="text-xs text-slate-600 font-medium truncate">
                              · {log.entity_label}
                            </span>
                          )}
                        </div>
                        {log.user_name && log.user_email && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{log.user_email}</p>
                        )}
                      </div>
                      {/* Time + expand */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-slate-400 tabular-nums" title={log.created_at}>
                          {fmtTime(log.created_at)}
                        </span>
                        {hasDetail && (
                          <button
                            onClick={() => setExpandedId(isExp ? null : log.id)}
                            className="text-slate-300 hover:text-slate-500 transition-colors"
                            title="Ver detalle"
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExp ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Expanded detail */}
                    {isExp && (
                      <div className="px-4 pb-3 ml-10">
                        <div className="bg-slate-50 rounded-lg p-3 text-[10px] font-mono text-slate-600 overflow-x-auto max-h-52 overflow-y-auto space-y-2">
                          {log.metadata?.changes && (
                            <div>
                              <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-1 font-sans font-semibold">Campos modificados</p>
                              <pre className="whitespace-pre-wrap">{JSON.stringify(log.metadata.changes, null, 2)}</pre>
                            </div>
                          )}
                          {log.metadata?.newRole && (
                            <div>
                              <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-1 font-sans font-semibold">Cambio de rol</p>
                              <p>{log.metadata.prevRole} → {log.metadata.newRole}</p>
                            </div>
                          )}
                          {log.payload && (
                            <div>
                              <p className="text-[9px] uppercase tracking-wide text-slate-400 mb-1 font-sans font-semibold">
                                {log.action === 'DELETE' ? 'Registro eliminado' : 'Estado guardado'}
                              </p>
                              <pre className="whitespace-pre-wrap">{JSON.stringify(log.payload, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
