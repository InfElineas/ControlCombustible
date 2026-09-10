import { Toaster } from "@/components/ui/toaster";
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClientInstance } from '@/lib/query-client';
import { persistOptions } from '@/lib/query-persist';
import { pagesConfig } from './pages.config';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import Login from '@/pages/Login';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isAuthenticated } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={Layout ? <Layout /> : <></>}>
        <Route path="/" element={<MainPage />} />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route key={path} path={`/${path}`} element={<Page />} />
        ))}
      </Route>
      {/* Con la sesión ya abierta, /Login no está entre las rutas y caía en el
          comodín: al entrar —con contraseña, con Google o al registrarse— la
          dirección seguía siendo /Login durante un instante y aparecía la página
          de «no encontrado». Quien llegue aquí ya autenticado va al panel. */}
      <Route path="/Login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <PersistQueryClientProvider
        client={queryClientInstance}
        persistOptions={persistOptions}
      >
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </PersistQueryClientProvider>
    </AuthProvider>
  );
}

export default App;
