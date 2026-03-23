import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import ImportGuide from '@/components/configuracion/ImportGuide';
import ImportResultsTable from '@/components/configuracion/ImportResultsTable';
import { Upload, FileJson, FileSpreadsheet, FileText, CircleAlert, CircleX, CircleCheck } from 'lucide-react';

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
  const raw = String(value).trim();
  if (!raw || raw === '#REF!' || raw === '#N/A') return null;

  const compact = raw.replace(/\s+/g, '');
  const hasComma = compact.includes(',');
  const hasDot = compact.includes('.');
  let normalized = compact;

  if (hasComma && hasDot) {
    const lastComma = compact.lastIndexOf(',');
    const lastDot = compact.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = compact.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = compact.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaGroups = compact.match(/,/g)?.length || 0;
    if (commaGroups > 1) {
      normalized = compact.replace(/,/g, '');
    } else {
      const [left = '', right = ''] = compact.split(',');
      normalized = right.length === 3 ? `${left}${right}` : `${left}.${right}`;
    }
  }

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

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashParts = raw.split('/');
  if (slashParts.length !== 3) return null;

  let year;
  let month;
  let day;

  if (slashParts[0].length === 4) {
    [year, month, day] = slashParts;
  } else if (slashParts[2].length === 4) {
    [day, month, year] = slashParts;
  } else {
    const [a, b, c] = slashParts;
    if (Number(c) > 31) {
      [day, month, year] = slashParts;
    } else {
      year = `20${a}`;
      month = b;
      day = c;
    }
  }

  if (!year || !month || !day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeHeaderToken(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildHeaderLookup(headers = []) {
  const tokenToIndex = {};
  headers.forEach((header, index) => {
    const token = normalizeHeaderToken(header);
    if (token) tokenToIndex[token] = index;
  });

  const findIndex = (candidates) => {
    for (const candidate of candidates) {
      const exact = tokenToIndex[candidate];
      if (Number.isInteger(exact)) return exact;
    }
    const entries = Object.entries(tokenToIndex);
    for (const candidate of candidates) {
      const partial = entries.find(([token]) => token.includes(candidate));
      if (partial) return partial[1];
    }
    return -1;
  };

  return {
    fecha: findIndex(['fecha']),
    chapa: findIndex(['chapa', 'vehiculo', 'vehculo']),
    tipo_combustible: findIndex(['tipodecombustible', 'combustible']),
    accion: findIndex(['accion']),
    combustible_litros_inicio: findIndex(['inicio']),
    origen_entrada: findIndex(['tarjeta', 'tarjetas', 'origen']),
    combustible_litros_entrada: findIndex(['entradacantidad', 'cargal', 'recargal']),
    combustible_litros_consumo: findIndex(['salidacantidad', 'salidacantida', 'compral']),
    final_en_tanque: findIndex(['existenciacant', 'exitenciacant']),
  };
}

function mapColumnsToRecord(cols = [], headerLookup = null) {
  if (headerLookup) {
    const pick = (index) => (index >= 0 ? cols[index] : null);
    const action = String(pick(headerLookup.accion) || '').trim().toUpperCase();
    const isRecharge = action === 'RECARGA' || action === 'CARGA';

    const record = {
      chapa: String(pick(headerLookup.chapa) || '').trim(),
      fecha: parseDate(pick(headerLookup.fecha)),
      combustible_litros_inicio: parseNumber(pick(headerLookup.combustible_litros_inicio)),
      indice_consumo_fabricante_km: null,
      origen_entrada: String(pick(headerLookup.origen_entrada) || '').trim() || null,
      combustible_litros_entrada: isRecharge ? parseNumber(pick(headerLookup.combustible_litros_entrada)) : null,
      combustible_litros_consumo: isRecharge ? null : parseNumber(pick(headerLookup.combustible_litros_consumo)),
      final_en_tanque: parseNumber(pick(headerLookup.final_en_tanque)),
      odometro_inicio: null,
      odometro_final: null,
      km_recorrido: null,
      indice_consumo_momento_km: null,
      indice_consumo_acumulado: null,
      tipo_combustible: String(pick(headerLookup.tipo_combustible) || '').trim() || null,
      indice_consumo_real: null,
      _accion: action || (isRecharge ? 'RECARGA' : 'COMPRA'),
    };

    if (!record.fecha || (!record.chapa && !record.origen_entrada)) return null;
    if (!record.chapa) record.chapa = String(record.origen_entrada || '').trim();
    if (!record.chapa) return null;
    return record;
  }

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

function mapObjectToRecord(raw = {}) {
  const normalized = {};
  Object.entries(raw || {}).forEach(([key, value]) => {
    normalized[normalizeHeaderToken(key)] = value;
  });

  const action = String(normalized.accion || '').trim().toUpperCase();
  const isRecharge = action === 'RECARGA' || action === 'CARGA';
  const origen = normalized.tarjeta ?? normalized.tarjetas ?? normalized.origen;
  const chapa = normalized.chapa ?? normalized.vehiculo ?? normalized.vehculo ?? origen;

  const record = {
    chapa: String(chapa || '').trim(),
    fecha: parseDate(normalized.fecha),
    combustible_litros_inicio: parseNumber(normalized.inicio),
    indice_consumo_fabricante_km: null,
    origen_entrada: String(origen || '').trim() || null,
    combustible_litros_entrada: isRecharge ? parseNumber(normalized.cargal ?? normalized.recargal) : null,
    combustible_litros_consumo: isRecharge ? null : parseNumber(normalized.compral ?? normalized.salidacantidad),
    final_en_tanque: parseNumber(normalized.existenciacant ?? normalized.exitenciacant),
    odometro_inicio: null,
    odometro_final: null,
    km_recorrido: null,
    indice_consumo_momento_km: null,
    indice_consumo_acumulado: null,
    tipo_combustible: String(normalized.tipocombustible || normalized.combustible || '').trim() || null,
    indice_consumo_real: null,
    _accion: action || (isRecharge ? 'RECARGA' : 'COMPRA'),
  };

  if (!record.fecha || !record.chapa) return null;
  return record;
}

function sanitizeRecordForCreate(record) {
  const { _accion, ...clean } = record || {};
  return clean;
}

export default function Configuracion() {
  const { canEdit } = useUserRole();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewRows, setPreviewRows] = useState([]);
  const fileInputRef = useRef(null);

  const { data: tarjetas = [] } = useQuery({
    queryKey: ['tarjetas-import-ref'],
    queryFn: () => base44.entities.Tarjeta.list('-created_date', 1000),
  });
  const { data: vehiculos = [] } = useQuery({
    queryKey: ['vehiculos-import-ref'],
    queryFn: () => base44.entities.Vehiculo.list('-created_date', 1000),
  });
  const { data: combustibles = [] } = useQuery({
    queryKey: ['combustibles-import-ref'],
    queryFn: () => base44.entities.Combustible.list('-created_date', 200),
  });

  function splitCsvLine(line, delimiter = ',') {
    const result = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && insideQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        insideQuotes = !insideQuotes;
        continue;
      }

      if (char === delimiter && !insideQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  function detectDelimiter(headerLine = '') {
    const delimiters = [',', ';', '\t'];
    const scored = delimiters.map((d) => ({ d, count: splitCsvLine(headerLine, d).length }));
    scored.sort((a, b) => b.count - a.count);
    return scored[0]?.d || ',';
  }

  const parseFileToMappedRecords = async (file) => {
      if (!file) throw new Error('Selecciona un archivo primero');
      const name = file.name.toLowerCase();

      let mapped = [];

      if (name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        mapped = rows.map(mapObjectToRecord).filter(Boolean);
      } else if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
        const text = await file.text();
        const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
        if (lines.length <= 1) throw new Error('No hay filas para importar');
        const delimiter = detectDelimiter(lines[0]);
        const headerLookup = buildHeaderLookup(splitCsvLine(lines[0], delimiter));
        mapped = lines
          .slice(1)
          .map((line) => mapColumnsToRecord(splitCsvLine(line, delimiter), headerLookup))
          .filter(Boolean);
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) {
        const XLSX = await loadSheetJs();
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) throw new Error('El archivo no tiene hojas');
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, raw: true });
        if (!Array.isArray(rows) || rows.length <= 1) throw new Error('No hay filas para importar');
        const headerLookup = buildHeaderLookup(rows[0]);
        mapped = rows.slice(1).map((row) => mapColumnsToRecord(row, headerLookup)).filter(Boolean);
      } else {
        throw new Error('Formato no soportado. Usa JSON, CSV, TXT, TSV, XLS, XLSX u ODS.');
      }

      if (mapped.length === 0) throw new Error('No se encontraron registros válidos');
      return mapped;
  };

  const buildPreviewRows = (mappedRows = []) => {
    const tarjetaSet = new Set(tarjetas.map((t) => String(t.numero || t.alias || '').trim()).filter(Boolean));
    const vehiculoSet = new Set(vehiculos.map((v) => String(v.chapa || '').trim().toUpperCase()).filter(Boolean));
    const combustibleSet = new Set(combustibles.map((c) => String(c.nombre || '').trim().toLowerCase()).filter(Boolean));

    return mappedRows.map((item) => {
      const errors = [];
      const warnings = [];
      const accion = item.combustible_litros_entrada != null ? 'RECARGA' : 'COMPRA';
      const displayAction = String(item._accion || accion).toUpperCase();
      const tarjeta = String(item.origen_entrada || '').trim();
      const chapa = String(item.chapa || '').trim().toUpperCase();
      const combustible = String(item.tipo_combustible || '').trim();

      if (displayAction !== 'RECARGA' && chapa && !vehiculoSet.has(chapa)) errors.push('Vehículo no registrado');
      if (tarjeta && /^\d+$/.test(tarjeta) && !tarjetaSet.has(tarjeta)) warnings.push('Tarjeta no registrada');
      if (combustible && !combustibleSet.has(combustible.toLowerCase())) errors.push('Combustible no registrado');

      return {
        record: item,
        fecha: item.fecha,
        accion: displayAction,
        row: { Tarjeta: tarjeta, Chapa: item.chapa, 'Tipo Combustible': combustible },
        movimiento: {
          fecha: item.fecha,
          tarjeta_alias: tarjeta ? `Tarjeta #${tarjeta.slice(-5)}` : 'Reserva',
          vehiculo_chapa: displayAction === 'RECARGA' ? '—' : item.chapa,
          combustible_nombre: combustible || '—',
          monto: item.combustible_litros_consumo ?? item.combustible_litros_entrada ?? null,
        },
        errors,
        warnings,
      };
    });
  };

  const importFileMutation = useMutation({
    mutationFn: async (rowsToImport) => {
      const results = [];
      for (const row of rowsToImport) {
        if (row.errors?.length) {
          results.push({ ...row, status: 'skipped' });
          continue;
        }
        try {
          await base44.entities.BitacoraConsumo.create(sanitizeRecordForCreate(row.record));
          results.push({ ...row, status: 'ok' });
        } catch (error) {
          results.push({ ...row, status: 'error', errors: [error?.message || 'Error al crear registro'] });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      setPreviewRows(results);
      const okCount = results.filter((r) => r.status === 'ok').length;
      toast.success(`Archivo importado: ${okCount} registros`);
      queryClient.invalidateQueries({ queryKey: ['bitacora_consumo'] });
    },
  });

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      setSelectedFile(file);
      parseFileToMappedRecords(file)
        .then((rows) => setPreviewRows(buildPreviewRows(rows)))
        .catch((error) => toast.error(error?.message || 'No se pudo procesar el archivo'));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Configuración</h1>
        <p className="text-xs text-slate-400">Importación masiva de movimientos</p>
      </div>

      {canEdit && (
        <>
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl text-slate-800">Importar Movimientos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                className="border border-dashed border-slate-300 rounded-2xl px-4 py-12 text-center bg-slate-50/60"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center">
                  <Upload className="w-7 h-7" />
                </div>
                <p className="text-slate-700 font-medium">Arrastra tu archivo aquí o haz clic para seleccionar</p>
                <p className="text-xs text-slate-400 mt-1">Formatos soportados:</p>
                <div className="flex justify-center gap-2 mt-3 text-xs">
                  <span className="px-2.5 py-1 rounded-md border bg-white inline-flex items-center gap-1"><FileJson className="w-3 h-3" />JSON</span>
                  <span className="px-2.5 py-1 rounded-md border bg-white inline-flex items-center gap-1"><FileText className="w-3 h-3" />CSV</span>
                  <span className="px-2.5 py-1 rounded-md border bg-white inline-flex items-center gap-1"><FileSpreadsheet className="w-3 h-3" />XLSX</span>
                </div>
                <div className="mt-4">
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importFileMutation.isPending}>
                    Seleccionar archivo
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv,.txt,.tsv,.xls,.xlsx,.ods"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedFile(file);
                    if (!file) return;
                    parseFileToMappedRecords(file)
                      .then((rows) => setPreviewRows(buildPreviewRows(rows)))
                      .catch((error) => toast.error(error?.message || 'No se pudo procesar el archivo'));
                  }}
                  disabled={importFileMutation.isPending}
                  className="hidden"
                />
                <div className="mt-4 text-sm text-slate-500">
                  {selectedFile ? `Archivo seleccionado: ${selectedFile.name}` : 'No hay archivo seleccionado.'}
                </div>
              </div>
            </CardContent>
          </Card>
          {previewRows.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-5 space-y-4">
                <div className="flex flex-wrap items-center gap-5 text-3.5">
                  <div className="flex items-center gap-2 text-slate-600">
                    <CircleCheck className="w-5 h-5 text-emerald-500" />
                    <span>{previewRows.filter((r) => (r.status ? r.status === 'ok' : r.errors.length === 0)).length} listos para importar</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <CircleAlert className="w-5 h-5 text-amber-500" />
                    <span>{previewRows.filter((r) => r.warnings?.length > 0).length} con advertencias</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <CircleX className="w-5 h-5 text-red-500" />
                    <span>{previewRows.filter((r) => r.errors?.length > 0).length} con errores (se omitirán)</span>
                  </div>
                </div>
                <ImportResultsTable rows={previewRows} mode={importFileMutation.isSuccess ? 'results' : 'preview'} />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewRows([]);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => importFileMutation.mutate(previewRows)}
                    disabled={importFileMutation.isPending || previewRows.length === 0}
                  >
                    {importFileMutation.isPending ? 'Importando...' : `Importar ${previewRows.length} registros`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <ImportGuide />
        </>
      )}
    </div>
  );
}
