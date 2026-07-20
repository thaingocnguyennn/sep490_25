import { default as prisma } from '../../config/database';
import { NotFoundError, BadRequestError } from '../../shared/exceptions/app-error';

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
              processors: {
                include: {
                  user: {
                    include: { department: true }
                  }
                }
              }
            }
          },
          department: true,
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
      let assignedDept = doc.department?.name || '';
      let assignedUser = '';
      if (doc.document.processors && doc.document.processors.length > 0) {
        // Ưu tiên người xử lý chính (XLC) hoặc trưởng phòng
        const mainProcessor = doc.document.processors.find(p => p.processorType === 'XLC') || doc.document.processors[0];
        if (mainProcessor.user) {
          assignedUser = mainProcessor.user.fullName || '';
          if (!assignedDept && mainProcessor.user.department) {
            assignedDept = mainProcessor.user.department.name;
          }
        }
      }

      // 5. Tạo IncomingBookEntry
      const arrivalDate = customArrivalDate || doc.dateReceived || new Date();
      
      const docNumber = doc.documentNumber || doc.document.documentNumber;
      
      const entry = await tx.incomingBookEntry.create({
        data: {
          documentBookId,
          incomingDocumentId,
          arrivalNumber,
          arrivalDate,
          senderSnapshot: doc.issuer || '',
          documentNumberSnapshot: docNumber,
          documentSymbolSnapshot: docNumber && docNumber.includes('/') ? docNumber.split('/')[1] : null,
          documentDateSnapshot: doc.dateLetter,
          documentTypeSnapshot: doc.documentType || doc.document.type,
          summarySnapshot: doc.summary || doc.document.description || doc.document.title,
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
}

export const documentRegistrationService = new DocumentRegistrationService();
