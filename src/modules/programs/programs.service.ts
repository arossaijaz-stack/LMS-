import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProgramDto, UpdateProgramDto } from './dto/program.dto';

@Injectable()
export class ProgramsService {
  constructor(private prisma: PrismaService) {}

  // Public — used by the marketing site's category nav and course filters.
  async findAll() {
    return this.prisma.program.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { courses: true } } },
    });
  }

  async findBySlug(slug: string) {
    const program = await this.prisma.program.findUnique({
      where: { slug },
      include: {
        courses: { where: { isPublished: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!program) throw new NotFoundException('Program not found');
    return program;
  }

  // ---------- Admin-only ----------

  async create(dto: CreateProgramDto) {
    const existing = await this.prisma.program.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('A program with this slug already exists');
    return this.prisma.program.create({ data: dto });
  }

  async update(id: string, dto: UpdateProgramDto) {
    await this.ensureExists(id);
    return this.prisma.program.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    // Prisma will throw a foreign-key error if courses still reference this
    // program — that's intentional; force the admin to reassign/delete
    // courses first rather than silently orphaning them.
    return this.prisma.program.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) throw new NotFoundException('Program not found');
    return program;
  }
}
