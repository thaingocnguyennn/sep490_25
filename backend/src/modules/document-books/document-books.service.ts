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

  /**
   * Lấy danh sách văn bản đã đăng ký trong sổ (phân trang).
   */
  async getEntries(id: number, page: number = 1, limit: number = 20) {
    const book = await documentBooksRepository.findById(id);
    if (!book) throw new NotFoundError('Sổ văn bản không tồn tại');
    return documentBooksRepository.findEntriesByBookId(book.id, book.bookType, page, limit);
  }

  async create(input: CreateDocumentBookInput, createdById: number) {
    const nameCount = await documentBooksRepository.countByNameAndDepartmentAndYearAndType(
      input.name,
      input.departmentId,
      input.year,
      input.bookType,
    );
    if (nameCount > 0) {
      throw new ConflictError('Tên sổ văn bản đã tồn tại trong năm và loại này');
    }

    if (input.isDefault) {
      await documentBooksRepository.unsetDefaultBook(input.departmentId, input.bookType, input.year);
    }

    return documentBooksRepository.create(input, createdById);
  }

  async update(id: number, input: UpdateDocumentBookInput) {
    const book = await documentBooksRepository.findById(id);
    if (!book) throw new NotFoundError('Sổ văn bản không tồn tại');

    // Sổ đã khóa không được chỉnh sửa (Report 3)
    if (book.status === 'CLOSED') {
      throw new BadRequestError('Không thể chỉnh sửa sổ đã khóa. Vui lòng mở lại sổ trước.');
    }
    // Sổ ngừng hoạt động không được chỉnh sửa
    if (book.status === 'INACTIVE') {
      throw new BadRequestError('Không thể chỉnh sửa sổ đang ngừng hoạt động.');
    }

    if (input.name && input.name !== book.name) {
      const nameCount = await documentBooksRepository.countByNameAndDepartmentAndYearAndType(
        input.name,
        book.departmentId,
        book.year,
        book.bookType,
        id,
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
    if (book.status === 'CLOSED') throw new BadRequestError('Sổ văn bản đã được khóa.');
    if (book.status === 'INACTIVE') throw new BadRequestError('Không thể khóa sổ đang ngừng hoạt động.');

    return documentBooksRepository.updateStatus(id, 'CLOSED');
  }

  async reopenBook(id: number) {
    const book = await documentBooksRepository.findById(id);
    if (!book) throw new NotFoundError('Sổ văn bản không tồn tại');
    if (book.status === 'ACTIVE') throw new BadRequestError('Sổ văn bản đang ở trạng thái hoạt động.');
    if (book.status === 'INACTIVE') throw new BadRequestError('Không thể mở lại sổ đang ngừng hoạt động. Chức năng này chỉ áp dụng cho sổ đã khóa (CLOSED).');

    return documentBooksRepository.updateStatus(id, 'ACTIVE');
  }

  /**
   * Xóa sổ văn bản:
   * - Sổ đang CLOSED → không cho xóa
   * - Sổ chưa có văn bản → soft-delete (biến mất khỏi danh sách)
   * - Sổ đã có văn bản → chuyển INACTIVE (văn bản cũ được giữ nguyên)
   */
  async deleteOrInactive(id: number) {
    const book = await documentBooksRepository.findById(id);
    if (!book) throw new NotFoundError('Sổ văn bản không tồn tại');

    if (book.status === 'CLOSED') {
      throw new BadRequestError('Không thể xóa sổ đã khóa. Vui lòng mở lại sổ trước nếu muốn xóa.');
    }

    if (book.status === 'INACTIVE') {
      throw new BadRequestError('Sổ văn bản này đã ngừng hoạt động.');
    }

    const entriesCount = await documentBooksRepository.countEntries(id);
    const totalEntries = entriesCount.incoming + entriesCount.outgoing;

    if (totalEntries > 0) {
      // Sổ đã có văn bản → không được xóa vật lý, chỉ chuyển INACTIVE
      if (book.isDefault) {
        throw new BadRequestError(
          'Không thể vô hiệu hóa sổ đang là mặc định. Vui lòng chọn sổ mặc định khác trước.',
        );
      }
      return documentBooksRepository.updateStatus(id, 'INACTIVE');
    }

    // Sổ chưa có văn bản → soft-delete (ẩn khỏi danh sách)
    return documentBooksRepository.softDelete(id);
  }
}

export const documentBooksService = new DocumentBooksService();
