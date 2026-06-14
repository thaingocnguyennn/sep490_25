import { default as prisma } from '../../config/database';
import { NotFoundError } from '../../shared/exceptions/app-error';

export class DepartmentsRepository {
  async findAll() {
    return prisma.department.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: number) {
    const department = await prisma.department.findUnique({ where: { id } });
    if (!department) throw new NotFoundError('Không tìm thấy phòng ban');
    return department;
  }
}

export const departmentsRepository = new DepartmentsRepository();
