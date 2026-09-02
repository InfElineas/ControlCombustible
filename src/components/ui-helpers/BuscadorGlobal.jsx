import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Truck, UserCheck, Users, CornerDownLeft } from 'lucide-react';
import { createPageUrl } from '@/utils';

// Busca entre vehículos, tanques, conductores y trabajadores.
//
// Trabaja sobre las listas que la aplicación ya tiene cargadas, que son las
// mismas que se guardan para consultar sin conexión: así el buscador sigue
// funcionando en la APK sin red y no añade peticiones al abrirlo.
export default function BuscadorGlobal({ abierto, onCerrar }) {
  const navigate = useNavigate();
  const [texto, setTexto] = useState('');

  const { data: consumidores = [] } = useQuery({
    queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list(),
    staleTime: 5 * 60_000, enabled: abierto,
  });
  const { data: conductores = [] } = useQuery({
    queryKey: ['conductores'], queryFn: () => base44.entities.Conductor.list(),
    staleTime: 5 * 60_000, enabled: abierto,
  });
  const { data: beneficiarios = [] } = useQuery({
    queryKey: ['beneficiarios'], queryFn: () => base44.entities.Beneficiario.list('nombre', 2000),
    staleTime: 5 * 60_000, enabled: abierto,
  });

  useEffect(() => { if (!abierto) setTexto(''); }, [abierto]);

  const resultados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (q.length < 2) return [];
    const coincide = (...campos) => campos.some(c => (c || '').toLowerCase().includes(q));

    const items = [];
    consumidores.filter(c => coincide(c.nombre, c.codigo_interno, c.responsable)).slice(0, 6)
      .forEach(c => items.push({
        id: `c-${c.id}`, icono: Truck, titulo: c.nombre,
        detalle: [c.codigo_interno, c.tipo_consumidor_nombre, c.combustible_nombre].filter(Boolean).join(' · '),
        grupo: 'Vehículos y tanques',
        ir: () => navigate(`${createPageUrl('Movimientos')}?consumidor=${c.id}`),
      }));
    conductores.filter(c => coincide(c.nombre, c.ci, c.area_centro)).slice(0, 4)
      .forEach(c => items.push({
        id: `d-${c.id}`, icono: UserCheck, titulo: c.nombre,
        detalle: [c.ci, c.area_centro].filter(Boolean).join(' · '),
        grupo: 'Conductores',
        ir: () => navigate(createPageUrl('Catalogos')),
      }));
    beneficiarios.filter(b => coincide(b.nombre, b.ci, b.area)).slice(0, 6)
      .forEach(b => items.push({
        id: `b-${b.id}`, icono: Users, titulo: b.nombre,
        detalle: [b.ci, b.area].filter(Boolean).join(' · '),
        grupo: 'Trabajadores',
        ir: () => navigate(createPageUrl('Ventas')),
      }));
    return items;
  }, [texto, consumidores, conductores, beneficiarios, navigate]);

  const grupos = useMemo(() => {
    const m = {};
    resultados.forEach(r => { (m[r.grupo] ||= []).push(r); });
    return Object.entries(m);
  }, [resultados]);

  const abrir = (item) => { item.ir(); onCerrar(); };

  return (
    <Dialog open={abierto} onOpenChange={a => { if (!a) onCerrar(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 top-[12%] translate-y-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <Input
            autoFocus
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && resultados.length) abrir(resultados[0]); }}
            placeholder="Buscar vehículo, tanque, conductor o trabajador…"
            className="border-0 shadow-none focus-visible:ring-0 px-0 h-8 text-sm"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {texto.trim().length < 2 && (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">
              Escribe al menos dos letras para buscar.
            </p>
          )}
          {texto.trim().length >= 2 && resultados.length === 0 && (
            <p className="px-4 py-6 text-xs text-slate-400 text-center">
              Nada coincide con «{texto.trim()}».
            </p>
          )}
          {grupos.map(([grupo, items]) => (
            <div key={grupo} className="py-1">
              <p className="px-4 py-1 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{grupo}</p>
              {items.map(item => (
                <button
                  key={item.id} type="button" onClick={() => abrir(item)}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <item.icono className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-700 dark:text-slate-200 truncate">{item.titulo}</span>
                    {item.detalle && <span className="block text-[11px] text-slate-400 truncate">{item.detalle}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {resultados.length > 0 && (
            <p className="px-4 py-2 text-[10px] text-slate-400 flex items-center gap-1 border-t border-slate-100 dark:border-slate-800 mt-1">
              <CornerDownLeft className="w-3 h-3" /> Intro abre el primer resultado
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
