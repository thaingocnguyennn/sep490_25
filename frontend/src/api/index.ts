export { authApi } from './modules/auth';
export { usersApi } from './modules/users';
export { rolesApi } from './modules/roles';
export { documentsApi, incomingDocumentsApi } from './modules/documents';
export type { SpecialistAction, ProcessSpecialistDocumentRequest } from './modules/documents';
export { departmentsApi } from './modules/departments';
export { documentBooksApi } from './modules/document-books';
export type {
  IncomingDocumentDetail,
  IncomingDocumentListItem,
  CreateIncomingDocumentRequest,
  ProcessIncomingDocumentRequest,
  HeadAction,
  DocumentStatus,
  ProcessorType,
  Urgency,
  WorkflowStatus,
} from './modules/documents';
export type {
  Department,
  DepartmentMember,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  AddMembersRequest,
  AddMembersResult,
} from './modules/departments';
export { default as api } from './axios';
