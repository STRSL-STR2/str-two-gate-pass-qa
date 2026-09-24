import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import { Profile } from "@/types";

interface AuthContextType {
  user: Profile | null; // We map the app_user to both user and profile
  profile: Profile | null;
  isLoading: boolean;
  signIn: (user: Profile) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    if (!hasSupabaseConfig) return;
    try {
      const { data, error } = await supabase
        .from("app_users")
        .select("id, username, email, role, is_active, created_at")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setProfile(data as Profile);
        localStorage.setItem("auth_user", JSON.stringify(data));
      }
    } catch (e) {
      console.error("Failed to fetch profile:", e);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (profile) {
      await fetchProfile(profile.id);
    }
  }, [profile, fetchProfile]);

  useEffect(() => {
    // Check local storage for session
    const storedUser = localStorage.getItem("auth_user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setProfile(parsed);
        // Async refresh
        fetchProfile(parsed.id);
      } catch (e) {
        localStorage.removeItem("auth_user");
      }
    }
    
    setIsLoading(false);
  }, [fetchProfile]);

  const signIn = (user: Profile) => {
    setProfile(user);
    localStorage.setItem("auth_user", JSON.stringify(user));
  };

  const signOut = async () => {
    setIsLoading(true);
    setProfile(null);
    localStorage.removeItem("auth_user");
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user: profile, profile, isLoading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

