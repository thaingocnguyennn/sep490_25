import { useState, useEffect } from 'react';
import { rolesApi } from '../../api';
import type { Role } from '../../types';

interface UseRolesOptions {
  autoFetch?: boolean;
}

interface UseRolesResult {
  roles: Role[];
  loading: boolean;
  error: string;
  refetch: () => void;
}

export function useRoles(options: UseRolesOptions = {}): UseRolesResult {
  const { autoFetch = true } = options;
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = () => {
    setLoading(true);
    setError('');
    rolesApi
      .getAll()
      .then(({ data }) => setRoles(data.data ?? []))
      .catch(() => setError('Failed to load roles'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (autoFetch) fetch();
  }, []);

  return { roles, loading, error, refetch: fetch };
}
