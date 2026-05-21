import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Warehouse } from 'lucide-react';
import { formatMonto } from '@/components/ui-helpers/SaldoUtils';
import CombustibleBadge from '@/components/ui-helpers/CombustibleBadge';
import { AUDITORIA_ESTADO } from './auditoriaCombustible';

const TIPO_CONFIG = {
  RECARGA:  { label: 'Recarga',  icon: ArrowUpCircle,   bg: 'bg-emerald-50', text: 'text-emerald-600', badge: 'border-emerald-200 text-emerald-700' },
  COMPRA:   { label: 'Compra',   icon: ArrowDownCircle, bg: 'bg-orange-50',  text: 'text-orange-600',  badge: 'border-orange-200 text-orange-700' },
  DESPACHO: { label: 'Despacho', icon: ArrowLeftRight,  bg: 'bg-purple-50',  text: 'text-purple-600',  badge: 'border-purple-200 text-purple-700' },
  DEPOSITO: { label: 'Depósito', icon: Warehouse,       bg: 'bg-teal-50',    text: 'text-teal-600',    badge: 'border-teal-200 text-teal-700' },
};

function Row({ label, value, highlight }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <div className={`flex justify-between items-start py-2.5 border-b border-slate-100 last:border-0 gap-4 ${highlight ? 'bg-amber-50/60 -mx-4 px-4 rounded' : ''}`}>
      <span className={`text-xs shrink-0 ${highlight ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>{label}</span>
      <span className={`text-sm font-medium text-right break-all ${highlight ? 'text-amber-900' : 'text-slate-800'}`}>{value}</span>
    </div>
  );
}

function Section({ title }) {
  return (
    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold pt-3 pb-1">{title}</p>
  );
}

export default function MovimientoDetalle({ movimiento: m, onClose }) {
  if (!m) return null;
  const cfg = TIPO_CONFIG[m.tipo] || TIPO_CONFIG.COMPRA;
  const Icon = cfg.icon;

  const auditoriaLabel = {
    [AUDITORIA_ESTADO.OK]:             'Sin inconsistencias',
    [AUDITORIA_ESTADO.EXCESO]:         'Exceso estimado vs capacidad',
    [AUDITORIA_ESTADO.SIN_CAPACIDAD]:  'Capacidad no registrada',
    [AUDITORIA_ESTADO.SIN_ESTIMACION]: 'Estimación no disponible',
  };

  return (
    <Dialog open={!!m} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg} ${cfg.text}`}>
              <Icon className="w-4 h-4" />
            </div>
            Detalle del movimiento
            <Badge variant="outline" className={`ml-auto text-[10px] py-0 px-2 border ${cfg.badge}`}>
              {cfg.label}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="mt-1 max-h-[70vh] overflow-y-auto -mx-1 px-1">

          {/* Referencia — si existe, va primero y resaltada */}
          {m.referencia && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-widest text-amber-600 font-semibold mb-0.5">Referencia</p>
              <p className="text-sm font-semibold text-amber-900 break-all">{m.referencia}</p>
            </div>
          )}

          {/* Datos principales */}
          <Section title="General" />
          <Row label="Fecha"       value={m.fecha} />
          <Row label="Combustible" value={m.combustible_nombre} />

          {/* DESPACHO */}
          {m.tipo === 'DESPACHO' && (
            <>
              <Section title="Origen → Destino" />
              <Row label="Origen (reserva)"      value={m.consumidor_origen_nombre || m.vehiculo_origen_chapa || 'Reserva'} />
              <Row label="Destino (consumidor)"  value={m.consumidor_nombre || m.vehiculo_chapa} />
              <Row label="Chapa / Código"         value={m.vehiculo_chapa} />
              <Row label="Litros despachados"    value={m.litros != null ? `${Number(m.litros).toFixed(2)} L` : null} />
              {m.nivel_tanque != null && (
                <Row label="Nivel tanque antes" value={`${Number(m.nivel_tanque).toFixed(1)} L`} />
              )}
            </>
          )}

          {/* COMPRA */}
          {m.tipo === 'COMPRA' && (
            <>
              <Section title="Abastecimiento" />
              <Row label="Tarjeta"           value={m.tarjeta_alias || m.tarjeta_id} />
              <Row label="Consumidor"        value={m.consumidor_nombre || m.vehiculo_chapa} />
              <Row label="Chapa / Código"     value={m.vehiculo_chapa} />
              <Row label="Litros"            value={m.litros != null ? `${Number(m.litros).toFixed(2)} L` : null} />
              <Row label="Precio por litro"  value={m.precio != null ? `$${Number(m.precio).toFixed(2)}/L` : null} />
              <Row label="Monto total"       value={m.monto != null ? formatMonto(m.monto) : null} />
              {m.nivel_tanque != null && (
                <Row label="Nivel tanque antes" value={`${Number(m.nivel_tanque).toFixed(1)} L`} />
              )}

              <Section title="Odómetro y consumo" />
              <Row label="Odómetro"          value={m.odometro != null ? `${m.odometro.toLocaleString()} km` : null} />
              <Row label="Km recorridos"     value={m.km_recorridos != null ? `${Number(m.km_recorridos).toFixed(0)} km` : null} />
              <Row label="Consumo real"      value={m.consumo_real != null ? `${Number(m.consumo_real).toFixed(2)} km/L` : null} />

              <Section title="Auditoría" />
              <Row label="Remanente estimado antes" value={m.remanente_estimado_antes != null ? `${Number(m.remanente_estimado_antes).toFixed(2)} L` : null} />
              <Row label="Combustible estimado post" value={m.combustible_estimado_post != null ? `${Number(m.combustible_estimado_post).toFixed(2)} L` : null} />
              <Row label="Capacidad tanque"  value={m.capacidad_tanque != null ? `${Number(m.capacidad_tanque).toFixed(0)} L` : null} />
              <Row label="Estado auditoría"  value={auditoriaLabel[m.auditoria_combustible_estado] || null} />
            </>
          )}

          {/* RECARGA */}
          {m.tipo === 'RECARGA' && (
            <>
              <Section title="Recarga" />
              <Row label="Tarjeta"        value={m.tarjeta_alias || m.tarjeta_id} />
              <Row label="Monto recargado" value={m.monto != null ? `+${formatMonto(m.monto)}` : null} />
            </>
          )}

          {/* DEPOSITO */}
          {m.tipo === 'DEPOSITO' && (
            <>
              <Section title="Depósito externo" />
              <Row label="Destino"              value={m.consumidor_nombre} />
              <Row label="Litros depositados"   value={m.litros != null ? `${Number(m.litros).toFixed(2)} L` : null} />
              <Row label="Monto (adquisición)"  value={m.monto != null ? formatMonto(m.monto) : null} />
              <Row label="Tarjeta de retiro"    value={m.tarjeta_alias || m.tarjeta_id} />
            </>
          )}

          {/* Referencia al final si no se mostró arriba (por si acaso no viene vacía aquí) */}
          {!m.referencia && (
            <Row label="Referencia" value={m.referencia} highlight />
          )}

          {/* Observaciones */}
          {m.observaciones && (
            <>
              <Section title="Observaciones" />
              <p className="text-xs text-slate-600 leading-relaxed pb-2">{m.observaciones}</p>
            </>
          )}

          {/* ID técnico */}
          <p className="text-[10px] text-slate-300 font-mono mt-3 select-all">{m.id}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
