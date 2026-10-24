import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthResponse, SessionUser } from "@checkiq/contracts";
import { request, setAccessToken } from "./api";

interface AuthContextValue {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "anonymous";
  login: (identifier: string, password: string) => Promise<SessionUser>;
  signup: (input: SignupInput) => Promise<SignupResponse | null>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export interface SignupInput {
  candidateId: string;
  fullName: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword: string;
  company?: string;
  department?: string;
  position?: string;
}

export interface SignupResponse {
  userId?: string;
  email: string;
  fullName: string;
  requiresEmailVerification: boolean;
  verificationCode?: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  /**
   * Exchanges the httpOnly refresh cookie for a fresh access token.
   * Returns null when there is no valid session.
   */
  const fetchSession = useCallback(async (): Promise<AuthResponse | null> => {
    try {
      return await request<AuthResponse>("/auth/refresh", {
        method: "POST",
        body: {},
        auth: false,
      });
    } catch {
      return null;
    }
  }, []);

  const applySession = useCallback((session: AuthResponse) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const refreshSession = useCallback(async () => {
    const session = await fetchSession();
    if (session) {
      applySession(session);
    } else {
      clearSession();
    }
  }, [applySession, clearSession, fetchSession]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await fetchSession();
      if (cancelled) return;
      if (session) {
        applySession(session);
      } else {
        clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession, fetchSession]);

  const login = useCallback(
    async (email: string, password: string): Promise<SessionUser> => {
      const session = await request<AuthResponse>("/auth/login", {
        method: "POST",
        body: { identifier: email, password },
        auth: false,
      });
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const signup = useCallback(
    async (input: SignupInput): Promise<SignupResponse | null> => {
      const result = await request<{
        userId?: string;
        email: string;
        fullName: string;
        requiresEmailVerification: boolean;
        verificationCode?: string | null;
      }>(
        "/auth/signup",
        {
          method: "POST",
          body: input,
          auth: false,
        },
      );
      if (result.requiresEmailVerification) {
        // User needs to verify email before they can log in
        setAccessToken(null);
        setUser(null);
        setStatus("anonymous");
      } else {
        // No verification needed, sign in directly (not expected for candidates)
        setAccessToken(null);
        setUser(null);
        setStatus("anonymous");
      }
      return result;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await request("/auth/logout", { method: "POST", body: {} });
    } catch {
      // Signing out locally is enough even if the server call fails.
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, signup, logout, refreshSession }),
    [user, status, login, signup, logout, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}

/**
 * The landing route for a signed-in user.
 *
 * Candidates start on their own dashboard; staff start on the operations
 * queue, which is the only case list they may open.
 */
export function homeRouteFor(user: Pick<SessionUser, "roles"> | null): string {
  if (!user) return "/login";
  const isStaff = user.roles.some((role) => role !== "CANDIDATE");
  return isStaff ? "/ops" : "/dashboard";
}
