import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Fuel, Eye, EyeOff } from 'lucide-react';
import { entrarConGoogle, escucharVueltaDeLogin, ENLACE_VUELTA, esApp } from '@/lib/authNativa';
import { MARCA_DEFINIR_CLAVE } from '@/components/ui-helpers/ClaveAcceso';

export default function Login() {
  const [mode, setMode]               = useState('login'); // 'login' | 'register'
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [fullName, setFullName]       = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [loading, setLoading]                       = useState(false);
  const [error, setError]     = useState(/** @type {string|null} */(null));
  const [successMsg, setSuccessMsg] = useState(/** @type {string|null} */(null));

  // Antes que nada: si la dirección viene del correo de recuperación, se deja la
  // marca para que la aplicación abra el formulario de contraseña al entrar. Va
  // primero porque el efecto siguiente redirige en cuanto encuentra sesión.
  useEffect(() => {
    const partes = window.location.hash.slice(1) + '&' + window.location.search.slice(1);
    if (new URLSearchParams(partes).get('type') === 'recovery') {
      sessionStorage.setItem(MARCA_DEFINIR_CLAVE, '1');
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') sessionStorage.setItem(MARCA_DEFINIR_CLAVE, '1');
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.href = '/';
    });
  }, []);

  // Dentro de la aplicacion, el inicio con Google sale al navegador y vuelve por
  // un enlace propio; aqui se recoge esa vuelta para terminar la sesion dentro.
  useEffect(() => escucharVueltaDeLogin((resultado) => {
    if (resultado?.recuperacion) sessionStorage.setItem(MARCA_DEFINIR_CLAVE, '1');
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { window.location.href = '/'; return; }
      setLoading(false);
      // Se muestra el motivo tal cual lo da Supabase o el proveedor: sin el, no
      // hay forma de distinguir un enlace mal autorizado de un permiso negado.
      setError(resultado?.motivo || 'No se pudo completar el inicio de sesión. Inténtalo de nuevo.');
    });
  }), []);

  const resetForm = () => {
    setError(null);
    setSuccessMsg(null);
    setEmail('');
    setPassword('');
    setFullName('');
  };

  const switchMode = (m) => {
    setMode(m);
    resetForm();
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setError(traducirError(err.message));
      setLoading(false);
    } else {
      window.location.href = '/';
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || email },
        emailRedirectTo: window.location.origin + '/',
      },
    });
    setLoading(false);
    if (err) {
      setError(traducirError(err.message));
    } else if (data.session) {
      // Confirmación de email desactivada → ya tiene sesión
      window.location.href = '/';
    } else {
      setSuccessMsg('Revisa tu correo y confirma tu cuenta para poder iniciar sesión.');
    }
  };

  // Envía el enlace por correo para poner una contraseña.
  //
  // Sirve tanto a quien la olvidó como a quien entró siempre con Google y nunca
  // ha tenido una: en los dos casos la cuenta ya existe y lo que falta es fijar
  // la clave. Supabase responde igual exista o no el correo, así que esto no
  // permite averiguar quién está registrado.
  const handleRecuperar = async () => {
    if (!email) {
      setError('Escribe tu correo y vuelve a pulsar.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: esApp() ? ENLACE_VUELTA : window.location.origin + '/Login',
    });
    setLoading(false);
    if (err) { setError(traducirError(err.message)); return; }
    setSuccessMsg('Te enviamos un enlace a ese correo. Ábrelo desde este dispositivo y podrás definir tu contraseña.');
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const { error: err } = await entrarConGoogle();
    if (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-50 to-indigo-100 dark:from-slate-950 dark:via-sky-950/20 dark:to-indigo-950"
      // El relleno respeta la barra de estado y la de gestos del teléfono: esta
      // pantalla no pasa por Layout, y en Android 15 la ventana es de borde a
      // borde, así que sin él el contenido puede quedar debajo de ellas.
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="w-full max-w-sm mx-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg mb-4">
            <Fuel className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Control Combustible</h1>
          <p className="text-sm text-slate-400 mt-1">Gestión de flota y consumo</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl shadow-sm p-8">
          {/* Tabs */}
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 mb-6">
            {['login', 'register'].map(m => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-all ${
                  mode === m
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800/50 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {successMsg ? (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 text-sm text-emerald-700 dark:text-emerald-400 text-center">
              <p className="font-medium mb-1">¡Registro exitoso!</p>
              <p className="text-xs">{successMsg}</p>
              <button
                className="mt-3 text-xs text-sky-600 hover:underline"
                onClick={() => switchMode('login')}
              >
                Ir a iniciar sesión
              </button>
            </div>
          ) : (
            <form onSubmit={mode === 'login' ? handleEmailLogin : handleRegister} className="space-y-3">
              {mode === 'register' && (
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">Nombre completo</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Juan Pérez"
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">Correo electrónico</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400">Contraseña</label>
                <div className="relative mt-1">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mode === 'login' && (
                <button
                  type="button"
                  onClick={handleRecuperar}
                  disabled={loading}
                  className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 disabled:opacity-60"
                >
                  ¿Olvidaste la contraseña o entras siempre con Google?
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm mt-1"
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Procesando...</span>
                  : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'
                }
              </button>
            </form>
          )}

          {/* Divisor */}
          {!successMsg && (
            <>
              <div className="flex items-center gap-3 my-5">
                <hr className="flex-1 border-slate-200 dark:border-slate-700" />
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">o continúa con</span>
                <hr className="flex-1 border-slate-200 dark:border-slate-700" />
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function traducirError(msg) {
  if (!msg) return 'Error desconocido';
  if (msg.includes('Invalid login credentials'))  return 'Correo o contraseña incorrectos.';
  if (msg.includes('Email not confirmed'))         return 'Debes confirmar tu correo antes de iniciar sesión.';
  if (msg.includes('User already registered'))     return 'Ya existe una cuenta con ese correo.';
  if (msg.includes('Password should be'))          return 'La contraseña debe tener al menos 6 caracteres.';
  if (msg.includes('Unable to validate'))          return 'Correo inválido.';
  if (msg.includes('rate limit') || msg.includes('For security purposes'))
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
  return msg;
}
