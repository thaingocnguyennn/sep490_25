import { documentBooksRepository } from './document-books.repository';
import { CreateDocumentBookInput, UpdateDocumentBookInput, ListDocumentBooksQuery } from './document-books.types';
import { NotFoundError, ConflictError, BadRequestError } from '../../shared/exceptions/app-error';

export class DocumentBooksService {
  async list(query: ListDocumentBooksQuery) {
    return documentBooksRepository.findAll(query);
  }

  async getById(id: number) {
    const book = await documentBooksRepository.findById(id);
    if (!book) {
      throw new NotFoundError('Sổ văn bản không tồn tại');
    }
    return book;
  }

  async create(input: CreateDocumentBookInput, createdById: number) {
    // Check if name is unique within the same department, bookType, year
    const nameCount = await documentBooksRepository.countByNameAndDepartmentAndYearAndType(
      input.name,
      input.departmentId,
      input.year,
      input.bookType
    );
    if (nameCount > 0) {
      throw new ConflictError('Tên sổ văn bản đã tồn tại trong năm và loại này');
    }

    // Handle isDefault logic
    if (input.isDefault) {
      await documentBooksRepository.unsetDefaultBook(input.departmentId, input.bookType, input.year);
    }

    return documentBooksRepository.create(input, createdById);
  }

  async update(id: number, input: UpdateDocumentBookInput) {
    const book = await documentBooksRepository.findById(id);
    if (!book) {
      throw new NotFoundError('Sổ văn bản không tồn tại');
    }

    if (input.name && input.name !== book.name) {
      const nameCount = await documentBooksRepository.countByNameAndDepartmentAndYearAndType(
        input.name,
        book.departmentId,
        book.year,
        book.bookType,
        id
      );
      if (nameCount > 0) {
        throw new ConflictError('Tên sổ văn bản đã tồn tại');
      }
    }

    if (input.isDefault && !book.isDefault) {
      await documentBooksRepository.unsetDefaultBook(book.departmentId, book.bookType, book.year);
    }

    return documentBooksRepository.update(id, input);
  }

  async closeBook(id: number) {
    const book = await documentBooksRepository.findById(id);
    if (!book) throw new NotFoundError('Sổ văn bản không tồn tại');
    if (book.status === 'CLOSED') throw new BadRequestError('Sổ đã được đóng');

    return documentBooksRepository.updateStatus(id, 'CLOSED');
  }

  async reopenBook(id: number) {
    const book = await documentBooksRepository.findById(id);
    if (!book) throw new NotFoundError('Sổ văn bản không tồn tại');
    if (book.status === 'ACTIVE') throw new BadRequestError('Sổ đang ở trạng thái hoạt động');

    return documentBooksRepository.updateStatus(id, 'ACTIVE');
  }

  async deleteOrInactive(id: number) {
    const book = await documentBooksRepository.findById(id);
    if (!book) throw new NotFoundError('Sổ văn bản không tồn tại');

    const hasEntries = await documentBooksRepository.hasEntries(id);
    if (hasEntries) {
      // If there are entries, we cannot delete, only mark as INACTIVE
      if (book.isDefault) {
        throw new BadRequestError('Không thể vô hiệu hóa sổ đang là mặc định. Vui lòng chọn sổ mặc định khác trước.');
      }
      return documentBooksRepository.updateStatus(id, 'INACTIVE');
    }

    // If no entries, we can physically delete or just set to INACTIVE (we'll set INACTIVE for safety)
    return documentBooksRepository.updateStatus(id, 'INACTIVE');
  }
}

export const documentBooksService = new DocumentBooksService();
