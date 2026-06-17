import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, PackageCheck, CheckCircle2, XCircle } from 'lucide-react';

export const LEGACY_ESTADO = {
  RETIRADO: 'ENTREGADO',
  PAGADO:   'PAGADO_FINALIZADO',
  ANULADO:  'CANCELADO',
};

export const ESTADOS_VENTA = [
  { value: 'PENDIENTE',         label: 'Pendiente',         icon: Clock,        color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400' },
  { value: 'ENTREGADO',         label: 'Entregado',         icon: PackageCheck, color: 'bg-sky-50 text-sky-700 border-sky-200',             dot: 'bg-sky-400' },
  { value: 'PAGADO_FINALIZADO', label: 'Pagado-Finalizado', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
  { value: 'CANCELADO',         label: 'Cancelado',         icon: XCircle,      color: 'bg-rose-50 text-rose-400 border-rose-200',          dot: 'bg-rose-300' },
];

export function normalizeEstado(estado) {
  return LEGACY_ESTADO[estado] ?? estado;
}

export function getEstadoMeta(estado) {
  return ESTADOS_VENTA.find(e => e.value === normalizeEstado(estado)) ?? ESTADOS_VENTA[0];
}

export default function VentaEstadoBadge({ estado }) {
  const meta = getEstadoMeta(estado);
  const Icon = meta.icon;
  return (
    <Badge className={`text-[10px] py-0 px-1.5 border flex items-center gap-1 w-fit ${meta.color}`}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </Badge>
  );
}
