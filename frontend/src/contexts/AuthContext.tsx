import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { User } from '../types';
import { authApi } from '../api';
import { ROLES, type RoleName } from '../shared/constants/roles';

export { ROLES, type RoleName };

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isDepartmentHead: boolean;
  isSpecialist: boolean;
  isDocumentClerk: boolean;
  hasRole: (role: RoleName) => boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

  const login = useCallback((newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore logout errors
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  }, []);

  const roleFlags = useMemo(() => {
    const roles: string[] = user?.roles ?? [];
    return {
      isAdmin: roles.includes(ROLES.ADMIN),
      isDepartmentHead: roles.includes(ROLES.DEPARTMENT_HEAD),
      isSpecialist: roles.includes(ROLES.SPECIALIST),
      isDocumentClerk: roles.includes(ROLES.DOCUMENT_CLERK),
    };
  }, [user?.roles]);

  const hasRole = useCallback(
    (role: RoleName) => user?.roles?.includes(role) ?? false,
    [user?.roles]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token && !!user,
        ...roleFlags,
        hasRole,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
