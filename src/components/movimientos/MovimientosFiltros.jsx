import React, { useMemo } from 'react';
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X } from 'lucide-react';

const EMPTY = { fechaDesde: '', fechaHasta: '', tipo: 'all', tipoConsumidor: 'all', consumidor: 'all', tipoCombustible: 'all', tarjeta: 'all', chapa: '' };

export default function MovimientosFiltros({ filters, onChange, consumidores, tiposConsumidor, combustibles, tarjetas }) {
  // Consumidores filtrados por tipo seleccionado
  const consumidoresFiltrados = useMemo(() => {
    if (filters.tipoConsumidor === 'all') return consumidores;
    return consumidores.filter(c => c.tipo_consumidor_id === filters.tipoConsumidor);
  }, [consumidores, filters.tipoConsumidor]);

  const hasActive = Object.entries(filters).some(([k, v]) => v && v !== 'all');
  const activeCount = Object.entries(filters).filter(([k, v]) => v && v !== 'all').length;

  const set = (key, value) => {
    // Si cambia el tipo de consumidor, resetear el consumidor seleccionado
    if (key === 'tipoConsumidor') {
      onChange({ ...filters, tipoConsumidor: value, consumidor: 'all' });
    } else {
      onChange({ ...filters, [key]: value });
    }
  };

  const clear = () => onChange(EMPTY);

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 space-y-3">
        {/* Fila 1: Fechas + Tipo movimiento */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-slate-500 font-medium">Fecha desde</label>
            <Input type="date" value={filters.fechaDesde} onChange={e => set('fechaDesde', e.target.value)} className="mt-1 text-xs h-8" />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Fecha hasta</label>
            <Input type="date" value={filters.fechaHasta} onChange={e => set('fechaHasta', e.target.value)} className="mt-1 text-xs h-8" />
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Tipo de movimiento</label>
            <Select value={filters.tipo} onValueChange={v => set('tipo', v)}>
              <SelectTrigger className="mt-1 text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="RECARGA">🟢 Recarga</SelectItem>
                <SelectItem value="COMPRA">🟠 Compra</SelectItem>
                <SelectItem value="DESPACHO">🟣 Despacho</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Tarjeta</label>
            <Select value={filters.tarjeta} onValueChange={v => set('tarjeta', v)}>
              <SelectTrigger className="mt-1 text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {tarjetas.map(t => <SelectItem key={t.id} value={t.id}>{t.alias || t.id_tarjeta}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Fila 2: Consumidor (tipo → subtipo) + Combustible */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-slate-500 font-medium">Tipo de consumidor</label>
            <Select value={filters.tipoConsumidor} onValueChange={v => set('tipoConsumidor', v)}>
              <SelectTrigger className="mt-1 text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {tiposConsumidor.map(t => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium flex items-center gap-1">
              Consumidor
              {filters.tipoConsumidor !== 'all' && (
                <Badge className="text-[9px] py-0 px-1.5 bg-sky-100 text-sky-600 border-0 font-normal">
                  {tiposConsumidor.find(t => t.id === filters.tipoConsumidor)?.nombre}
                </Badge>
              )}
            </label>
            <Select value={filters.consumidor} onValueChange={v => set('consumidor', v)}>
              <SelectTrigger className="mt-1 text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {consumidoresFiltrados.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Combustible</label>
            <Select value={filters.tipoCombustible} onValueChange={v => set('tipoCombustible', v)}>
              <SelectTrigger className="mt-1 text-xs h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {combustibles.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-slate-500 font-medium">Chapa</label>
            <Input
              value={filters.chapa || ''}
              onChange={e => set('chapa', e.target.value)}
              className="mt-1 text-xs h-8"
              placeholder="Ej: B123456"
            />
          </div>
        </div>

        {/* Limpiar */}
        {hasActive && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
            <span className="text-xs text-slate-400">{activeCount} filtro{activeCount !== 1 ? 's' : ''} activo{activeCount !== 1 ? 's' : ''}</span>
            <Button variant="ghost" size="sm" onClick={clear} className="text-xs text-slate-500 h-7 gap-1">
              <X className="w-3 h-3" /> Limpiar filtros
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { EMPTY as FILTROS_INICIAL };
