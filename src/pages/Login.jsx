import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/AuthContext';
import { Fuel, LogIn } from 'lucide-react';

export default function Login() {
  const { navigateToLogin, authError } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-md">
        <CardHeader className="space-y-3 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl overflow-hidden shadow-sm">
            <img src="/fuelflow-logo.svg" alt="FuelFlow" className="w-full h-full object-cover" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800">FuelFlow</CardTitle>
          <p className="text-sm text-slate-500">Inicia sesión para acceder al sistema.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {authError?.message && (
            <div className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-700 px-3 py-2">
              {authError.message}
            </div>
          )}
          <Button className="w-full h-10" onClick={() => navigateToLogin(window.location.origin)}>
            <LogIn className="w-4 h-4 mr-2" /> Continuar con Google
          </Button>
          <p className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
            <Fuel className="w-3 h-3" /> Autenticación gestionada con Supabase
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
