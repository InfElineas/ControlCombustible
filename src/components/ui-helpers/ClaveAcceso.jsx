import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { KeyRound, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

const MINIMO = 6;

// Marca que deja el correo de recuperación para que el diálogo se abra solo al
// entrar, en lugar de dejar al usuario dentro sin saber qué hacer.
export const MARCA_DEFINIR_CLAVE = 'webcombustible-definir-clave';

function traducir(msg = '') {
  if (msg.includes('should be at least') || msg.includes('Password should be'))
    return `La contraseña debe tener al menos ${MINIMO} caracteres.`;
  if (msg.includes('different from the old password'))
    return 'La contraseña nueva tiene que ser distinta de la actual.';
  if (msg.includes('reauthentication') || msg.includes('Reauthentication'))
    return 'Por seguridad, vuelve a entrar y repite el cambio.';
  if (msg.includes('session') || msg.includes('JWT'))
    return 'La sesión caducó. Vuelve a entrar e inténtalo otra vez.';
  return msg || 'No se pudo guardar la contraseña.';
}

// ¿Puede esta cuenta entrar con correo y contraseña?
//
// identities dice con qué proveedores está dada de alta. Quien entró con Google
// no tiene la de tipo 'email' hasta que se fija una contraseña, y mientras no la
// tenga el acceso por correo le falla sin explicación.
export function useTieneClavePropia({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['identidades-cuenta'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return (data?.user?.identities ?? []).map(i => i.provider);
    },
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

// Define una contraseña propia de la aplicación para quien entró con Google.
//
// La contraseña de la cuenta de Google no sirve para el acceso por correo: solo
// Google puede comprobarla y la aplicación nunca llega a verla. Lo que sí puede
// tener la misma cuenta es una contraseña propia, y es la que se fija aquí. A
// partir de entonces valen las dos formas de entrar, con el mismo correo.
export default function ClaveAcceso({ abierto, onCerrar }) {
  const qc = useQueryClient();
  const [clave, setClave]         = useState('');
  const [repetida, setRepetida]   = useState('');
  const [ver, setVer]             = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState(/** @type {string|null} */(null));
  const [listo, setListo]         = useState(false);
  const [yaTiene, setYaTiene]     = useState(/** @type {boolean|null} */(null));

  useEffect(() => {
    if (!abierto) {
      setClave(''); setRepetida(''); setError(null); setListo(false); setVer(false);
      return;
    }
    // identities dice con qué proveedores puede entrar esta cuenta. Si no está
    // 'email', es la primera vez que se le pone contraseña.
    supabase.auth.getUser().then(({ data }) => {
      const proveedores = (data?.user?.identities ?? []).map(i => i.provider);
      setYaTiene(proveedores.includes('email'));
    }).catch(() => setYaTiene(null));
  }, [abierto]);

  const guardar = async (e) => {
    e.preventDefault();
    if (clave.length < MINIMO) {
      setError(`La contraseña debe tener al menos ${MINIMO} caracteres.`);
      return;
    }
    if (clave !== repetida) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password: clave });
    setGuardando(false);
    if (err) { setError(traducir(err.message)); return; }
    // Refresca la lista de proveedores para que el aviso de "sin contraseña"
    // deje de salir sin tener que recargar.
    qc.invalidateQueries({ queryKey: ['identidades-cuenta'] });
    setListo(true);
  };

  const titulo = yaTiene ? 'Cambiar contraseña' : 'Crear contraseña';

  return (
    <Dialog open={abierto} onOpenChange={a => { if (!a) onCerrar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center shrink-0">
              <KeyRound className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            </div>
            {titulo}
          </DialogTitle>
        </DialogHeader>

        {listo ? (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Contraseña guardada. Ya puedes entrar con tu correo y esta contraseña,
              además de con Google.
            </p>
            <Button size="sm" onClick={onCerrar}>Entendido</Button>
          </div>
        ) : (
          <form onSubmit={guardar} className="space-y-3">
            {yaTiene === false && (
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
                Entraste con Google, así que esta cuenta todavía no tiene contraseña
                propia. La de Google no sirve aquí: solo Google puede comprobarla.
                Define una y podrás entrar de las dos formas.
              </p>
            )}

            <div>
              <Label className="text-xs text-slate-500">Contraseña nueva</Label>
              <div className="relative mt-1">
                <Input
                  type={ver ? 'text' : 'password'}
                  value={clave}
                  onChange={e => setClave(e.target.value)}
                  placeholder={`Mínimo ${MINIMO} caracteres`}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setVer(v => !v)}
                  aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label className="text-xs text-slate-500">Repite la contraseña</Label>
              <Input
                type={ver ? 'text' : 'password'}
                value={repetida}
                onChange={e => setRepetida(e.target.value)}
                className="mt-1"
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
