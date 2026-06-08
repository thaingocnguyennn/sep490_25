import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { routes } from './routes/routes';
import { useRoutes } from 'react-router-dom';

function AppRoutes() {
  const element = useRoutes(routes);
  return element!;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
