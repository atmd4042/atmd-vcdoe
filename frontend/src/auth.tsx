import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";
import { api, TOKEN_KEY } from "@/src/api";

export type User = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: "admin" | "service_provider" | "customer";
  wallet_balance?: number;
  bio?: string;
  office_name?: string;
  subscription?: any;
  suspended?: boolean;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
};

const AuthContext = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (!token) {
        setUserState(null);
        return;
      }
      const me = await api.get("/auth/me");
      setUserState(me);
    } catch {
      setUserState(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(async (token: string, u: User) => {
    await storage.secureSet(TOKEN_KEY, token);
    setUserState(u);
  }, []);

  const signOut = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setUserState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refresh, setUser: setUserState }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
