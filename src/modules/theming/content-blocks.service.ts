import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateContentBlockDto,
  ReorderContentBlocksDto,
  UpdateContentBlockDto,
} from './dto/theming.dto';

@Injectable()
export class ContentBlocksService {
  constructor(private prisma: PrismaService) {}

  // ---------- Public (marketing site renders these) ----------

  // Only ACTIVE blocks, in order — lets an admin "hide" a testimonial
  // or FAQ entry without deleting it (soft-toggle via isActive).
  async findForSection(section: string) {
    return this.prisma.contentBlock.findMany({
      where: { section, isActive: true },
      orderBy: { order: 'asc' },
    });
  }

  // ---------- Admin management ----------

  async findAllForAdmin() {
    return this.prisma.contentBlock.findMany({
      orderBy: [{ section: 'asc' }, { order: 'asc' }],
    });
  }

  async create(dto: CreateContentBlockDto) {
    const count = await this.prisma.contentBlock.count({ where: { section: dto.section } });
    return this.prisma.contentBlock.create({
      data: { ...dto, order: count },
    });
  }

  async update(id: string, dto: UpdateContentBlockDto) {
    await this.ensureExists(id);
    return this.prisma.contentBlock.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.contentBlock.delete({ where: { id } });
  }

  async reorder(section: string, dto: ReorderContentBlocksDto) {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.contentBlock.update({ where: { id: item.id }, data: { order: item.order } }),
      ),
    );
    return { success: true };
  }

  private async ensureExists(id: string) {
    const block = await this.prisma.contentBlock.findUnique({ where: { id } });
    if (!block) throw new NotFoundException('Content block not found');
    return block;
  }
}
