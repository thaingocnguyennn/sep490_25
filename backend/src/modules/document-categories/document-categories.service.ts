import { DocumentCategoriesRepository } from './document-categories.repository';
import { DocumentCategoryFilterDto, PaginatedDocumentCategoryResponse, DocumentCategoryOption, DocumentCategoryResponse } from './document-categories.types';

export class DocumentCategoriesService {
  private repository: DocumentCategoriesRepository;

  constructor() {
    this.repository = new DocumentCategoriesRepository();
  }

  async findAll(filter: DocumentCategoryFilterDto): Promise<PaginatedDocumentCategoryResponse> {
    return this.repository.findAll(filter);
  }

  async getActiveOptions(): Promise<DocumentCategoryOption[]> {
    return this.repository.findActiveOptions();
  }

  async findById(id: number): Promise<DocumentCategoryResponse | null> {
    return this.repository.findById(id);
  }
}
