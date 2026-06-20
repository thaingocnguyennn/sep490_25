export { authApi } from './modules/auth';
export { usersApi } from './modules/users';
export { rolesApi } from './modules/roles';
export { documentsApi, incomingDocumentsApi } from './modules/documents';
export { departmentsApi } from './modules/departments';
export type {
  IncomingDocumentDetail,
  IncomingDocumentListItem,
  OcrResult,
  CreateIncomingDocumentRequest,
  ProcessIncomingDocumentRequest,
  HeadAction,
  DocumentStatus,
  Priority,
  ProcessorType,
  Urgency,
  UrgencyRecord,
  DocumentProcessor,
  DocumentAttachment,
  DocumentWorkflow,
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
