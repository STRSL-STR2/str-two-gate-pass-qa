import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ThemeProvider } from "@/components/theme-provider";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages could be here, but we'll use direct imports for now
import Login from "@/pages/Login";
import DataUpload from "@/pages/DataUpload";
import MasterData from "@/pages/MasterData";
import CreateGatePass from "@/pages/CreateGatePass";
import GatePassRecords from "@/pages/GatePassRecords";
import InvoiceRecords from "@/pages/InvoiceRecords";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";
import Profile from "@/pages/Profile";

function ProtectedRoute({ children, requireAdmin = false, requireNonViewer = false }: { children: React.ReactNode, requireAdmin?: boolean, requireNonViewer?: boolean }) {
  const { user, profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (requireAdmin && profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    return (
      <div className="h-screen w-full flex items-center justify-center flex-col">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  if (requireNonViewer && profile?.role === 'viewer') {
    return (
      <div className="h-screen w-full flex items-center justify-center flex-col">
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground">Your account is restricted to viewing Gate Pass Records only.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="stretchline-theme">
      <AuthProvider>
        <TooltipProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Login />} />
              
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/upload" element={<ProtectedRoute requireNonViewer><DataUpload /></ProtectedRoute>} />
                <Route path="/master-data" element={<ProtectedRoute requireNonViewer><MasterData /></ProtectedRoute>} />
                <Route path="/invoice-records" element={<ProtectedRoute requireNonViewer><InvoiceRecords /></ProtectedRoute>} />
                <Route path="/master-summary" element={<Navigate to="/master-data" replace />} />
                <Route path="/gate-pass/new" element={<ProtectedRoute requireNonViewer><CreateGatePass /></ProtectedRoute>} />
                <Route path="/gate-pass/records" element={<GatePassRecords />} />
                <Route path="/dashboard" element={<ProtectedRoute requireNonViewer><Dashboard /></ProtectedRoute>} />
                <Route path="/profile" element={<Profile />} />
                
                {/* Admin Only */}
                <Route path="/settings" element={
                  <ProtectedRoute requireAdmin>
                    <Settings />
                  </ProtectedRoute>
                } />
              </Route>
              
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster position="top-right" richColors />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
