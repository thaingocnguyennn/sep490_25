export const ROLES = {
  ADMIN: 'ADMIN',
  DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
  SPECIALIST: 'SPECIALIST',
  DOCUMENT_CLERK: 'DOCUMENT_CLERK',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
