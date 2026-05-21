import React, { useState, useRef } from 'react';
import { Button }   from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge }    from "@/components/ui/badge";
import { toast }    from "sonner";
import { Upload, X, CheckCircle2, AlertTriangle, Navigation, ChevronDown, ChevronUp } from 'lucide-react';
import { parsearChatWhatsApp } from './parsearChat';

function esNoVehiculo(c) {
  const n = (c.tipo_consumidor_nombre || '').toLowerCase();
  return n.includes('tanque') || n.includes('reserva') || n.includes('almac') ||
         n.includes('equipo') || n.includes('planta') || n.includes('generador') || n.includes('grupo');
}

export default function ImportarChatPanel({ fechaVista, consumidores, rutasCatalogo, onImportar, onClose }) {
  const [fase, setFase]             = useState('input');
  const [texto, setTexto]           = useState('');
  const [registros, setRegistros]   = useState([]);
  const [aprobados, setAprobados]   = useState({});
  const [editKm, setEditKm]         = useState({});
  const [editLitros, setEditLitros] = useState({});
  const [editVehiculo, setEditVehiculo] = useState({});
  const [expandidos, setExpandidos] = useState({});
  const fileRef = useRef();

  const vehiculos = consumidores.filter(c => c.activo && !esNoVehiculo(c));

  const handleFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setTexto(ev.target.result || '');
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleParsear = () => {
    if (!texto.trim()) { toast.error('Pega o sube el chat primero'); return; }
    const todos = parsearChatWhatsApp(texto, rutasCatalogo, vehiculos);
    const filtrados = todos.filter(r => r.fecha === fechaVista);
    if (filtrados.length === 0) {
      toast.warning(`No se encontraron reportes para el ${fechaVista}. Verifica la fecha o el contenido del chat.`);
      return;
    }
    const apr = {};
    filtrados.forEach((_, i) => { apr[i] = true; });
    setRegistros(filtrados);
    setAprobados(apr);
    setEditKm({});
    setEditLitros({});
    setEditVehiculo({});
    setExpandidos({});
    setFase('review');
  };

  const handleConfirmar = () => {
    const payload = registros.flatMap((r, i) => {
      if (!aprobados[i]) return [];
      const vehId  = editVehiculo[i] || r.consumidor_id;
      const veh    = consumidores.find(c => c.id === vehId);
      const km     = editKm[i]     !== undefined ? (parseFloat(editKm[i])     || null) : r.km_total;
      const litros = editLitros[i] !== undefined ? (parseFloat(editLitros[i]) || null) : r.litros;

      const base = {
        fecha:             fechaVista,
        consumidor_id:     vehId || null,
        consumidor_nombre: veh?.nombre || r.consumidor_nombre || r.chapa,
        fuente:            'chat',
        estado:            'completada',
        observaciones:     `Chat: ${r.conductor_texto}`,
      };

      if (r.rutas.length > 0) {
        return r.rutas.map(ruta => {
          const litrosRuta = litros && km ? parseFloat(((ruta.km / km) * litros).toFixed(2)) : null;
          return {
            ...base,
            ruta_id:                ruta.ruta_id,
            tipo_viaje:             ruta.ruta_id ? 'regular' : 'viaje_extra',
            descripcion_emergencia: ruta.ruta_id ? null : ruta.texto_original,
            km_reales:              ruta.km,
            litros_estimados:       litrosRuta,
          };
        });
      }

      return [{
        ...base,
        ruta_id:                null,
        tipo_viaje:             'viaje_extra',
        descripcion_emergencia: `Chat ${r.chapa}`,
        km_reales:              km,
        litros_estimados:       litros,
      }];
    });

    if (payload.length === 0) { toast.error('No hay registros aprobados'); return; }
    onImportar(payload);
  };

  if (fase === 'input') {
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
            <Upload className="w-4 h-4 text-sky-500" />
            Importar desde chat WhatsApp
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Pega el texto del grupo de WhatsApp o sube el archivo <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">.txt</code> exportado. Solo se importarán los mensajes del <span className="font-semibold">{fechaVista}</span>.
        </p>
        <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2 leading-relaxed">
          Formato esperado por mensaje: chapa + rutas con km + total km + litros estimados.<br />
          Ej: <em>Chapa W004399 · Ruta Polígono: 32km · Total: 32km · Litros: 8</em>
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3 h-3" />
              Subir .txt
            </Button>
            <span className="text-xs text-slate-400">o pega el texto abajo</span>
            <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleFile} />
          </div>
          <Textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder={"14/05/2026, 07:30 a. m. - Juan Pérez: Buenos días.\nChapa W004399\nRuta Polígono: 32 km\nTotal: 32 km\nLitros: 8"}
            rows={7}
            className="text-xs font-mono resize-none"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="bg-sky-600 hover:bg-sky-700 gap-1.5" onClick={handleParsear}>
            Analizar chat
          </Button>
        </div>
      </div>
    );
  }

  const totalAprobados = Object.values(aprobados).filter(Boolean).length;

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-sky-500" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {registros.length} conductor{registros.length !== 1 ? 'es' : ''} detectado{registros.length !== 1 ? 's' : ''} — revisa antes de confirmar
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {registros.map((r, i) => {
          const vehId  = editVehiculo[i] || r.consumidor_id;
          const veh    = consumidores.find(c => c.id === vehId);
          const kmVal  = editKm[i]     !== undefined ? editKm[i]     : (r.km_total ?? '');
          const litVal = editLitros[i] !== undefined ? editLitros[i] : (r.litros   ?? '');
          const apr    = !!aprobados[i];
          const expand = !!expandidos[i];

          return (
            <div key={i} className={`p-3 transition-opacity ${apr ? '' : 'opacity-40'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="checkbox"
                  checked={apr}
                  onChange={e => setAprobados(p => ({ ...p, [i]: e.target.checked }))}
                  className="w-4 h-4 accent-sky-600 shrink-0"
                />
                <Badge variant="outline" className={`text-[10px] shrink-0 font-mono ${r.consumidor_id ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {r.chapa}
                </Badge>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{r.conductor_texto}</span>
                {r.rutas.length > 0 && (
                  <span className="text-[10px] text-sky-600 font-medium">
                    {r.rutas.length} ruta{r.rutas.length !== 1 ? 's' : ''}
                  </span>
                )}
                {!r.consumidor_id && (
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                    <AlertTriangle className="w-2.5 h-2.5 mr-1" />Sin vehículo
                  </Badge>
                )}
                <button
                  onClick={() => setExpandidos(p => ({ ...p, [i]: !p[i] }))}
                  className="ml-auto text-slate-400 hover:text-slate-600"
                >
                  {expand ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px] text-slate-400">Vehículo</Label>
                  <Select
                    value={vehId || '_none'}
                    onValueChange={v => setEditVehiculo(p => ({ ...p, [i]: v === '_none' ? '' : v }))}
                  >
                    <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Sin asignar</SelectItem>
                      {vehiculos.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre}{c.codigo_interno ? ` · ${c.codigo_interno}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Km totales</Label>
                  <Input
                    type="number" step="0.1" min="0"
                    value={kmVal}
                    onChange={e => setEditKm(p => ({ ...p, [i]: e.target.value }))}
                    className="h-7 text-xs mt-0.5"
                    placeholder="—"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Litros est.</Label>
                  <Input
                    type="number" step="0.1" min="0"
                    value={litVal}
                    onChange={e => setEditLitros(p => ({ ...p, [i]: e.target.value }))}
                    className="h-7 text-xs mt-0.5"
                    placeholder="—"
                  />
                </div>
              </div>

              {expand && (
                <div className="mt-2 pl-6 space-y-1.5">
                  {r.rutas.length > 0 ? (
                    r.rutas.map((rt, j) => (
                      <div key={j} className="flex items-center gap-2 text-xs">
                        <Navigation className={`w-3 h-3 shrink-0 ${rt.matched ? 'text-emerald-500' : 'text-amber-400'}`} />
                        <span className="text-slate-600 dark:text-slate-300 flex-1">{rt.ruta_nombre}</span>
                        <span className="text-sky-600 font-medium tabular-nums">{rt.km} km</span>
                        {!rt.matched && (
                          <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-600 border-amber-200">No mapeado</Badge>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400 italic">Sin rutas detectadas — se creará un viaje extra</p>
                  )}
                  <p className="text-[10px] text-slate-300 font-mono leading-relaxed whitespace-pre-wrap mt-1 border-t border-slate-50 dark:border-slate-800 pt-1">
                    {r.texto_mensaje}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">
        <span className="text-xs text-slate-500">
          {totalAprobados} de {registros.length} seleccionado{totalAprobados !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setFase('input')}>Volver</Button>
          <Button
            size="sm"
            className="bg-sky-600 hover:bg-sky-700 gap-1.5"
            onClick={handleConfirmar}
            disabled={totalAprobados === 0}
          >
            <CheckCircle2 className="w-3 h-3" />
            Confirmar{totalAprobados > 0 ? ` (${totalAprobados})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
