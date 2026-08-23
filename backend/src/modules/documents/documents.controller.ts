import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { documentsService } from './documents.service';
import { successResponse, paginatedResponse } from '../../shared/utils/response.util';
import { checkDocumentAccess } from '../../shared/access/document-access';

// ─── Controller ─────────────────────────────────────────────────────────────

export class DocumentsController {
  /**
   * GET /documents/stats
   * Get basic document stats.
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await documentsService.getStats();
      res.status(200).json(successResponse(stats, 'Stats retrieved'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /documents/dashboard-stats?year=2025
   * Thống kê tổng hợp văn bản đến và đi theo Nghị định 30/2020/NĐ-CP.
   */
  async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      
      let departmentId: number | undefined;
      if (req.user!.roles.includes('SPECIALIST') && 
          !req.user!.roles.includes('ADMIN') && 
          !req.user!.roles.includes('DEPARTMENT_HEAD') && 
          !req.user!.roles.includes('DOCUMENT_CLERK')) {
        departmentId = req.user!.departmentId || -1;
      }

      const stats = await documentsService.getDashboardStats({ year, departmentId });
      res.status(200).json(successResponse(stats, 'Dashboard stats retrieved'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /documents
   * List documents with filtering and pagination.
   */
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        page, limit, search, type, status,
        urgency, urgencyId,
        confidentialityLevel, confidentialityId,
        departmentId, processorId,
        dateFrom, dateTo,
      } = req.query;

      const result = await documentsService.getAll({
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 10,
        search: search as string,
        type: type as any,
        status: status as any,
        urgencyId: (urgencyId ?? urgency) as any,
        confidentialityId: (confidentialityId ?? confidentialityLevel) as any,
        departmentId: departmentId ? Number(departmentId) : undefined,
        processorId: processorId ? Number(processorId) : undefined,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        isArchived: req.query.isArchived ? req.query.isArchived === 'true' : undefined,
      });

      res.status(200).json(
        paginatedResponse(
          result.documents,
          result.total,
          result.page,
          result.limit,
          'Documents retrieved'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /documents/:id
   * Get full details of a single document.
   */
  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const doc = await documentsService.getById(id);
      res.status(200).json(successResponse(doc, 'Document retrieved'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /documents/upload
   * Upload a file and create a document record.
   * Uses multer middleware (file is in req.file).
   */
  async upload(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await documentsService.upload(
        req.file,
        req.body,
        req.user!.userId
      );
      res.status(201).json(successResponse(doc, 'Document uploaded successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /documents
   * Create a document without file upload.
   */
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const doc = await documentsService.upload(
        undefined,
        req.body,
        req.user!.userId
      );
      res.status(201).json(successResponse(doc, 'Document created successfully'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /documents/:id
   * Update document metadata (does not replace the file).
   */
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const doc = await documentsService.updateMetadata(
        id,
        req.body,
        req.user!.userId
      );
      res.status(200).json(successResponse(doc, 'Document updated'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /documents/:id/status
   * Update the status of a document (DRAFT, COMPLETED, etc.)
   */
  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      await documentsService.updateStatus(id, status, req.user!.userId);
      res.status(200).json(successResponse(null, 'Document status updated'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /documents/:id/archive
   * Archive a document
   */
  async archive(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await documentsService.archiveDocument(id, req.user!.userId);
      res.status(200).json(successResponse(null, 'Document archived'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /documents/:id/reopen
   * Reopen an archived document
   */
  async reopen(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;
      await documentsService.reopenDocument(id, req.user!.userId, reason);
      res.status(200).json(successResponse(null, 'Document reopened'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /documents/:id
   * Soft-delete a document (set status to DELETED).
   */
  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await documentsService.softDelete(id, req.user!.userId);
      res.status(200).json(successResponse(null, 'Document deleted'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /documents/:id/restore
   * Restore a soft-deleted document.
   */
  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await documentsService.restore(id, req.user!.userId);
      res.status(200).json(successResponse(null, 'Document restored'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /documents/:id/permanent
   * Hard-delete a document permanently.
   */
  async hardDelete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await documentsService.hardDelete(id);
      res.status(200).json(successResponse(null, 'Document permanently deleted'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /documents/:id/preview
   * Stream the PDF file inline for in-browser viewing.
   * Now requires access to the underlying document (incoming ACL applies).
   */
  async preview(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await checkDocumentAccess(id, req.user!.userId, req.user!.roles ?? []);
      const doc = await documentsService.getById(id);
      const filePath = documentsService.getFilePath(doc);

      // Determine content type from stored MIME or file extension
      const contentType = doc.mimeType || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', 'inline'); // display in browser
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /documents/:id/download
   * Force-download the original file as an attachment.
   * Now requires access to the underlying document (incoming ACL applies).
   */
  async download(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await checkDocumentAccess(id, req.user!.userId, req.user!.roles ?? []);
      const doc = await documentsService.getById(id);
      const filePath = documentsService.getFilePath(doc);

      // Use the original filename if available, otherwise the stored filename
      const downloadName = doc.originalFileName || path.basename(filePath);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /documents/export?format=excel|pdf
   * Export the filtered document list to Excel or PDF.
   */
  async exportList(req: Request, res: Response, next: NextFunction) {
    try {
      const format = (req.query.format as string) || 'excel';
      const filterParams = {
        search: req.query.search as string,
        type: req.query.type as any,
        status: req.query.status as any,
        urgencyId: (req.query.urgencyId ?? req.query.urgency) as any,
        confidentialityId: (req.query.confidentialityId ?? req.query.confidentialityLevel) as any,
        departmentId: req.query.departmentId ? Number(req.query.departmentId) : undefined,
        processorId: req.query.processorId ? Number(req.query.processorId) : undefined,
        dateFrom: req.query.dateFrom as string,
        dateTo: req.query.dateTo as string,
        isArchived: req.query.isArchived ? req.query.isArchived === 'true' : undefined,
      };

      if (format === 'pdf') {
        const buffer = await documentsService.exportToPdf(filterParams);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="documents.pdf"');
        res.send(buffer);
      } else {
        // Default: Excel
        const buffer = await documentsService.exportToExcel(filterParams);
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', 'attachment; filename="documents.xlsx"');
        res.send(buffer);
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /documents/ocr
   * Perform OCR on an uploaded file.
   */
  async performOcr(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const mimeType = req.body.mimeType || req.file.mimetype;
      const mode = req.body.mode || req.query.mode || 'INCOMING';
      const result = await documentsService.performOcr(req.file.buffer, mimeType, mode);
      res.status(200).json(successResponse(result, 'OCR completed'));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /documents/verify-signatures
   * Kiểm tra chữ ký số và tính toàn vẹn trực tiếp trên tệp tải lên (chưa cần tạo văn bản).
   */
  async verifySignatures(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'Không có tệp tải lên' });
        return;
      }
      const {
        extractSignaturesFromFile,
        buildSignatureSummary,
        buildVisualMarks,
        calculateFileHash,
      } = await import('../../shared/utils/pdf-signature.util');
      const { config } = await import('../../config');
      const fs = await import('fs');

      const buffer = req.file.buffer;
      const mimeType = req.body.mimeType || req.file.mimetype;
      const filename = req.file.originalname || 'document.pdf';
      const fileHash = calculateFileHash(buffer);

      let tempFilePath: string | undefined;
      try {
        const tempDir = path.join(config.uploadDir, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        tempFilePath = path.join(tempDir, `sig_check_${Date.now()}_${filename}`);
        fs.writeFileSync(tempFilePath, buffer);
      } catch {
        // Ignore
      }

      let signatures;
      try {
        signatures = extractSignaturesFromFile(buffer, tempFilePath, mimeType);
      } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch {}
        }
      }

      const isPdf =
        (mimeType && mimeType.includes('pdf')) ||
        path.extname(filename).toLowerCase() === '.pdf';

      const response = {
        documentId: 0,
        fileName: filename,
        fileType: signatures.length > 0 ? signatures[0].fileType : (isPdf ? 'PDF' : 'WORD'),
        fileHash,
        signatureCount: signatures.length,
        summary: buildSignatureSummary(signatures),
        signatures,
        visualMarks: buildVisualMarks(),
        warning: 'Xác thực chữ ký số PDF theo chuẩn ISO 32000 và pyHanko. Mã băm SHA-256 xác minh tính toàn vẹn của tệp.',
      };

      res.status(200).json(successResponse(response, 'Signature verification completed'));
    } catch (error) {
      next(error);
    }
  }
}

export const documentsController = new DocumentsController();
