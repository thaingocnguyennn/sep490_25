import { departmentsRepository } from './departments.repository';

export class DepartmentsService {
  async list() {
    return departmentsRepository.findAll();
  }

  async getById(id: number) {
    return departmentsRepository.findById(id);
  }
}

export const departmentsService = new DepartmentsService();
