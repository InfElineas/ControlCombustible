import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { gpsApi, metersToKm } from '@/api/gpsClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Satellite, RefreshCw, Link2, Link2Off, Car, CheckCircle2, AlertTriangle } from 'lucide-react';

function esVehiculo(c) {
  const n = (c.tipo_consumidor_nombre || '').toLowerCase();
  return n.includes('veh');
}

export default function GpsDevicePanel() {
  const queryClient = useQueryClient();
  const [loadingGps, setLoadingGps] = useState(false);
  const [gpsDevices, setGpsDevices] = useState(null);
  const [gpsError, setGpsError]     = useState(null);

  const { data: consumidores = [] } = useQuery({
    queryKey: ['consumidores'],
    queryFn: () => base44.entities.Consumidor.list(),
  });

  const vehiculos = consumidores.filter(esVehiculo);

  // Cargar dispositivos GPS desde Traccar
  const loadGpsDevices = async () => {
    setLoadingGps(true);
    setGpsError(null);
    try {
      const devices = await gpsApi.devices();
      setGpsDevices(devices);
    } catch (err) {
      setGpsError(err.message);
      toast.error(`Error al conectar con GPS: ${err.message}`);
    } finally {
      setLoadingGps(false);
    }
  };

  // Guardar mapeo deviceId ↔ consumidor
  const updateMut = useMutation({
    mutationFn: ({ id, gps_device_id }) =>
      base44.entities.Consumidor.update(id, { gps_device_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consumidores'] });
      toast.success('Vínculo GPS actualizado');
    },
    onError: () => toast.error('Error al guardar'),
  });

  const handleChange = (consumidorId, rawVal) => {
    const gps_device_id = rawVal === '_none' ? null : Number(rawVal);
    updateMut.mutate({ id: consumidorId, gps_device_id });
  };

  // Estadísticas rápidas de cobertura
  const vinculados  = vehiculos.filter(v => v.gps_device_id != null).length;
  const sinVincular = vehiculos.length - vinculados;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Satellite className="w-4 h-4 text-sky-500" />
              Vinculación GPS — Traccar
            </CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              Asocia cada vehículo con su dispositivo GPS en AsTrack.
            </p>
          </div>
          <Button
            size="sm" variant="outline"
            className="gap-1.5 text-xs"
            onClick={loadGpsDevices}
            disabled={loadingGps}
          >
            {loadingGps
              ? <RefreshCw className="w-3 h-3 animate-spin" />
              : <Satellite className="w-3 h-3" />
            }
            {gpsDevices ? 'Actualizar GPS' : 'Cargar dispositivos GPS'}
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" />
              <b>{vinculados}</b> vinculados
            </span>
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="w-3 h-3" />
              <b>{sinVincular}</b> sin vincular
            </span>
            {gpsDevices && (
              <span className="flex items-center gap-1 text-sky-600">
                <Satellite className="w-3 h-3" />
                <b>{gpsDevices.length}</b> dispositivos GPS disponibles
              </span>
            )}
          </div>

          {gpsError && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {gpsError}
            </div>
          )}

          {!gpsDevices && !gpsError && (
            <p className="mt-3 text-xs text-slate-400 italic">
              Haz clic en "Cargar dispositivos GPS" para obtener la lista de Traccar y vincularla con los vehículos.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabla de mapeo */}
      {vehiculos.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {vehiculos.map(v => {
                const device = gpsDevices?.find(d => d.id === v.gps_device_id);
                const hasLink = v.gps_device_id != null;

                return (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                    {/* Vehículo */}
                    <div className="flex items-center gap-2 w-48 shrink-0">
                      <Car className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{v.nombre}</p>
                        {v.codigo_interno && (
                          <p className="text-[10px] text-slate-400">{v.codigo_interno}</p>
                        )}
                      </div>
                    </div>

                    {/* Estado vínculo */}
                    <div className="w-28 shrink-0">
                      {hasLink ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-600 border-emerald-200 gap-1">
                          <Link2 className="w-2.5 h-2.5" />
                          ID {v.gps_device_id}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-400 border-slate-200 gap-1">
                          <Link2Off className="w-2.5 h-2.5" />
                          Sin GPS
                        </Badge>
                      )}
                    </div>

                    {/* Nombre del dispositivo si está vinculado */}
                    <div className="flex-1 min-w-0 text-xs text-slate-500 truncate">
                      {device
                        ? <span className="text-sky-700 font-medium">{device.name}</span>
                        : hasLink
                          ? <span className="text-amber-500 italic">Dispositivo no encontrado en Traccar</span>
                          : null
                      }
                    </div>

                    {/* Selector */}
                    <div className="w-52 shrink-0">
                      <Select
                        value={v.gps_device_id != null ? String(v.gps_device_id) : '_none'}
                        onValueChange={val => handleChange(v.id, val)}
                        disabled={!gpsDevices}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={gpsDevices ? 'Seleccionar dispositivo...' : 'Carga los dispositivos primero'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Sin dispositivo GPS</SelectItem>
                          {(gpsDevices ?? [])
                            .filter(d => {
                              const usadoPor = vehiculos.find(o => o.id !== v.id && o.gps_device_id === d.id);
                              return !usadoPor;
                            })
                            .map(d => (
                              <SelectItem key={d.id} value={String(d.id)}>
                                {d.name}
                                {d.uniqueId ? ` · ${d.uniqueId}` : ''}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Nota sobre despliegue */}
      <p className="text-[11px] text-slate-400 px-1">
        Para que este panel funcione, la Edge Function <code>gps-proxy</code> debe estar desplegada en Supabase con las variables
        <code>TRACCAR_EMAIL</code> y <code>TRACCAR_PASSWORD</code> configuradas como secrets.
      </p>
    </div>
  );
}
