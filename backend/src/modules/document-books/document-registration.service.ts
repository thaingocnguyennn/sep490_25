import { default as prisma } from '../../config/database';
import { NotFoundError, BadRequestError } from '../../shared/exceptions/app-error';
import { formatOfficialNumber } from '../../shared/utils/document-number.util';

export class DocumentRegistrationService {
  /**
   * Đăng ký văn bản đến vào sổ văn bản đến (Atomic operation).
   * @param incomingDocumentId ID của văn bản đến
   * @param documentBookId ID của sổ văn bản đến
   * @param registeredById ID của người thực hiện đăng ký (thường là văn thư)
   * @param customArrivalDate Ngày đến (nếu không cung cấp sẽ lấy từ document.dateReceived hoặc now)
   */
  async registerIncomingDocument(
    incomingDocumentId: number,
    documentBookId: number,
    registeredById: number,
    customArrivalDate?: Date
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Kiểm tra văn bản đến
      const doc = await tx.incomingDocument.findUnique({
        where: { id: incomingDocumentId },
        include: {
          document: {
            include: {
              documentTypeRef: { select: { id: true, name: true, code: true } },
              processors: {
                include: {
                  user: {
                    include: { department: true }
                  }
                }
              }
            }
          },
        }
      });

      if (!doc) throw new NotFoundError('Văn bản đến không tồn tại');
      if (doc.document.status === 'REGISTERED' || doc.documentBookId) {
        throw new BadRequestError('Văn bản đến này đã được đăng ký vào sổ');
      }

      // 2. Kiểm tra sổ văn bản
      const book = await tx.documentBook.findUnique({
        where: { id: documentBookId }
      });

      if (!book) throw new NotFoundError('Sổ văn bản không tồn tại');
      if (book.bookType !== 'INCOMING') throw new BadRequestError('Sổ này không phải là sổ văn bản đến');
      if (book.status !== 'ACTIVE') throw new BadRequestError('Sổ văn bản không ở trạng thái hoạt động');

      // 3. Increment số hiện tại của sổ (Atomic lock on documentBook row)
      const updatedBook = await tx.documentBook.update({
        where: { id: documentBookId },
        data: {
          currentNumber: { increment: 1 }
        },
        select: { currentNumber: true }
      });
      const arrivalNumber = updatedBook.currentNumber;

      // 4. Lấy thông tin snapshot từ processing details
      let assignedDept = '';
      let assignedUser = '';
      if (doc.document.processors && doc.document.processors.length > 0) {
        const mainProcessor = doc.document.processors.find(p => p.processorType === 'XLC') || doc.document.processors[0];
        if (mainProcessor.user) {
          assignedUser = mainProcessor.user.fullName || '';
          if (mainProcessor.user.department) {
            assignedDept = mainProcessor.user.department.name;
          }
        }
      }

      // 5. Tạo IncomingBookEntry
      const arrivalDate = customArrivalDate || doc.dateReceived || new Date();
      const docNumber = doc.document.documentNumber;

      const entry = await tx.incomingBookEntry.create({
        data: {
          documentBookId,
          incomingDocumentId,
          arrivalNumber,
          arrivalDate,
          senderSnapshot: doc.document.issuer || '',
          documentNumberSnapshot: docNumber,
          documentSymbolSnapshot: docNumber && docNumber.includes('/') ? docNumber.split('/')[1] : null,
          documentDateSnapshot: doc.document.issuedDate,
          documentTypeSnapshot: doc.document.documentTypeRef?.name ?? '',
          summarySnapshot: doc.document.subject || '',
          assignedDepartmentSnapshot: assignedDept,
          assignedUserSnapshot: assignedUser,
          registeredById,
        }
      });

      // 6. Cập nhật IncomingDocument và Document (status)
      await tx.incomingDocument.update({
        where: { id: incomingDocumentId },
        data: { 
          documentBookId,
          arrivalNumber
        }
      });

      await tx.document.update({
        where: { id: doc.documentId },
        data: { status: 'REGISTERED' }
      });

      return {
        entry,
        arrivalNumber
      };
    });
  }

  /**
   * Đăng ký văn bản đi vào sổ văn bản đi (Atomic operation theo chuẩn Nghị định 30).
   * @param outgoingDocumentId ID của văn bản đi
   * @param documentBookId ID của sổ văn bản đi
   * @param registeredById ID của người thực hiện đăng ký
   * @param customIssuanceDate Ngày ban hành (nếu không cung cấp lấy ngày hiện tại)
   */
  async registerOutgoingDocument(
    outgoingDocumentId: number,
    documentBookId: number,
    registeredById: number,
    customIssuanceDate?: Date
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Kiểm tra văn bản đi
      const doc = await tx.outgoingDocument.findUnique({
        where: { id: outgoingDocumentId },
        include: {
          document: {
            include: {
              documentTypeRef: { select: { id: true, name: true, code: true } },
              department: { select: { id: true, name: true } },
            },
          },
          issuedByUser: true,
        }
      });

      if (!doc) throw new NotFoundError('Văn bản đi không tồn tại');
      if (doc.document.status === 'REGISTERED' || doc.documentBookId) {
        throw new BadRequestError('Văn bản đi này đã được đăng ký vào sổ');
      }

      // 2. Kiểm tra sổ văn bản
      const book = await tx.documentBook.findUnique({
        where: { id: documentBookId },
        include: { department: true }
      });

      if (!book) throw new NotFoundError('Sổ văn bản không tồn tại');
      if (book.bookType !== 'OUTGOING') throw new BadRequestError('Sổ này không phải là sổ văn bản đi');
      if (book.status !== 'ACTIVE') throw new BadRequestError('Sổ văn bản không ở trạng thái hoạt động');

      // 3. Tính toán số thứ tự tiếp theo (đảm bảo tăng dần và tuyệt đối không trùng lặp trong năm)
      const maxEntryInYear = await tx.outgoingBookEntry.findFirst({
        where: {
          documentBook: { year: book.year },
        },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      const maxSeq = maxEntryInYear ? maxEntryInYear.sequenceNumber : 0;
      const targetSeq = Math.max(book.currentNumber, maxSeq) + 1;

      const updatedBook = await tx.documentBook.update({
        where: { id: documentBookId },
        data: {
          currentNumber: targetSeq,
        },
        select: { currentNumber: true },
      });
      const sequenceNumber = updatedBook.currentNumber;

      // 4. Tạo số đi chính thức (officialNumber) chuẩn Nghị định 30
      // Cấu trúc: [Số thứ tự]/[Ký hiệu loại VB]-[Ký hiệu đơn vị soạn thảo]
      // VD: sequenceNumber = 5, documentNumber = "QĐ-UBND" -> "05/QĐ-UBND"
      const typeCode = doc.document.documentTypeRef?.code || 'VB';
      const deptCode = book.code || '';

      const officialNumber = formatOfficialNumber({
        sequenceNumber,
        typeCode,
        departmentCode: deptCode,
        documentSymbol: doc.documentNumber,
      });

      // Kiểm tra trùng lặp officialNumber với văn bản khác đang hoạt động
      const existingConflict = await tx.outgoingDocument.findFirst({
        where: {
          id: { not: outgoingDocumentId },
          dispatchNumber: officialNumber,
          document: { documentStatus: 'ACTIVE', status: { not: 'TRASHED' as any } },
        },
        select: { id: true, dispatchNumber: true },
      });
      if (existingConflict) {
        throw new BadRequestError(
          `Số đi/Số ký hiệu chính thức "${officialNumber}" đã tồn tại trên một văn bản khác trong hệ thống. Vui lòng kiểm tra lại sổ văn bản.`
        );
      }

      const docSymbol = doc.documentNumber || (deptCode ? `${typeCode}-${deptCode}` : typeCode);

      // 5. Tạo OutgoingBookEntry (Lưu snapshot bất biến)
      const issuanceDate = customIssuanceDate || doc.issuanceDate || new Date(); 
      
      const entry = await tx.outgoingBookEntry.create({
        data: {
          documentBookId,
          outgoingDocumentId,
          sequenceNumber,
          officialNumber,
          documentSymbol: docSymbol,
          issuanceDate,
          documentTypeSnapshot: doc.document.documentTypeRef?.name ?? typeCode,
          summarySnapshot: doc.document.subject || '',
          signerSnapshot: doc.document.signerName || '',
          recipientsSnapshot: doc.recipientName || '',
          archiveRecipientSnapshot: book.department.name,
          copyCount: doc.pageCount || 1,
          registeredById,
        }
      });

      // 6. Cập nhật OutgoingDocument và Document
      await tx.outgoingDocument.update({
        where: { id: outgoingDocumentId },
        data: {
          documentBookId,
          dispatchNumber: officialNumber,
          issuanceDate,
        }
      });

      await tx.document.update({
        where: { id: doc.documentId },
        data: {
          status: 'REGISTERED',
          documentNumber: officialNumber,
        }
      });

      return {
        entry,
        sequenceNumber,
        officialNumber
      };
    });
  }

  /**
   * Giữ số đi trước (Đặt gạch số) cho văn bản đi
   */
  async reserveOutgoingNumber(
    outgoingDocumentId: number,
    documentBookId: number,
    registeredById: number,
  ) {
    return prisma.$transaction(async (tx) => {
      const doc = await tx.outgoingDocument.findUnique({
        where: { id: outgoingDocumentId },
        include: {
          document: {
            include: {
              documentTypeRef: { select: { id: true, name: true, code: true } },
              department: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!doc) throw new NotFoundError('Văn bản đi không tồn tại');
      if (doc.documentBookId) throw new BadRequestError('Văn bản đã được cấp số hoặc giữ số trước đó');

      const book = await tx.documentBook.findUnique({
        where: { id: documentBookId },
        include: { department: true },
      });
      if (!book || book.bookType !== 'OUTGOING' || book.status !== 'ACTIVE') {
        throw new BadRequestError('Sổ văn bản không hợp lệ hoặc đang bị khóa');
      }

      // Tính toán số thứ tự dự kiến tiếp theo trong năm (đảm bảo tuyệt đối không trùng lặp)
      const maxEntryInYear = await tx.outgoingBookEntry.findFirst({
        where: {
          documentBook: { year: book.year },
        },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
      });

      const maxSeq = maxEntryInYear ? maxEntryInYear.sequenceNumber : 0;
      const targetSeq = Math.max(book.currentNumber, maxSeq) + 1;

      const updatedBook = await tx.documentBook.update({
        where: { id: documentBookId },
        data: { currentNumber: targetSeq },
        select: { currentNumber: true },
      });
      const sequenceNumber = updatedBook.currentNumber;

      const typeCode = doc.document.documentTypeRef?.code || 'VB';
      const deptCode = book.code || '';

      const reservedNumber = formatOfficialNumber({
        sequenceNumber,
        typeCode,
        departmentCode: deptCode,
        documentSymbol: doc.documentNumber,
      });

      // Kiểm tra trùng lặp reservedNumber với văn bản khác đang hoạt động
      const existingConflict = await tx.outgoingDocument.findFirst({
        where: {
          id: { not: outgoingDocumentId },
          dispatchNumber: reservedNumber,
          document: { documentStatus: 'ACTIVE', status: { not: 'TRASHED' as any } },
        },
        select: { id: true, dispatchNumber: true },
      });
      if (existingConflict) {
        throw new BadRequestError(
          `Số đi dự kiến "${reservedNumber}" đã tồn tại trên một văn bản khác trong hệ thống.`
        );
      }

      await tx.outgoingDocument.update({
        where: { id: outgoingDocumentId },
        data: {
          documentBookId,
          dispatchNumber: reservedNumber,
        },
      });

      return {
        sequenceNumber,
        reservedNumber,
      };
    });
  }
}

export const documentRegistrationService = new DocumentRegistrationService();
