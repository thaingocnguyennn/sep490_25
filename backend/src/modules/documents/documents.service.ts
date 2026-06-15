import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { config } from '../../config';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/exceptions/app-error';
import {
  documentsRepository,
  DocumentDetail,
  DocumentListParams,
  DocumentListResult,
  DocumentSummary,
} from './documents.repository';
import { performOcr, extractFieldsFromOcrText } from '../../shared/services/ocr.service';

// ─── Service ────────────────────────────────────────────────────────────────

export class DocumentsService {
  /**
   * Get a paginated, filtered list of documents.
   */
  async getAll(params: DocumentListParams): Promise<DocumentListResult> {
    return documentsRepository.findAll({
      page: params.page || 1,
      limit: params.limit || 10,
      search: params.search,
      type: params.type,
      status: params.status,
      urgencyLevel: params.urgencyLevel,
      confidentialityLevel: params.confidentialityLevel,
      departmentId: params.departmentId,
      processorId: params.processorId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    });
  }

  /**
   * Get full details of a single document.
   * Throws NotFoundError if the document doesn't exist.
   */
  async getById(id: number): Promise<DocumentDetail> {
    const doc = await documentsRepository.findById(id);
    if (!doc) {
      throw new NotFoundError('Document not found');
    }
    return doc;
  }

  /**
   * Handle file upload + create a new document record.
   * Validates the document number for uniqueness.
   */
  async upload(
    file: Express.Multer.File | undefined,
    data: {
      documentNumber?: string;
      title: string;
      description?: string;
      type: string;
      issuanceDate?: string;
      sendingAgency?: string;
      urgencyLevel?: string;
      confidentialityLevel?: string;
      category?: string;
      departmentId?: string;
      processorId?: string;
    },
    createdBy: number
  ): Promise<DocumentDetail> {
    // Generate document number if not provided
    const documentNumber = data.documentNumber || await documentsRepository.generateDocumentNumber(data.type);

    // Validate: document number must be unique
    const exists = await documentsRepository.existsByDocumentNumber(documentNumber);
    if (exists) {
      throw new ConflictError('Document number already exists');
    }

    // Build the relative file URL for client access
    const fileUrl = file ? `/uploads/${file.filename}` : undefined;

    return documentsRepository.create({
      documentNumber,
      title: data.title,
      description: data.description,
      type: data.type as any,
      fileUrl,
      issuanceDate: data.issuanceDate ? new Date(data.issuanceDate) : undefined,
      sendingAgency: data.sendingAgency,
      urgencyLevel: (data.urgencyLevel as any) || 'NORMAL',
      confidentialityLevel: (data.confidentialityLevel as any) || 'NORMAL',
      category: data.category,
      originalFileName: file?.originalname,
      fileSize: file?.size,
      mimeType: file?.mimetype,
      departmentId: data.departmentId ? Number(data.departmentId) : undefined,
      processorId: data.processorId ? Number(data.processorId) : undefined,
      createdBy,
    });
  }

  /**
   * Update document metadata. The physical file is not changed.
   * Validates the document exists and the new document number (if changed) is unique.
   */
  async updateMetadata(
    id: number,
    data: {
      documentNumber?: string;
      title?: string;
      description?: string;
      type?: string;
      issuanceDate?: string | null;
      sendingAgency?: string;
      urgencyLevel?: string;
      confidentialityLevel?: string;
      category?: string;
      departmentId?: number | null;
      processorId?: number | null;
    },
    updatedBy: number
  ): Promise<DocumentDetail> {
    const existing = await documentsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Document not found');
    }

    // Không cho phép sửa nếu văn bản đã hoàn tất, bị huỷ, hoặc đã lưu trữ
    const readonlyStatuses = ['COMPLETED', 'CANCELLED', 'REJECTED'];
    if (
      readonlyStatuses.includes(existing.status) ||
      existing.type === 'ARCHIVAL'
    ) {
      throw new BadRequestError('Cannot update a completed, cancelled, or archival document');
    }

    // If document number is being changed, check for conflicts
    if (data.documentNumber && data.documentNumber !== existing.documentNumber) {
      const conflict = await documentsRepository.existsByDocumentNumber(data.documentNumber);
      if (conflict) {
        throw new ConflictError('Document number already exists');
      }
    }

