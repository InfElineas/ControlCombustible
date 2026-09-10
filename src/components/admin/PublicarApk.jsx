import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useUserRole } from '@/components/ui-helpers/useUserRole';
import { logAudit } from '@/api/auditLog';
import { toast } from 'sonner';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import ConfirmDialog from '@/components/ui-helpers/ConfirmDialog';
import {
  Smartphone, Upload, CheckCircle2, RotateCcw, Download, AlertTriangle, Trash2,
} from 'lucide-react';

const BUCKET = 'apk';

const pesoLegible = (bytes) => {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
};

const cuando = (iso) => new Date(iso).toLocaleString('es-CU', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Consulta la versión vigente. La usa también el aviso de descarga de la web. */
export function useVersionVigente() {
  return useQuery({
    queryKey: ['apk-version-vigente'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('apk_version')
        .select('*')
        .eq('vigente', true)
        .order('created_date', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export default function PublicarApk() {
  const qc = useQueryClient();
  const { user } = useUserRole();
  const [version, setVersion] = useState('');
  const [versionCode, setVersionCode] = useState('');
  const [notas, setNotas] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aBorrar, setABorrar] = useState(null);

  const { data: historial = [], isLoading } = useQuery({
    queryKey: ['apk-versiones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('apk_version')
        .select('*')
        .order('created_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['apk-versiones'] });
    qc.invalidateQueries({ queryKey: ['apk-version-vigente'] });
  };

  const publicarMut = useMutation({
    mutationFn: async () => {
      // El nombre lleva la versión para que el archivo sea reconocible en el
      // almacén, y un identificador para que dos publicaciones de la misma
      // versión no se pisen.
      const seguro = version.trim().replace(/[^\w.-]/g, '_');
      const ruta = `control-combustible-${seguro}-${crypto.randomUUID().slice(0, 8)}.apk`;

      setSubiendo(true);
      const { error: errSubida } = await supabase.storage
        .from(BUCKET)
        .upload(ruta, archivo, { contentType: 'application/vnd.android.package-archive' });
      setSubiendo(false);
      if (errSubida) throw errSubida;

      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(ruta);

      const fila = {
        version: version.trim(),
        version_code: versionCode ? Number(versionCode) : null,
        notas: notas.trim(),
        archivo_url: publicUrl,
        archivo_nombre: ruta,
        archivo_bytes: archivo.size,
        vigente: true,
        publicada_por: user?.id ?? null,
        publicada_por_email: user?.email ?? null,
      };
      const { data, error } = await supabase.from('apk_version').insert(fila).select().single();
      if (error) {
        // La fila no entró: se retira el archivo para no dejar basura en el
        // almacén con cada intento fallido.
        await supabase.storage.from(BUCKET).remove([ruta]);
        throw error;
      }
      await logAudit({
        action: 'APK_PUBLICADA', entityType: 'ApkVersion', entityId: data.id,
        entityLabel: `Versión ${fila.version}`,
        metadata: { version: fila.version, version_code: fila.version_code, bytes: fila.archivo_bytes },
      });
      return data;
    },
    onSuccess: () => {
      refrescar();
      setVersion(''); setVersionCode(''); setNotas(''); setArchivo(null);
      toast.success('Versión publicada. Ya aparece en la web para descargar.');
    },
    onError: (e) => {
      const msg = e?.message ?? '';
      if (msg.includes('duplicate') || e?.code === '23505') {
        toast.error('Ya existe una versión con ese número. Usa otro.');
      } else if (msg.includes('exceeded') || msg.includes('too large')) {
        toast.error('El archivo supera el límite del almacén.');
      } else if (msg.includes('Bucket not found')) {
        toast.error('Falta el almacén «apk». Ejecuta la migración 2026-09-10_apk_version.sql.');
      } else {
        toast.error(`No se pudo publicar: ${msg || 'error desconocido'}`);
      }
    },
  });

  const restaurarMut = useMutation({
    mutationFn: async (fila) => {
      const { error } = await supabase.from('apk_version').update({ vigente: true }).eq('id', fila.id);
      if (error) throw error;
      await logAudit({
        action: 'APK_RESTAURADA', entityType: 'ApkVersion', entityId: fila.id,
        entityLabel: `Versión ${fila.version}`, metadata: { version: fila.version },
      });
    },
    onSuccess: () => { refrescar(); toast.success('Esa versión vuelve a ser la vigente'); },
    onError: (e) => toast.error(e.message ?? 'No se pudo cambiar'),
  });

  const borrarMut = useMutation({
    mutationFn: async (fila) => {
      if (fila.archivo_nombre) {
        await supabase.storage.from(BUCKET).remove([fila.archivo_nombre]);
      }
      const { error } = await supabase.from('apk_version').delete().eq('id', fila.id);
      if (error) throw error;
      await logAudit({
        action: 'APK_ELIMINADA', entityType: 'ApkVersion', entityId: fila.id,
        entityLabel: `Versión ${fila.version}`, metadata: { version: fila.version },
      });
    },
    onSuccess: () => { refrescar(); setABorrar(null); toast.success('Versión eliminada'); },
    onError: (e) => toast.error(e.message ?? 'No se pudo eliminar'),
  });

  const puedePublicar = version.trim() && notas.trim() && archivo && !publicarMut.isPending;
  const vigente = historial.find(v => v.vigente);

  const elegirArchivo = (e) => {
    const f = e.target.files?.[0];
    if (!f) { setArchivo(null); return; }
    if (!f.name.toLowerCase().endsWith('.apk')) {
      toast.error('El archivo tiene que ser un .apk');
      e.target.value = '';
      return;
    }
    setArchivo(f);
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Publicar una versión nueva
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Al publicar, la web empieza a ofrecer este archivo y muestra sus notas.
            Quien ya tenga la aplicación instalada la actualiza encima, siempre que
            esté firmada con la misma clave y su <code>versionCode</code> sea mayor.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500">Versión *</Label>
              <Input value={version} onChange={e => setVersion(e.target.value)}
                placeholder="1.1" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">versionCode (opcional)</Label>
              <Input type="number" value={versionCode} onChange={e => setVersionCode(e.target.value)}
                placeholder="2" className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs text-slate-500">Qué trae esta versión *</Label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={4}
              placeholder={'Una línea por cambio, por ejemplo:\n· Se pueden registrar movimientos sin conexión\n· Arreglado el buscador'}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>

          <div>
            <Label className="text-xs text-slate-500">Archivo .apk *</Label>
            <Input type="file" accept=".apk,application/vnd.android.package-archive"
              onChange={elegirArchivo} className="mt-1" />
            {archivo && (
              <p className="text-[11px] text-slate-400 mt-1">
                {archivo.name} · {pesoLegible(archivo.size)}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <Button size="sm" disabled={!puedePublicar} onClick={() => publicarMut.mutate()}>
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              {subiendo ? 'Subiendo…' : publicarMut.isPending ? 'Publicando…' : 'Publicar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
            Versiones publicadas
          </h3>

          {isLoading ? (
            <p className="text-xs text-slate-400 py-4 text-center">Cargando…</p>
          ) : historial.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-400">
                Todavía no hay ninguna. Mientras, la web ofrece el archivo estático
                de <code>/app/control-combustible.apk</code>, si está subido.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {historial.map(v => (
                <div key={v.id}
                  className={`rounded-xl border px-3 py-2.5 ${v.vigente
                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{v.version}</span>
                    {v.version_code != null && (
                      <span className="text-[10px] text-slate-400 font-mono">code {v.version_code}</span>
                    )}
                    {v.vigente && (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 border-0">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />Vigente
                      </Badge>
                    )}
                    <span className="text-[10px] text-slate-400 ml-auto">{pesoLegible(v.archivo_bytes)}</span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 whitespace-pre-wrap">{v.notas}</p>

                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {cuando(v.created_date)}
                    {v.publicada_por_email ? ` · ${v.publicada_por_email}` : ''}
                  </p>

                  <div className="flex gap-1 mt-1.5">
                    <a href={v.archivo_url} download
                      className="inline-flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-700 px-2 h-6 rounded">
                      <Download className="w-3 h-3" /> Descargar
                    </a>
                    {!v.vigente && (
                      <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                        onClick={() => restaurarMut.mutate(v)}>
                        <RotateCcw className="w-3 h-3 mr-1" /> Volver a esta
                      </Button>
                    )}
                    <Button size="sm" variant="ghost"
                      className="h-6 text-[11px] px-2 text-red-500 hover:text-red-600"
                      onClick={() => setABorrar(v)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!aBorrar}
        onOpenChange={a => { if (!a) setABorrar(null); }}
        title={`¿Eliminar la versión ${aBorrar?.version ?? ''}?`}
        description={
          aBorrar?.id === vigente?.id
            ? 'Es la versión vigente: al eliminarla, la web dejará de ofrecer descarga hasta que publiques otra o restaures una anterior. El archivo se borra del almacén.'
            : 'Se borra también el archivo del almacén. Quien ya tenga la aplicación instalada no se ve afectado.'
        }
        destructive
        onConfirm={() => borrarMut.mutate(aBorrar)}
      />
    </div>
  );
}
