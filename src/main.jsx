import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from '@/App';
import { queryClientInstance } from '@/lib/query-client';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClientInstance}>
      <BrowserRouter>
        <App />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
