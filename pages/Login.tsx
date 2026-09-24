import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Loader2, AlertTriangle, LockKeyhole, User } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Login() {
  const { user, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isLoading) return null;

  if (user) {
    if (user.role === 'viewer') {
      return <Navigate to="/gate-pass/records" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!hasSupabaseConfig) {
      setError("Supabase configuration is missing. Please check your environment variables.");
      setLoading(false);
      return;
    }

    try {
      const { data: users, error: signInError } = await supabase.rpc('login_user', {
        p_username: username.trim(),
        p_password: password
      });

      if (signInError) {
        throw signInError;
      }

      if (!users || users.length === 0) {
        throw new Error("Invalid username or password");
      }

      const userData = users[0];
      
      if (!userData.is_active) {
        throw new Error("Account has been disabled. Please contact admin.");
      }

      signIn(userData);
      if (userData.role === 'viewer') {
        navigate("/gate-pass/records");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#F3F4F6] dark:bg-[#0B0F19] font-sans p-4 sm:p-8">
      <div className="w-full max-w-[420px] bg-white dark:bg-slate-900 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] border border-slate-100 dark:border-slate-800 overflow-hidden">
        
        <div className="p-8 sm:p-10 space-y-8">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="h-12 w-12 bg-slate-900 border border-slate-700 dark:bg-white dark:border-slate-200 rounded-xl flex items-center justify-center shadow-sm">
              <Building2 className="h-6 w-6 text-white dark:text-slate-900" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">STR-2 GPMS</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Sign in to your account</p>
            </div>
          </div>

          {!hasSupabaseConfig && (
            <Alert variant="destructive" className="bg-red-50 dark:bg-red-950/50 text-red-800 dark:text-red-300 border-red-200 dark:border-red-900">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="font-semibold text-sm">Configuration Missing</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                Supabase URL and Anon Key are missing. The app cannot authenticate.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-5 mt-6">
            {error && (
              <div className="p-3.5 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm rounded-lg border border-red-100 dark:border-red-900/50 flex items-start gap-2.5">
                 <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                 <span>{error}</span>
              </div>
            )}
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username" className="text-sm text-slate-700 dark:text-slate-300 font-medium">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="pl-9 h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-1 focus-visible:ring-slate-400 focus-visible:border-slate-400 dark:focus-visible:ring-slate-500 transition-all text-sm"
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm text-slate-700 dark:text-slate-300 font-medium">Password</Label>
                </div>
                <div className="relative">
                  <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-9 h-10 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-1 focus-visible:ring-slate-400 focus-visible:border-slate-400 dark:focus-visible:ring-slate-500 transition-all text-sm"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full h-10 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 font-medium text-sm transition-colors shadow-sm" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Sign in"}
            </Button>
          </form>
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t border-slate-100 dark:border-slate-800">
          <div className="text-center text-xs text-slate-500 dark:text-slate-400">
            &copy; {new Date().getFullYear()} Stretchline Commercial Dep.<br />All rights reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
