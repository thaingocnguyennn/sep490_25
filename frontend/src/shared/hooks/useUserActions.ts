import { useState, useCallback } from 'react';
import { usersApi } from '../../api';

interface UseUserActionsResult {
  lockUser: (id: number) => Promise<void>;
  unlockUser: (id: number) => Promise<void>;
  deleteUser: (id: number) => Promise<void>;
  actionLoading: boolean;
}

export function useUserActions(onSuccess: () => void): UseUserActionsResult {
  const [actionLoading, setActionLoading] = useState(false);

  const lockUser = useCallback(async (id: number) => {
    setActionLoading(true);
    try {
      await usersApi.lock(id);
      onSuccess();
    } finally {
      setActionLoading(false);
    }
  }, [onSuccess]);

  const unlockUser = useCallback(async (id: number) => {
    setActionLoading(true);
    try {
      await usersApi.unlock(id);
      onSuccess();
    } finally {
      setActionLoading(false);
    }
  }, [onSuccess]);

  const deleteUser = useCallback(async (id: number) => {
    setActionLoading(true);
    try {
      await usersApi.delete(id);
      onSuccess();
    } finally {
      setActionLoading(false);
    }
  }, [onSuccess]);

  return { lockUser, unlockUser, deleteUser, actionLoading };
}