    return documentsRepository.update(id, {
      documentNumber: data.documentNumber,
      title: data.title,
      description: data.description,
      type: data.type as any,
      issuanceDate: data.issuanceDate === null ? null : data.issuanceDate ? new Date(data.issuanceDate) : undefined,
      sendingAgency: data.sendingAgency,
      urgencyLevel: data.urgencyLevel as any,
      confidentialityLevel: data.confidentialityLevel as any,
      category: data.category,
      departmentId: data.departmentId,
      processorId: data.processorId,
      updatedBy,
    });
  }

  /**
   * Soft-delete a document (set documentStatus to DELETED).
   */
  async softDelete(id: number, updatedBy: number): Promise<void> {
    const existing = await documentsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Document not found');
    }
    await documentsRepository.softDelete(id, updatedBy);
  }

  /**
   * Restore a soft-deleted document (set documentStatus to ACTIVE).
   */
  async restore(id: number, updatedBy: number): Promise<void> {
    const existing = await documentsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Document not found');
    }
    await documentsRepository.restore(id, updatedBy);
  }

  /**
   * Hard-delete a document completely from the database.
   */
  async hardDelete(id: number): Promise<void> {
    const existing = await documentsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Document not found');
    }
    // Note: Optionally we could delete the physical file here as well
    // using fs.unlinkSync(this.getFilePath(existing)) if required.
    await documentsRepository.hardDelete(id);
  }

  /**
   * Get basic stats for dashboard.
   */
  async getStats(): Promise<{ total: number; incoming: number; outgoing: number }> {
    return documentsRepository.getStats();
  }

  /**
   * Resolve the absolute path to a document's file on disk.
   * Used for download and inline preview.
   */
  getFilePath(doc: DocumentDetail): string {
    if (!doc.fileUrl) {
      throw new NotFoundError('No file attached to this document');
    }
    // fileUrl is stored as "/uploads/filename.ext"
    const filename = path.basename(doc.fileUrl);
    const filePath = path.join(config.uploadDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('File not found on server');
    }
    return filePath;
  }

  /**
   * Export the filtered document list to an Excel workbook.
   * Returns a Buffer containing the .xlsx file.
   */
  async exportToExcel(params: DocumentListParams): Promise<Buffer> {
    const documents = await documentsRepository.findForExport(params);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DMS System';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Documents');

    // Define columns
    sheet.columns = [
      { header: '#', key: 'index', width: 6 },
      { header: 'Document Number', key: 'documentNumber', width: 20 },
      { header: 'Title', key: 'title', width: 40 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Urgency', key: 'urgencyLevel', width: 12 },
      { header: 'Confidentiality', key: 'confidentialityLevel', width: 16 },
      { header: 'Sending Agency', key: 'sendingAgency', width: 25 },
      { header: 'Issuance Date', key: 'issuanceDate', width: 16 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Processor', key: 'processor', width: 20 },
      { header: 'Status', key: 'documentStatus', width: 10 },
      { header: 'Created At', key: 'createdAt', width: 20 },
    ];

    // Style header row
    sheet.getRow(1).font = { bold: true, size: 12 };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows
    documents.forEach((doc, index) => {
      sheet.addRow({
        index: index + 1,
        documentNumber: doc.documentNumber,
        title: doc.title,
        type: doc.type,
        urgencyLevel: doc.urgencyLevel,
        confidentialityLevel: doc.confidentialityLevel,
        sendingAgency: doc.sendingAgency || '—',
        issuanceDate: doc.issuanceDate ? new Date(doc.issuanceDate).toLocaleDateString() : '—',
        department: doc.department?.name || '—',
        processor: doc.processor?.fullName || '—',
        documentStatus: doc.documentStatus,
        createdAt: new Date(doc.createdAt).toLocaleString(),
      });
    });

    // Write to buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
  }

  /**
   * Export the filtered document list to a PDF document.
   * Returns a Buffer containing the .pdf file.
   */
  async exportToPdf(params: DocumentListParams): Promise<Buffer> {
    const documents = await documentsRepository.findForExport(params);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(18).text('Document List', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Exported: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(1);

      // Table header
      const startX = 40;
      let y = doc.y;
      const colWidths = [30, 100, 200, 80, 70, 80, 100];
      const headers = ['#', 'Doc Number', 'Title', 'Type', 'Urgency', 'Status', 'Issuance Date'];

      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach((header, i) => {
        const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.text(header, x, y, { width: colWidths[i], align: 'left' });
      });

      // Line under header
      y = doc.y + 4;
      doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
      y += 6;

      // Data rows
      doc.font('Helvetica').fontSize(8);
      documents.forEach((item, index) => {
        // Add a new page if we're running out of space
        if (y > doc.page.height - 60) {
          doc.addPage();
          y = 40;
        }

        const row = [
          String(index + 1),
          item.documentNumber,
          item.title.length > 40 ? item.title.substring(0, 40) + '...' : item.title,
          item.type,
          item.urgencyLevel,
          item.documentStatus,
          item.issuanceDate ? new Date(item.issuanceDate).toLocaleDateString() : '—',
        ];

        row.forEach((cell, i) => {
          const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
          doc.text(cell, x, y, { width: colWidths[i], align: 'left' });
        });

        y = doc.y + 4;
      });

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).text(`Total: ${documents.length} documents`, { align: 'right' });

      doc.end();
    });
  }

  /**
   * Perform OCR on an uploaded file buffer.
   */
  async performOcr(imageBuffer: Buffer, mimeType: string) {
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
