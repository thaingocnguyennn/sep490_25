export const ROLES = {
  ADMIN: 'ADMIN',
  DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
  SPECIALIST: 'SPECIALIST',
  DOCUMENT_CLERK: 'DOCUMENT_CLERK',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_IDS: Record<RoleName, number> = {
  ADMIN: 1,
  DEPARTMENT_HEAD: 2,
  SPECIALIST: 3,
  DOCUMENT_CLERK: 4,
};
