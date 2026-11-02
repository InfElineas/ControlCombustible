import React, { useState, useEffect } from 'react';
import { authClient } from '@/api/authClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { KeyRound, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

// Política de contraseña de elineas-auth (la misma que aplica el servidor, así
// que se comprueba aquí para no hacer esperar al usuario por un rechazo).
const MINIMO = 12;
const MAXIMO = 128;

function problemaDeClave(clave) {
  if (clave.length < MINIMO) return `La contraseña debe tener al menos ${MINIMO} caracteres.`;
  if (clave.length > MAXIMO) return `La contraseña no puede pasar de ${MAXIMO} caracteres.`;
  if (!/[A-Z]/.test(clave)) return 'Debe llevar al menos una mayúscula.';
  if (!/[a-z]/.test(clave)) return 'Debe llevar al menos una minúscula.';
  if (!/[^A-Za-z0-9]/.test(clave)) return 'Debe llevar al menos un carácter especial.';
  return null;
}

function traducir(err) {
  if (err?.sinRed) return 'No hay conexión. Cambiar la contraseña necesita red.';
  if (err?.estado === 429) return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
  if (err?.estado === 401 || err?.estado === 403) return 'La contraseña actual no es correcta.';
  return err?.message || 'No se pudo guardar la contraseña.';
}

// Cambia la contraseña propia en elineas-auth.
//
// Las cuentas las crea un administrador y llevan contraseña desde el principio,
// así que ya no existe el caso «entró con Google y no tiene contraseña»: el
// cambio siempre exige la actual. Si no la recuerda, un administrador puede
// reenviarle la invitación desde el panel del servidor de identidad.
export default function ClaveAcceso({ abierto, onCerrar }) {
  const [actual, setActual]       = useState('');
  const [clave, setClave]         = useState('');
  const [repetida, setRepetida]   = useState('');
  const [ver, setVer]             = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState(/** @type {string|null} */(null));
  const [listo, setListo]         = useState(false);

  useEffect(() => {
    if (!abierto) {
      setActual(''); setClave(''); setRepetida(''); setError(null); setListo(false); setVer(false);
    }
  }, [abierto]);

  const guardar = async (e) => {
    e.preventDefault();
    if (!actual) { setError('Escribe tu contraseña actual.'); return; }
    const problema = problemaDeClave(clave);
    if (problema) { setError(problema); return; }
    if (clave !== repetida) { setError('Las dos contraseñas no coinciden.'); return; }
    if (clave === actual) { setError('La contraseña nueva tiene que ser distinta de la actual.'); return; }

    setGuardando(true);
    setError(null);
    try {
      await authClient.cambiarContrasena(actual, clave);
      setListo(true);
    } catch (err) {
      setError(traducir(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={a => { if (!a) onCerrar(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/50 flex items-center justify-center shrink-0">
              <KeyRound className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            </div>
            Cambiar contraseña
          </DialogTitle>
        </DialogHeader>

        {listo ? (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Contraseña guardada. Úsala la próxima vez que entres con tu correo.
            </p>
            <Button size="sm" onClick={onCerrar}>Entendido</Button>
          </div>
        ) : (
          <form onSubmit={guardar} className="space-y-3">
            <div>
              <Label className="text-xs text-slate-500">Contraseña actual</Label>
              <Input
                type={ver ? 'text' : 'password'}
                value={actual}
                onChange={e => setActual(e.target.value)}
                className="mt-1"
                autoComplete="current-password"
              />
            </div>

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
              <p className="text-[11px] text-slate-400 mt-1">
                Con mayúscula, minúscula y un carácter especial.
              </p>
            </div>

            <div>
              <Label className="text-xs text-slate-500">Repite la contraseña nueva</Label>
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
