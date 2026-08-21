import api from '../axios';

export interface DocumentBook {
  id: number;
  name: string;
  code?: string | null;
  bookType: 'INCOMING' | 'OUTGOING';
  year: number;
  currentNumber: number;
  isDefault: boolean;
  status: 'ACTIVE' | 'CLOSED' | 'INACTIVE';
  description?: string | null;
  departmentId: number;
  createdById: number;
  openedAt: string;
  closedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  department?: {
    id: number;
    name: string;
  };
  createdBy?: {
    id: number;
    fullName: string;
  };
  _count?: {
    incomingEntries: number;
    outgoingEntries: number;
  };
}

export interface CreateDocumentBookRequest {
  name: string;
  code?: string;
  bookType: 'INCOMING' | 'OUTGOING';
  year: number;
  departmentId: number;
  currentNumber?: number;
  isDefault?: boolean;
  description?: string;
}

export interface UpdateDocumentBookRequest {
  name?: string;
  code?: string | null;
  description?: string | null;
  isDefault?: boolean;
}

export interface DocumentBooksListResponse {
  items: DocumentBook[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Entry sổ văn bản đến */
export interface IncomingBookEntryItem {
  id: number;
  arrivalNumber: number;
  arrivalDate: string;
  senderSnapshot: string;
  documentNumberSnapshot?: string | null;
  summarySnapshot: string;
  documentTypeSnapshot?: string | null;
  assignedDepartmentSnapshot?: string | null;
  registeredAt: string;
  incomingDocument: {
    id: number;
    document: {
      id: number;
      subject: string;
      status: string;
      urgency?: { name: string } | null;
    };
    documentTypeRef?: { name: string } | null;
  };
}

/** Entry sổ văn bản đi */
export interface OutgoingBookEntryItem {
  id: number;
  sequenceNumber: number;
  officialNumber: string;
  documentSymbol?: string | null;
  issuanceDate: string;
  summarySnapshot: string;
  signerSnapshot?: string | null;
  recipientsSnapshot: string;
  documentTypeSnapshot?: string | null;
  registeredAt: string;
  outgoingDocument: {
    id: number;
    recipientName?: string | null;
    document: {
      id: number;
      subject: string;
      status: string;
      urgency?: { name: string } | null;
    };
    documentTypeRef?: { name: string } | null;
  };
}

export interface BookEntriesResponse {
  items: (IncomingBookEntryItem | OutgoingBookEntryItem)[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const documentBooksApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    bookType?: string;
    year?: number;
    status?: string;
  }) => {
    const response = await api.get<DocumentBooksListResponse>('/document-books', { params });
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get<DocumentBook>(`/document-books/${id}`);
    return response.data;
  },

  getEntries: async (id: number, params?: { page?: number; limit?: number }) => {
    const response = await api.get<BookEntriesResponse>(`/document-books/${id}/entries`, { params });
    return response.data;
  },

  create: async (data: CreateDocumentBookRequest) => {
    const response = await api.post<DocumentBook>('/document-books', data);
    return response.data;
  },

  update: async (id: number, data: UpdateDocumentBookRequest) => {
    const response = await api.patch<DocumentBook>(`/document-books/${id}`, data);
    return response.data;
  },

  closeBook: async (id: number) => {
    const response = await api.post<DocumentBook>(`/document-books/${id}/close`);
    return response.data;
  },

  reopenBook: async (id: number) => {
    const response = await api.post<DocumentBook>(`/document-books/${id}/reopen`);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete<{ success: boolean; data: DocumentBook }>(`/document-books/${id}`);
    return response.data;
  },
};
