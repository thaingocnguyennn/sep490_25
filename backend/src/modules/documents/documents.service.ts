import { default as prisma } from '../../config/database';
import { documentsRepository } from './documents.repository';
import { performOcr, extractFieldsFromOcrText } from '../../shared/services/ocr.service';
import { NotFoundError } from '../../shared/exceptions/app-error';
import { OcrStatus, DocumentStatus } from '@prisma/client';

export interface CreateDocumentData {
  title: string;
  type: string;
  description?: string;
  fileUrl?: string;
  ocrText?: string;
  priority?: string;
  deadline?: Date;
  status?: string;
  createdBy: number;
}

export interface UpdateDocumentData {
  title?: string;
  description?: string;
  fileUrl?: string;
  ocrText?: string;
  priority?: string;
  deadline?: Date;
  status?: string;
  updatedBy: number;
}

export class DocumentsService {
  async list(params: { page: number; limit: number; search?: string; type?: string; status?: string }) {
    return documentsRepository.findAll(params);
  }

  async getById(id: number) {
    return documentsRepository.findById(id);
  }

  async create(data: CreateDocumentData) {
    const documentNumber = await documentsRepository.generateDocumentNumber(data.type);
    return documentsRepository.create({
      documentNumber,
      title: data.title,
      type: data.type as any,
      description: data.description,
      fileUrl: data.fileUrl,
      ocrText: data.ocrText,
      ocrStatus: data.ocrText ? OcrStatus.COMPLETED : OcrStatus.PENDING,
      priority: (data.priority as any) || 'NORMAL',
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      status: (data.status as any) || DocumentStatus.DRAFT,
      createdBy: data.createdBy,
    });
  }

  async update(id: number, data: UpdateDocumentData) {
    const existing = await documentsRepository.findById(id);
    if (!existing) throw new NotFoundError('Document not found');

    return documentsRepository.update(id, {
      title: data.title,
      description: data.description,
      fileUrl: data.fileUrl,
      ocrText: data.ocrText,
      priority: data.priority as any,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      status: data.status as any,
      updatedBy: data.updatedBy,
    });
  }

  async delete(id: number) {
    await documentsRepository.findById(id);
    return documentsRepository.delete(id);
  }

  async performOcr(imageBuffer: Buffer, mimeType: string) {
    await prisma.document.updateMany({
      where: { ocrStatus: OcrStatus.PROCESSING },
      data: { ocrStatus: OcrStatus.FAILED },
    });

    const result = await performOcr(imageBuffer, mimeType);
    const extractedFields = extractFieldsFromOcrText(result.text);

    return {
      text: result.text,
      confidence: result.confidence,
      extractedFields,
    };
  }
}

export const documentsService = new DocumentsService();
