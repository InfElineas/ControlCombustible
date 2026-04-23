import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Upload, FileJson, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, Loader2, ListTree } from 'lucide-react';
import ImportResultsTable from '@/components/configuracion/ImportResultsTable';
import ImportGuide from '@/components/configuracion/ImportGuide';
import TiposConsumidorPanel from '@/components/configuracion/TiposConsumidorPanel';

function parseDate(raw) {
  if (!raw) return null;
  // DD/MM/YY or DD/MM/YYYY
  const match = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    let [, d, m, y] = match;
    if (y.length === 2) y = '20' + y;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
}

export default function Configuracion() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();

  const { data: tarjetas = [] } = useQuery({ queryKey: ['tarjetas'], queryFn: () => base44.entities.Tarjeta.list() });
  const { data: combustibles = [] } = useQuery({ queryKey: ['combustibles'], queryFn: () => base44.entities.TipoCombustible.list() });
  const { data: consumidores = [] } = useQuery({ queryKey: ['consumidores'], queryFn: () => base44.entities.Consumidor.list() });

  const tarjetaMap = Object.fromEntries(tarjetas.map(t => [t.id_tarjeta, t]));
  const combustibleMap = Object.fromEntries(combustibles.map(c => [c.nombre?.toLowerCase(), c]));
  // Consumidor map: nombre exacto → objeto
  const consumidorMap = Object.fromEntries(consumidores.map(c => [c.nombre?.trim(), c]));

  const normalizeRow = (row) => {
    const tarjetaNum = String(row['Tarjeta'] || row['tarjeta'] || '').trim();
    const tarjeta = tarjetaMap[tarjetaNum];
    const combustibleNombre = String(row['Tipo Combustible'] || row['tipo_combustible'] || row['combustible'] || '').trim();
    const combustible = combustibleMap[combustibleNombre.toLowerCase()];
    const accion = String(row['Accion'] || row['accion'] || row['Acción'] || '').trim().toUpperCase();
    const fecha = parseDate(row['Fecha'] || row['fecha']);
    const precio = parseFloat(row['Precio'] || row['precio'] || 0) || null;
    const compraL = parseFloat(row['Compra L'] || row['compra_l'] || row['litros'] || 0) || null;
    const compra$ = parseFloat(row['Compra $'] || row['compra_$'] || row['monto'] || 0) || null;
    const cargaL = parseFloat(row['Recarga L'] || row['Carga L'] || row['carga_l'] || 0) || null;
    const carga$ = parseFloat(row['Recarga $'] || row['Carga $'] || row['carga_$'] || 0) || null;
    const odometro = parseFloat(row['Odometro'] || row['odometro'] || row['Odómetro'] || 0) || null;
    const referencia = String(row['Referencia'] || row['referencia'] || '').trim() || null;

    // Consumidor destino (nuevo campo)
    const consumidorNombre = String(row['Consumidor'] || row['consumidor'] || row['Chapa'] || row['chapa'] || '').trim();
    const consumidor = consumidorMap[consumidorNombre];

    // Consumidor origen para DESPACHO
    const consumidorOrigenNombre = String(row['Consumidor Origen'] || row['consumidor_origen'] || row['Origen'] || row['origen'] || '').trim();
    const consumidorOrigen = consumidorMap[consumidorOrigenNombre];

    const warnings = [];
    const errors = [];

    if (!fecha) errors.push('Fecha inválida');
    if (!accion || !['COMPRA', 'RECARGA', 'DESPACHO'].includes(accion)) errors.push(`Acción desconocida: "${accion}"`);

    let movimiento = null;

    if (accion === 'COMPRA') {
      if (!tarjeta) warnings.push(`Tarjeta "${tarjetaNum}" no registrada — se omitirá tarjeta_id`);
      if (!combustible) errors.push(`Combustible "${combustibleNombre}" no encontrado`);
      if (!consumidorNombre) warnings.push('Sin consumidor especificado');
      if (consumidorNombre && !consumidor) warnings.push(`Consumidor "${consumidorNombre}" no encontrado — se guardará como referencia`);

      if (errors.length === 0) {
        movimiento = {
          fecha,
          tipo: 'COMPRA',
          tarjeta_id: tarjeta?.id || null,
          tarjeta_alias: tarjeta ? (tarjeta.alias || tarjeta.id_tarjeta) : tarjetaNum,
          combustible_id: combustible?.id || null,
          combustible_nombre: combustible?.nombre || combustibleNombre,
          precio: precio || null,
          litros: compraL || null,
          monto: compra$ || null,
          consumidor_id: consumidor?.id || null,
          consumidor_nombre: consumidor?.nombre || consumidorNombre || null,
          // legado
          vehiculo_chapa: consumidor?.codigo_interno || consumidorNombre || null,
          vehiculo_alias: consumidor?.nombre || consumidorNombre || null,
          odometro: odometro || null,
          referencia: referencia || undefined,
        };
      }
    } else if (accion === 'RECARGA') {
      const tarjetaRecargaNum = tarjetaNum;
      const tarjetaRecarga = tarjetaMap[tarjetaRecargaNum];
      if (!tarjetaRecarga) warnings.push(`Tarjeta "${tarjetaRecargaNum}" no registrada — se omitirá tarjeta_id`);
      const monto = carga$ || null;
      if (!monto) errors.push('Monto de recarga no encontrado (Recarga $ o Carga $)');
      if (errors.length === 0) {
        movimiento = {
          fecha,
          tipo: 'RECARGA',
          tarjeta_id: tarjetaRecarga?.id || null,
          tarjeta_alias: tarjetaRecarga ? (tarjetaRecarga.alias || tarjetaRecarga.id_tarjeta) : tarjetaRecargaNum,
          monto,
          litros: cargaL || null,
          precio: precio || null,
          referencia: referencia || (cargaL ? `${cargaL}L recargados` : undefined),
        };
      }
    } else if (accion === 'DESPACHO') {
      if (!combustible) errors.push(`Combustible "${combustibleNombre}" no encontrado`);
      if (!consumidorNombre) errors.push('Sin consumidor destino');
      if (consumidorNombre && !consumidor) warnings.push(`Consumidor destino "${consumidorNombre}" no encontrado — se guardará como referencia`);
      if (consumidorOrigenNombre && !consumidorOrigen) warnings.push(`Consumidor origen "${consumidorOrigenNombre}" no encontrado — se guardará como referencia`);

      if (errors.length === 0) {
        movimiento = {
          fecha,
          tipo: 'DESPACHO',
          combustible_id: combustible?.id || null,
          combustible_nombre: combustible?.nombre || combustibleNombre,
          precio: precio || null,
          litros: compraL || null,
          consumidor_id: consumidor?.id || null,
          consumidor_nombre: consumidor?.nombre || consumidorNombre || null,
          consumidor_origen_id: consumidorOrigen?.id || null,
          consumidor_origen_nombre: consumidorOrigen?.nombre || consumidorOrigenNombre || null,
          vehiculo_chapa: consumidor?.codigo_interno || consumidorNombre || null,
          vehiculo_alias: consumidor?.nombre || consumidorNombre || null,
          vehiculo_origen_chapa: consumidorOrigen?.codigo_interno || consumidorOrigenNombre || null,
          vehiculo_origen_alias: consumidorOrigen?.nombre || consumidorOrigenNombre || null,
          referencia: referencia || undefined,
        };
      }
    }

    return { row, movimiento, warnings, errors, accion, fecha };
  };

  const parseJSON = (text) => JSON.parse(text);

  const parseCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      return obj;
    });
  };

  const processFile = async (file) => {
    setIsProcessing(true);
    setResults(null);
    setPreview(null);

    const ext = file.name.split('.').pop().toLowerCase();
    let rows = [];

    if (ext === 'json') {
      const text = await file.text();
      rows = parseJSON(text);
      if (!Array.isArray(rows)) rows = [rows];
    } else if (ext === 'csv') {
      const text = await file.text();
      rows = parseCSV(text);
    } else if (ext === 'xlsx' || ext === 'xls') {
      // Upload and extract via LLM integration
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: 'object',
          properties: {
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  Fecha: { type: 'string' },
                  Accion: { type: 'string' },
                  Tarjeta: { type: 'string' },
                  'Tipo Combustible': { type: 'string' },
                  Consumidor: { type: 'string' },
                  'Consumidor Origen': { type: 'string' },
                  Precio: { type: 'number' },
                  'Compra L': { type: 'number' },
                  'Compra $': { type: 'number' },
                  'Recarga L': { type: 'number' },
                  'Recarga $': { type: 'number' },
                  Odometro: { type: 'number' },
                  Referencia: { type: 'string' },
                },
              },
            },
          },
        },
      });
      rows = result.output?.rows || result.output || [];
    } else {
      toast.error('Formato no soportado. Use JSON, CSV o XLSX.');
      setIsProcessing(false);
      return;
    }

    const normalized = rows.map(normalizeRow);
    setPreview(normalized);
    setIsProcessing(false);
  };

  const handleImport = async () => {
    if (!preview) return;
    setIsProcessing(true);

    const toInsert = preview.filter(p => p.movimiento && p.errors.length === 0);
    let ok = 0, failed = 0;
    const finalResults = preview.map(p => ({ ...p, status: 'skipped' }));

    for (let i = 0; i < toInsert.length; i++) {
      const item = toInsert[i];
      try {
        await base44.entities.Movimiento.create(item.movimiento);
        ok++;
        const idx = preview.indexOf(item);
        finalResults[idx] = { ...item, status: 'ok' };
      } catch (e) {
        failed++;
        const idx = preview.indexOf(item);
        finalResults[idx] = { ...item, status: 'error', importError: e.message };
      }
    }

    setResults({ ok, failed, skipped: preview.length - toInsert.length, total: preview.length, items: finalResults });
    setPreview(null);
    setIsProcessing(false);
    toast.success(`Importación completada: ${ok} registros insertados`);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const validCount = preview?.filter(p => p.errors.length === 0).length || 0;
  const errorCount = preview?.filter(p => p.errors.length > 0).length || 0;
  const warnCount = preview?.filter(p => p.warnings.length > 0 && p.errors.length === 0).length || 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Configuración</h1>
        <p className="text-xs text-slate-400">Gestión de tipos, consumidores e importaciones</p>
      </div>

      <Tabs defaultValue="importacion">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="importacion" className="gap-1.5 text-xs">
            <Upload className="w-3.5 h-3.5" /> Importar movimientos
          </TabsTrigger>
          <TabsTrigger value="tipos" className="gap-1.5 text-xs">
            <ListTree className="w-3.5 h-3.5" /> Tipos de consumidor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tipos" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4">
              <TiposConsumidorPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="importacion" className="mt-4 space-y-4">

      {/* Upload zone */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Upload className="w-4 h-4 text-sky-500" />
            Importar Movimientos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? 'border-sky-400 bg-sky-50'
                : 'border-slate-200 hover:border-sky-300 hover:bg-slate-50/80'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,.xlsx,.xls"
              className="hidden"
              onChange={e => { if (e.target.files[0]) processFile(e.target.files[0]); e.target.value = ''; }}
            />
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
                <p className="text-sm text-slate-500">Procesando archivo...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-sky-50 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-sky-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">Arrastra tu archivo aquí o haz clic para seleccionar</p>
                  <p className="text-xs text-slate-400 mt-1">Formatos soportados:</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="gap-1 text-xs"><FileJson className="w-3 h-3" /> JSON</Badge>
                  <Badge variant="outline" className="gap-1 text-xs"><FileSpreadsheet className="w-3 h-3" /> CSV</Badge>
                  <Badge variant="outline" className="gap-1 text-xs"><FileSpreadsheet className="w-3 h-3" /> XLSX</Badge>
                </div>
              </div>
            )}
          </div>

          {/* Preview summary */}
          {preview && !isProcessing && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-slate-600">{validCount} listos para importar</span>
                </div>
                {warnCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-slate-600">{warnCount} con advertencias</span>
                  </div>
                )}
                {errorCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-slate-600">{errorCount} con errores (se omitirán)</span>
                  </div>
                )}
              </div>

              <ImportResultsTable rows={preview} mode="preview" />

              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setPreview(null)}>Cancelar</Button>
                <Button
                  size="sm"
                  disabled={validCount === 0 || isProcessing}
                  onClick={handleImport}
                  className="bg-sky-600 hover:bg-sky-700 gap-1.5"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Importar {validCount} registros
                </Button>
              </div>
            </div>
          )}

          {/* Final results */}
          {results && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-slate-600">{results.ok} importados</span>
                </div>
                {results.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-slate-600">{results.skipped} omitidos</span>
                  </div>
                )}
                {results.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-slate-600">{results.failed} fallidos</span>
                  </div>
                )}
              </div>
              <ImportResultsTable rows={results.items} mode="results" />
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setResults(null)}>Nueva importación</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Guide */}
      <ImportGuide />

        </TabsContent>
      </Tabs>
    </div>
  );
}