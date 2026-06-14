import { useState, useCallback } from 'react';
import { usersApi } from '../../api';
import type { User } from '../../types';

export interface ProcessorOption {
  id: number;
  fullName: string;
  email: string;
  roles: string[];
}

interface UseProcessorsResult {
  processors: ProcessorOption[];
  loading: boolean;
  fetch: () => void;
}

export function useProcessors(): UseProcessorsResult {
  const [processors, setProcessors] = useState<ProcessorOption[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(() => {
    setLoading(true);
    usersApi
      .getAll({ limit: 100 })
      .then(({ data }) => {
        setProcessors(
          data.data!.items.map((u: User) => ({
            id: u.id,
            fullName: u.fullName,
            email: u.email,
            roles: u.roles,
          }))
        );
      })
      .catch(() => setProcessors([]))
      .finally(() => setLoading(false));
  }, []);

  return { processors, loading, fetch };
}
