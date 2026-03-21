import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useUserRole } from '@/components/ui-helpers/useUserRole';

function parseNumber(value) {
  if (value == null) return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized || normalized === '#REF!' || normalized === '#N/A') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const [yy, mm, dd] = raw.split('/');
  if (!yy || !mm || !dd) return null;
  return `20${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function mapCsvLineToRecord(line) {
  const cols = line.split(',');
  if (cols.length < 15) return null;

  const record = {
    chapa: String(cols[0] || '').trim(),
    fecha: parseDate(cols[1]),
    combustible_litros_inicio: parseNumber(cols[2]),
    indice_consumo_fabricante_km: parseNumber(cols[3]),
    origen_entrada: String(cols[4] || '').trim() || null,
    combustible_litros_entrada: parseNumber(cols[6]),
    combustible_litros_consumo: parseNumber(cols[7]),
    final_en_tanque: parseNumber(cols[8]),
    odometro_inicio: parseNumber(cols[9]),
    odometro_final: parseNumber(cols[10]),
    km_recorrido: parseNumber(cols[11]),
    indice_consumo_momento_km: parseNumber(cols[12]),
    indice_consumo_acumulado: parseNumber(cols[13]),
    tipo_combustible: String(cols[14] || '').trim() || null,
    indice_consumo_real: parseNumber(cols[15]),
  };

  if (!record.chapa || !record.fecha) return null;
  return record;
}

export default function BitacoraConsumo() {
  const { canEdit } = useUserRole();
  const queryClient = useQueryClient();
  const [csvText, setCsvText] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['bitacora_consumo'],
    queryFn: () => base44.entities.BitacoraConsumo.list('-fecha', 500),
  });

  const importMutation = useMutation({
    mutationFn: async (inputCsv) => {
      const lines = String(inputCsv || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length <= 1) throw new Error('No hay filas para importar');

      const dataLines = lines.slice(1);
      const mapped = dataLines.map(mapCsvLineToRecord).filter(Boolean);
      if (mapped.length === 0) throw new Error('No se encontraron registros válidos');

      for (const item of mapped) {
        await base44.entities.BitacoraConsumo.create(item);
      }

      return mapped.length;
    },
    onSuccess: (count) => {
      toast.success(`Importación completada: ${count} registros`);
      setCsvText('');
      queryClient.invalidateQueries({ queryKey: ['bitacora_consumo'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'No se pudo importar la bitácora');
    },
  });

  const preview = useMemo(() => rows.slice(0, 20), [rows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Bitácora de Consumo</h1>
        <p className="text-xs text-slate-400">{rows.length} registros</p>
      </div>

      {canEdit && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Carga masiva por CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Pega aquí el contenido CSV con cabecera (Chapa, Fecha, Combustible litros / Inicio en Tanque, ...).
            </p>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              className="min-h-[220px] font-mono text-xs"
              placeholder="Chapa,Fecha,Combustible litros / Inicio en Tanque,..."
            />
            <Button onClick={() => importMutation.mutate(csvText)} disabled={importMutation.isPending || !csvText.trim()}>
              Importar contenido
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Vista rápida</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-slate-400 py-4">Cargando...</div>
          ) : preview.length === 0 ? (
            <div className="text-sm text-slate-400 py-4">Sin datos en bitácora.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-3">Chapa</th>
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Tipo combustible</th>
                    <th className="py-2 pr-3">Entrada (L)</th>
                    <th className="py-2 pr-3">Consumo (L)</th>
                    <th className="py-2 pr-3">Km recorridos</th>
                    <th className="py-2 pr-3">Índice real</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3">{r.chapa}</td>
                      <td className="py-2 pr-3">{r.fecha}</td>
                      <td className="py-2 pr-3">{r.tipo_combustible || '—'}</td>
                      <td className="py-2 pr-3">{r.combustible_litros_entrada ?? '—'}</td>
                      <td className="py-2 pr-3">{r.combustible_litros_consumo ?? '—'}</td>
                      <td className="py-2 pr-3">{r.km_recorrido ?? '—'}</td>
                      <td className="py-2 pr-3">{r.indice_consumo_real ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
