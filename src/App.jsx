import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import AuthPage from './pages/AuthPage';
import HouseSetup from './pages/HouseSetup';
import AppLayout from './components/layout/AppLayout';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user, activeHouse } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  if (!activeHouse) return <Navigate to="/setup" replace />;
  
  return children;
};

// Setup Route Wrapper
const SetupRoute = ({ children }) => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route path="/setup" element={
              <SetupRoute>
                <HouseSetup />
              </SetupRoute>
            } />
            <Route path="/*" element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            } />
          </Routes>
        </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}

export default App;
