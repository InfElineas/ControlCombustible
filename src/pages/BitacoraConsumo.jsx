import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useUserRole } from '@/components/ui-helpers/useUserRole';

let sheetJsPromise = null;

function loadSheetJs() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Navegador no disponible'));
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;

  sheetJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js';
    script.async = true;
    script.onload = () => {
      if (window.XLSX) resolve(window.XLSX);
      else reject(new Error('No se pudo cargar el parser XLSX'));
    };
    script.onerror = () => reject(new Error('Error cargando librería XLSX desde CDN'));
    document.body.appendChild(script);
  });

  return sheetJsPromise;
}

function parseNumber(value) {
  if (value == null) return null;
  const normalized = String(value).trim().replace(',', '.');
  if (!normalized || normalized === '#REF!' || normalized === '#N/A') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsedDate = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    return parsedDate.toISOString().slice(0, 10);
  }

  const raw = String(value || '').trim();
  if (!raw) return null;
  const [yy, mm, dd] = raw.split('/');
  if (!yy || !mm || !dd) return null;
  return `20${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function mapColumnsToRecord(cols = []) {
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

function mapCsvLineToRecord(line) {
  return mapColumnsToRecord(line.split(','));
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

  const importFileMutation = useMutation({
    mutationFn: async (file) => {
      if (!file) throw new Error('Selecciona un archivo primero');
      const name = file.name.toLowerCase();

      let mapped = [];

      if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
        const text = await file.text();
        const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
        if (lines.length <= 1) throw new Error('No hay filas para importar');
        mapped = lines.slice(1).map(mapCsvLineToRecord).filter(Boolean);
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) {
        const XLSX = await loadSheetJs();
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) throw new Error('El archivo no tiene hojas');
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, raw: true });
        if (!Array.isArray(rows) || rows.length <= 1) throw new Error('No hay filas para importar');
        mapped = rows.slice(1).map(mapColumnsToRecord).filter(Boolean);
      } else {
        throw new Error('Formato no soportado. Usa CSV, TXT, TSV, XLS, XLSX u ODS.');
      }

      if (mapped.length === 0) throw new Error('No se encontraron registros válidos');

      for (const item of mapped) {
        await base44.entities.BitacoraConsumo.create(item);
      }
      return mapped.length;
    },
    onSuccess: (count) => {
      toast.success(`Archivo importado: ${count} registros`);
      queryClient.invalidateQueries({ queryKey: ['bitacora_consumo'] });
    },
    onError: (error) => {
      toast.error(error?.message || 'No se pudo importar el archivo');
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
            <div className="border-t pt-3">
              <p className="text-xs text-slate-500 mb-2">O importa un archivo (CSV, TXT, TSV, XLS, XLSX, ODS).</p>
              <input
                type="file"
                accept=".csv,.txt,.tsv,.xls,.xlsx,.ods"
                onChange={(e) => importFileMutation.mutate(e.target.files?.[0])}
                disabled={importFileMutation.isPending}
                className="text-xs"
              />
            </div>
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
