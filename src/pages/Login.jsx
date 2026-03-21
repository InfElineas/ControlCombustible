import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/AuthContext';
import { Eye, EyeOff, Fuel, Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const {
    navigateToLogin,
    authError,
    signInWithPassword,
    signUpWithPassword,
    checkAppState,
    isSupabaseEnabled,
    isSupabaseMode,
    supabaseConfigIssue,
  } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [registerFeedback, setRegisterFeedback] = useState(null);
  const [login, setLogin] = useState({ email: '', password: '' });
  const [register, setRegister] = useState({ fullName: '', email: '', password: '' });
  const [registerRole, setRegisterRole] = useState('auditor');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const isGoogleOAuthAvailable =
    isSupabaseEnabled
    && String(import.meta.env.VITE_ENABLE_GOOGLE_OAUTH || 'false').toLowerCase() === 'true';

  const submitLogin = async () => {
    setIsSubmitting(true);
    try {
      await signInWithPassword(login, selectedRole);
      toast.success('Sesión iniciada correctamente');
    } catch (error) {
      const message = error?.message || 'No se pudo iniciar sesión';
      const hint = message.toLowerCase().includes('email not confirmed')
        ? 'Tu correo aún no está confirmado. Revisa tu bandeja y confirma el email antes de iniciar sesión.'
        : message;
      toast.error(hint);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitRegister = async () => {
    setIsSubmitting(true);
    setRegisterFeedback(null);
    try {
      const response = await signUpWithPassword({ ...register, role: registerRole });
      const hasSession = Boolean(response?.access_token || response?.session?.access_token);

      if (hasSession) {
        toast.success('Cuenta creada e inicio de sesión realizado.');
        setRegisterFeedback({ type: 'success', message: 'Cuenta creada e inicio de sesión realizado.' });
      } else {
        const message = isSupabaseEnabled
          ? 'Cuenta creada. Revisa tu correo para confirmar la cuenta y luego inicia sesión.'
          : 'Cuenta creada correctamente. Ahora inicia sesión con tu correo y contraseña.';
        toast.success(message);
        setRegisterFeedback({ type: 'success', message });
        setActiveTab('login');
      }
    } catch (error) {
      const message = error?.message || 'No se pudo crear la cuenta';
      const signupHint = message.includes('status 422')
        ? 'No se pudo crear la cuenta (422). Verifica que Signups esté habilitado en Supabase Auth o si el correo ya existe.'
        : message;
      toast.error(signupHint);
      setRegisterFeedback({ type: 'error', message: signupHint });
    } finally {
      setIsSubmitting(false);
    }
  };

  const retryConfigCheck = async () => {
    await checkAppState();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-md">
        <CardHeader className="space-y-3 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl overflow-hidden shadow-sm">
            <img src="/fuelflow-logo.svg" alt="FuelFlow" className="w-full h-full object-cover" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800">FuelFlow</CardTitle>
          <p className="text-sm text-slate-500">Sistema de autenticación</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {authError?.message && authError?.type !== 'auth_required' && (
            <div className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2">
              {authError.message}
            </div>
          )}

          {isSupabaseEnabled && (
            <div className="text-xs rounded-md bg-sky-50 border border-sky-200 text-sky-700 px-3 py-2">
              Inicia sesión para continuar. Si es tu primera vez, crea una cuenta en la pestaña Registro.
            </div>
          )}

          {!isSupabaseMode && (
            <div className="text-xs rounded-md bg-slate-50 border border-slate-200 text-slate-700 px-3 py-2">
              Modo local activo: puedes registrarte e iniciar sesión con correo y contraseña desde este mismo formulario.
            </div>
          )}

          {registerFeedback && (
            <div className={`text-xs rounded-md px-3 py-2 border ${registerFeedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {registerFeedback.message}
            </div>
          )}

          {(isSupabaseEnabled || !isSupabaseMode) && (
            <>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="register">Registro</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-3 pt-3">
                  <div>
                    <Label className="text-xs text-slate-500">Correo</Label>
                    <Input type="email" className="mt-1" value={login.email} onChange={(e) => setLogin((s) => ({ ...s, email: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Contraseña</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showLoginPassword ? 'text' : 'password'}
                        className="pr-10"
                        value={login.password}
                        onChange={(e) => setLogin((s) => ({ ...s, password: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                        aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button className="w-full" onClick={submitLogin} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />} Iniciar sesión
                  </Button>
                </TabsContent>

                <TabsContent value="register" className="space-y-3 pt-3">
                  <div>
                    <Label className="text-xs text-slate-500">Nombre</Label>
                    <Input className="mt-1" value={register.fullName} onChange={(e) => setRegister((s) => ({ ...s, fullName: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Correo</Label>
                    <Input type="email" className="mt-1" value={register.email} onChange={(e) => setRegister((s) => ({ ...s, email: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Contraseña</Label>
                    <div className="relative mt-1">
                      <Input
                        type={showRegisterPassword ? 'text' : 'password'}
                        className="pr-10"
                        value={register.password}
                        onChange={(e) => setRegister((s) => ({ ...s, password: e.target.value }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
                        aria-label={showRegisterPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Rol para la nueva cuenta</Label>
                    <select
                      className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={registerRole}
                      onChange={(e) => setRegisterRole(e.target.value)}
                    >
                      <option value="auditor">Auditor</option>
                      <option value="gestor">Gestor</option>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      El rol superadmin no se puede seleccionar en el registro.
                    </p>
                  </div>
                  <Button className="w-full" onClick={submitRegister} disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />} Crear cuenta
                  </Button>
                </TabsContent>
              </Tabs>

              {isGoogleOAuthAvailable && (
                <>
                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
                    <div className="relative flex justify-center text-[10px] uppercase"><span className="bg-white px-2 text-slate-400">o</span></div>
                  </div>

                  <Button variant="outline" className="w-full" onClick={() => navigateToLogin(window.location.origin)}>
                    <LogIn className="w-4 h-4 mr-2" /> Continuar con Google
                  </Button>
                </>
              )}

              {isSupabaseEnabled && !isGoogleOAuthAvailable && (
                <div className="text-[11px] text-slate-500 text-center">
                  Google OAuth desactivado. Para habilitarlo activa el proveedor Google en Supabase y define
                  {' '}<code>VITE_ENABLE_GOOGLE_OAUTH=true</code>.
                </div>
              )}
            </>
          )}

          {!isSupabaseEnabled && isSupabaseMode && (
            <div className="space-y-3">
              <div className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2">
                {supabaseConfigIssue || 'Configuración incompleta de Supabase. Revisa .env.local y reinicia npm run dev.'}
              </div>
              <Button variant="outline" className="w-full" onClick={retryConfigCheck}>
                Reintentar configuración
              </Button>
            </div>
          )}

          <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
            <Fuel className="w-3 h-3" /> {isSupabaseEnabled ? 'Auth con Supabase' : isSupabaseMode ? 'Supabase no configurado aún' : 'Autenticación local activa'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
