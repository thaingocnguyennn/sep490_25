import { useState, useCallback } from 'react';
import { rolesApi } from '../../api';

interface UseRoleActionsResult {
  deleteRole: (id: number) => Promise<void>;
  actionLoading: boolean;
}

export function useRoleActions(onSuccess: () => void): UseRoleActionsResult {
  const [actionLoading, setActionLoading] = useState(false);

  const deleteRole = useCallback(async (id: number) => {
    setActionLoading(true);
    try {
      await rolesApi.delete(id);
      onSuccess();
    } finally {
      setActionLoading(false);
    }
  }, [onSuccess]);

  return { deleteRole, actionLoading };
}
