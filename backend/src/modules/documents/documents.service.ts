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
import { performOcr, extractFields } from '../../shared/services/ocr.service';
import { uploadHandler, deleteFromSupabase, isExternalUrl } from '../../shared/services/storage.service';
import prisma from '../../config/database';

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
      urgencyId: params.urgencyId,
      confidentialityId: params.confidentialityId,
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
      dateOnLetter?: string;
      /** @deprecated Use dateOnLetter — kept for legacy API compatibility. */
      issuanceDate?: string;
      issuer?: string;
      signerName?: string;
      signerTitle?: string;
      notes?: string;
      /** Canonical urgency: seeded name (THUONG/KHAN/THUONG_KHAN/HOA_TOC), legacy alias, or numeric id */
      urgency?: string;
      /** Accepts a code ('A'/'B'/'C'), seeded name, numeric id, or legacy ConfidentialityLevel */
      confidentialityLevel?: string;
      confidentialityId?: string;
      categoryId?: string;
      documentTypeId?: string;
      departmentId?: string;
      // Incoming-specific fields
      pageCount?: string;
      arrivalNumber?: string;
      dateReceived?: string;
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

    // Build the file URL - use storage service for both local and Supabase
    const fileUrl = file ? await uploadHandler(file) : undefined;

    const doc = await documentsRepository.create({
      documentNumber,
      title: data.title,
      description: data.description,
      type: data.type as any,
      fileUrl,
      dateOnLetter: data.dateOnLetter
        ? new Date(data.dateOnLetter)
        : data.issuanceDate
          ? new Date(data.issuanceDate)
          : undefined,
      issuer: data.issuer,
      signerName: data.signerName,
      signerTitle: data.signerTitle,
      notes: data.notes,
      urgencyId: data.urgency ?? undefined,
      confidentialityId: data.confidentialityId ?? data.confidentialityLevel,
      categoryId: data.categoryId ? Number(data.categoryId) : undefined,
      documentTypeId: data.documentTypeId ? Number(data.documentTypeId) : undefined,
      originalFileName: file?.originalname,
      fileSize: file?.size,
      mimeType: file?.mimetype,
      departmentId: data.departmentId ? Number(data.departmentId) : undefined,
      createdBy,
    });

    // Theo Nghị định 30: Đồng bộ dữ liệu sang sổ Văn bản đến / Văn bản đi
    if (data.type === 'INCOMING') {
      await prisma.incomingDocument.create({
        data: {
          documentId: doc.id,
          dateReceived: data.dateReceived ? new Date(data.dateReceived) : new Date(),
          pageCount: data.pageCount ? Number(data.pageCount) : undefined,
          arrivalNumber: data.arrivalNumber ? Number(data.arrivalNumber) : undefined,
        },
      });
    } else if (data.type === 'OUTGOING') {
      await prisma.outgoingDocument.create({
        data: {
          documentId: doc.id,
          recipientName: 'Chưa cập nhật',
          sentDate: new Date(),
        },
      });
    }

    return doc;
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
      dateOnLetter?: string | null;
      /** @deprecated Use dateOnLetter — kept for legacy API compatibility. */
      issuanceDate?: string | null;
      /** New canonical urgency: seeded name, legacy alias, numeric id, or null to clear */
      urgency?: string | null;
      /** Accepts a code ('A'/'B'/'C'), seeded name, numeric id, or legacy ConfidentialityLevel */
      confidentialityLevel?: string;
      confidentialityId?: string | null;
      categoryId?: number | null;
      documentTypeId?: number | null;
      issuer?: string | null;
      signerName?: string | null;
      signerTitle?: string | null;
      notes?: string | null;
      departmentId?: number | null;
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
      existing.type === 'ARCHIVAL' ||
      existing.isArchived
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

    const updatedDoc = await documentsRepository.update(id, {
      documentNumber: data.documentNumber,
      title: data.title,
      description: data.description,
      type: data.type as any,
      dateOnLetter: data.dateOnLetter === null
        ? null
        : data.dateOnLetter
          ? new Date(data.dateOnLetter)
          : data.issuanceDate
            ? new Date(data.issuanceDate)
            : undefined,
      issuer: data.issuer,
      signerName: data.signerName,
      signerTitle: data.signerTitle,
      notes: data.notes,
      urgencyId: data.urgency !== undefined ? data.urgency : undefined,
      confidentialityId:
        data.confidentialityId !== undefined
          ? data.confidentialityId
          : data.confidentialityLevel !== undefined
            ? data.confidentialityLevel
            : undefined,
      categoryId: data.categoryId,
      documentTypeId: data.documentTypeId,
      departmentId: data.departmentId,
      updatedBy,
    });

    // Handle type change sync
    if (data.type && data.type !== existing.type) {
      if (data.type === 'INCOMING') {
        const incomingExist = await prisma.incomingDocument.findUnique({ where: { documentId: id } });
        if (!incomingExist) {
          await prisma.incomingDocument.create({
            data: { documentId: id, dateReceived: new Date() }
          });
        }
      } else if (data.type === 'OUTGOING') {
        const outgoingExist = await prisma.outgoingDocument.findUnique({ where: { documentId: id } });
        if (!outgoingExist) {
          await prisma.outgoingDocument.create({
            data: { documentId: id, recipientName: 'Chưa cập nhật', sentDate: new Date() }
          });
        }
      }
    }

    return updatedDoc;
  }

  /**
   * Archive a completed document.
   */
  async archiveDocument(id: number, updatedBy: number): Promise<void> {
    const existing = await documentsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Document not found');
    }

    if (existing.documentStatus === 'DELETED') {
      throw new BadRequestError('Cannot archive a deleted document');
    }

    const validStatuses = ['COMPLETED', 'ISSUED', 'APPROVED'];
    if (!validStatuses.includes(existing.status)) {
      throw new BadRequestError('Only completed, issued, or approved documents can be archived');
    }

    if (existing.isArchived) {
      throw new BadRequestError('Document is already archived');
    }

    // Begin transaction for update and logging
    await prisma.$transaction([
      prisma.document.update({
        where: { id },
        data: {
          isArchived: true,
          updatedBy,
        },
      }),
      prisma.systemLog.create({
        data: {
          userId: updatedBy,
          action: 'ARCHIVE_DOCUMENT',
          entityType: 'Document',
          entityId: id,
          details: 'Document archived',
        },
      }),
    ]);
  }

  /**
   * Reopen an archived document.
   */
  async reopenDocument(id: number, updatedBy: number, reason: string): Promise<void> {
    const existing = await documentsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Document not found');
    }

    if (!existing.isArchived) {
      throw new BadRequestError('Document is not archived');
    }

    // Begin transaction for update and logging
    await prisma.$transaction([
      prisma.document.update({
        where: { id },
        data: {
          isArchived: false,
          status: 'IN_PROGRESS', // Cập nhật lại status để mở khóa thao tác
          updatedBy,
        },
      }),
      prisma.systemLog.create({
        data: {
          userId: updatedBy,
          action: 'REOPEN_DOCUMENT',
          entityType: 'Document',
          entityId: id,
          details: `Document reopened. Reason: ${reason}`,
        },
      }),
    ]);
  }

  /**
   * Cập nhật trạng thái của tài liệu
   */
  async updateStatus(id: number, status: string, updatedBy: number): Promise<void> {
    const existing = await documentsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Document not found');
    }

    if (existing.isArchived) {
      throw new BadRequestError('Cannot update status of an archived document');
    }

    const validStatuses = ['DRAFT', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'ISSUED', 'APPROVED', 'REJECTED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestError('Invalid document status');
    }

    await prisma.$transaction([
      prisma.document.update({
        where: { id },
        data: {
          status: status as any,
          updatedBy,
        },
      }),
      prisma.systemLog.create({
        data: {
          userId: updatedBy,
          action: 'UPDATE_DOCUMENT_STATUS',
          entityType: 'Document',
          entityId: id,
          details: `Document status changed from ${existing.status} to ${status}`,
        },
      }),
    ]);
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

    // Delete the file from storage (local or Supabase)
    if (existing.fileUrl) {
      if (isExternalUrl(existing.fileUrl)) {
        await deleteFromSupabase(existing.fileUrl);
      } else {
        // Local file deletion handled separately
        const filePath = path.join(config.uploadDir, path.basename(existing.fileUrl));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    await documentsRepository.hardDelete(id);
  }

  /**
   * Get basic stats for dashboard (legacy, simple version).
   */
  async getStats(): Promise<{ total: number; incoming: number; outgoing: number }> {
    return documentsRepository.getStats();
  }

  /**
   * GET /documents/dashboard-stats
   * Thống kê tổng hợp văn bản đến và đi theo Nghị định 30/2020/NĐ-CP.
   * Trả về:
   *  - KPI tổng quan (tổng đến, tổng đi, đang xử lý, đã hoàn thành)
   *  - Trend 12 tháng so sánh lượng văn bản đến/đi
   *  - Phân bổ trạng thái văn bản đi (theo DocumentLifecycleStatus)
   *  - Phân bổ theo độ khẩn của văn bản đến
   */
  async getDashboardStats(params: { year?: number; departmentId?: number }) {
    const year = params.year ?? new Date().getFullYear();
    const departmentId = params.departmentId;
    const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
    const endOfYear = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const baseDocumentFilter: any = { documentStatus: 'ACTIVE' };
    if (departmentId && departmentId !== -1) {
      baseDocumentFilter.departmentId = departmentId;
    } else if (departmentId === -1) {
      // If departmentId is -1, it means the user has no department but is restricted.
      // We force a query that matches nothing.
      baseDocumentFilter.departmentId = -1;
    }

    // ─── 1. KPI tổng quan ───────────────────────────────────────────────────
    const [totalIncoming, totalOutgoing, incomingPending, outgoingIssued] = await Promise.all([
      prisma.incomingDocument.count({
        where: { document: baseDocumentFilter },
      }),
      prisma.outgoingDocument.count({
        where: { document: baseDocumentFilter },
      }),
      prisma.document.count({
        where: {
          ...baseDocumentFilter,
          type: 'INCOMING',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      }),
      prisma.document.count({
        where: { 
          ...baseDocumentFilter,
          type: 'OUTGOING',
          status: 'ISSUED' 
        },
      }),
    ]);

    // ─── 2. Trend 12 tháng trong năm ────────────────────────────────────────
    const [incomingByMonth, outgoingByMonth] = await Promise.all([
      prisma.incomingDocument.groupBy({
        by: ['dateReceived'],
        where: {
          document: baseDocumentFilter,
          dateReceived: { gte: startOfYear, lt: endOfYear },
        },
        _count: { id: true },
      }),
      prisma.outgoingDocument.groupBy({
        by: ['createdAt'],
        where: {
          document: baseDocumentFilter,
          createdAt: { gte: startOfYear, lt: endOfYear },
        },
        _count: { id: true },
      }),
    ]);

    const incomingMonthly = Array(12).fill(0);
    const outgoingMonthly = Array(12).fill(0);

    for (const row of incomingByMonth) {
      if (row.dateReceived) {
        const month = new Date(row.dateReceived).getMonth();
        incomingMonthly[month] += row._count.id;
      }
    }
    for (const row of outgoingByMonth) {
      if (row.createdAt) {
        const month = new Date(row.createdAt).getMonth();
        outgoingMonthly[month] += row._count.id;
      }
    }

    // ─── 3. Phân bổ trạng thái văn bản đi (Document.status) ─────────────────
    const outgoingStatusDistribution = await prisma.document.groupBy({
      by: ['status'],
      where: { ...baseDocumentFilter, type: 'OUTGOING' },
      _count: { id: true },
    });

    // ─── 4. Phân bổ theo độ khẩn văn bản đến ────────────────────────────────
    const incomingByUrgency = await prisma.document.groupBy({
      by: ['urgencyId'],
      where: { ...baseDocumentFilter, type: 'INCOMING' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const urgencyIds = incomingByUrgency
      .map((r) => r.urgencyId)
      .filter((id): id is number => id !== null);

    const urgencies = urgencyIds.length > 0
      ? await prisma.urgency.findMany({ where: { id: { in: urgencyIds } } })
      : [];

    const urgencyMap = new Map(urgencies.map((u: any) => [u.id, u.name]));

    const urgencyDistribution = incomingByUrgency.map((r) => ({
      name: r.urgencyId ? urgencyMap.get(r.urgencyId) ?? 'Không xác định' : 'Chưa phân loại',
      count: r._count.id,
    }));

    // ─── 5. Phân bổ trạng thái văn bản đến (document.status) ────────────────
    const incomingStatusDistribution = await prisma.document.groupBy({
      by: ['status'],
      where: { ...baseDocumentFilter, type: 'INCOMING' },
      _count: { id: true },
    });

    return {
      kpi: {
        totalIncoming,
        totalOutgoing,
        incomingPending,       // Văn bản đến đang chờ / đang xử lý
        outgoingIssued,        // Văn bản đi đã được phát hành
        total: totalIncoming + totalOutgoing,
      },
      trend: {
        year,
        months: ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'],
        incoming: incomingMonthly,
        outgoing: outgoingMonthly,
      },
      outgoingStatus: outgoingStatusDistribution.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
      incomingStatus: incomingStatusDistribution.map((r) => ({
        status: r.status,
        count: r._count.id,
      })),
      urgencyDistribution,
    };
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
      { header: 'Urgency', key: 'urgencyName', width: 14 },
      { header: 'Confidentiality', key: 'confidentialityName', width: 16 },
      { header: 'Issuer', key: 'issuer', width: 25 },
      { header: 'Date on Letter', key: 'dateOnLetter', width: 16 },
      { header: 'Department', key: 'department', width: 20 },
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
        urgencyName: doc.urgency ? doc.urgency.name : '—',
        confidentialityName: doc.confidentiality
          ? `${doc.confidentiality.code ? `(${doc.confidentiality.code}) ` : ''}${doc.confidentiality.name}`
          : '—',
        issuer: doc.issuer || '—',
        dateOnLetter: doc.dateOnLetter ? new Date(doc.dateOnLetter).toLocaleDateString() : '—',
        department: doc.department?.name || '—',
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
      const headers = ['#', 'Doc Number', 'Title', 'Type', 'Urgency', 'Status', 'Date on Letter'];

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
          item.urgency ? item.urgency.name : '—',
          item.documentStatus,
          item.dateOnLetter ? new Date(item.dateOnLetter).toLocaleDateString() : '—',
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
  async performOcr(imageBuffer: Buffer, mimeType: string, mode: string = 'INCOMING') {
    const result = await performOcr(imageBuffer, mimeType);
    // Pass the real per-page PageOcr array (with bounding-box layout)
    // into the layout-aware field extractor. Going through
    // extractFieldsFromOcrText() would discard the layout info and
    // collapse every page into a synthetic single-page where
    // region-based extractors can no longer locate anything.
    //
    // When OCR_FIELD_DEBUG=1 is set in the environment, every
    // extractFields call returns a non-enumerable `__trace` array
    // describing the per-field decisions (selected value, bbox,
    // confidence, reason). We surface that on the result as
    // `fieldTrace` so the caller can inspect what the layout
    // interpreter picked without leaking it into the regular
    // extractedFields JSON.
    const debug = process.env.OCR_FIELD_DEBUG === '1';
    // Combined embedded-text + OCR mode (July 2026 rewrite): for PDF
    // inputs the OCR pipeline returns both the OCR pages (used for
    // document number + date) and the embedded-text pages (used for
    // issuer / documentType / summary). We forward both to the field
    // extractor so it can apply the per-source routing. Image inputs
    // have no embedded text layer, in which case the extractor's
    // `sources` is omitted and routing falls back to `pages` (OCR).
    const extractedFields = extractFields(result.pages, mode, {
      debug,
      sources: {
        embeddedPages: result.embeddedPages,
        ocrPages: result.ocrPages,
      },
    });

    // Stash the debug trace so callers can inspect it.
    const fieldTrace = (extractedFields as any).__trace;

    return {
      confidence: result.confidence,
      extractedFields,
      ...(debug && fieldTrace ? { fieldTrace } : {}),
    };
  }
}

export const documentsService = new DocumentsService();
