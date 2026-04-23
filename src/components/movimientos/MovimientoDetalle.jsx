import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpCircle, ArrowDownCircle, ArrowLeftRight } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import { AUDITORIA_ESTADO } from './auditoriaCombustible';

const TIPO_CONFIG = {
  RECARGA:  { label: 'Recarga',  icon: ArrowUpCircle,   bg: 'bg-emerald-50', text: 'text-emerald-600', badge: 'border-emerald-200 text-emerald-700' },
  COMPRA:   { label: 'Compra',   icon: ArrowDownCircle, bg: 'bg-orange-50',  text: 'text-orange-600',  badge: 'border-orange-200 text-orange-700' },
  DESPACHO: { label: 'Despacho', icon: ArrowLeftRight,  bg: 'bg-purple-50',  text: 'text-purple-600',  badge: 'border-purple-200 text-purple-700' },
};

function Row({ label, value }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-slate-100 last:border-0 gap-4">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-slate-800 font-medium text-right">{value}</span>
    </div>
  );
}

export default function MovimientoDetalle({ movimiento: m, onClose }) {
  if (!m) return null;
  const cfg = TIPO_CONFIG[m.tipo] || TIPO_CONFIG.COMPRA;
  const Icon = cfg.icon;
  const estadoAuditoriaLabel = {
    [AUDITORIA_ESTADO.OK]: 'Sin inconsistencias',
    [AUDITORIA_ESTADO.EXCESO]: 'Exceso estimado vs capacidad',
    [AUDITORIA_ESTADO.SIN_CAPACIDAD]: 'Capacidad no registrada',
    [AUDITORIA_ESTADO.SIN_ESTIMACION]: 'Estimación no disponible',
  };

  return (
    <Dialog open={!!m} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg} ${cfg.text}`}>
              <Icon className="w-4 h-4" />
            </div>
            Detalle del Movimiento
            <Badge variant="outline" className={`ml-auto text-[10px] py-0 px-2 border ${cfg.badge}`}>
              {cfg.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2">
          <Row label="Fecha" value={m.fecha} />
          <Row label="Combustible" value={m.combustible_nombre} />

          {m.tipo === 'DESPACHO' && (
            <>
              <Row label="Origen (Reserva)" value={m.consumidor_origen_nombre || m.vehiculo_origen_chapa || 'Reserva'} />
              <Row label="Destino (Consumidor)" value={m.consumidor_nombre || m.vehiculo_chapa} />
              <Row label="Litros despachados" value={m.litros != null ? `${Number(m.litros).toFixed(2)} L` : null} />
            </>
          )}

          {m.tipo === 'COMPRA' && (
            <>
              <Row label="Tarjeta" value={m.tarjeta_alias || m.tarjeta_id} />
              <Row label="Consumidor" value={m.consumidor_nombre || m.vehiculo_chapa} />
              <Row label="Litros" value={m.litros != null ? `${Number(m.litros).toFixed(2)} L` : null} />
              <Row label="Precio por litro" value={m.precio != null ? `$${Number(m.precio).toFixed(2)}/L` : null} />
              <Row label="Monto total" value={m.monto != null ? formatMonto(m.monto) : null} />
              <Row label="Remanente estimado antes" value={m.remanente_estimado_antes != null ? `${Number(m.remanente_estimado_antes).toFixed(2)} L` : null} />
              <Row label="Combustible estimado post" value={m.combustible_estimado_post != null ? `${Number(m.combustible_estimado_post).toFixed(2)} L` : null} />
              <Row label="Capacidad tanque" value={m.capacidad_tanque != null ? `${Number(m.capacidad_tanque).toFixed(2)} L` : null} />
              <Row label="Auditoría combustible" value={estadoAuditoriaLabel[m.auditoria_combustible_estado] || null} />
              <Row label="Odómetro" value={m.odometro != null ? `${m.odometro.toLocaleString()} km` : null} />
              <Row label="Km recorridos" value={m.km_recorridos != null ? `${Number(m.km_recorridos).toFixed(0)} km` : null} />
              <Row label="Consumo real" value={m.consumo_real != null ? `${Number(m.consumo_real).toFixed(2)} km/L` : null} />
            </>
          )}

          {m.tipo === 'RECARGA' && (
            <>
              <Row label="Tarjeta" value={m.tarjeta_alias || m.tarjeta_id} />
              <Row label="Monto recargado" value={m.monto != null ? `+${formatMonto(m.monto)}` : null} />
            </>
          )}

          <Row label="Referencia" value={m.referencia} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
