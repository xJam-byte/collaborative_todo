import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListRole } from '@prisma/client';
import { CreateTaskDto, UpdateTaskDto, ReorderTaskDto } from './dto/task.dto.js';

/**
 * Generates a fractional index between two strings for ordering.
 * Uses a simple midpoint strategy in base-36 space.
 */
function generatePositionBetween(before: string | null, after: string | null): string {
  if (!before && !after) return 'n'; // midpoint of the alphabet
  if (!before) return midpoint('', after!);
  if (!after) return midpoint(before, '');
  return midpoint(before, after);
}

function midpoint(a: string, b: string): string {
  // Pad strings to equal length
  const maxLen = Math.max(a.length, b.length, 1);
  const paddedA = a.padEnd(maxLen, 'a');
  const paddedB = b ? b.padEnd(maxLen, 'z') : 'z'.repeat(maxLen);

  // Calculate midpoint character by character
  let result = '';
  let carry = 0;

  for (let i = maxLen - 1; i >= 0; i--) {
    const codeA = paddedA.charCodeAt(i) - 97; // 'a' = 0
    const codeB = paddedB.charCodeAt(i) - 97;
    const sum = codeA + codeB + carry;
    carry = Math.floor(sum / 26);
    result = String.fromCharCode((Math.floor(sum / 2) % 26) + 97) + result;
  }

  // If result equals a, append 'n' to go between
  if (result <= a) {
    result = a + 'n';
  }

  return result;
}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a task in a list. The task gets a position at the end.
   */
  async create(dto: CreateTaskDto, userId: string) {
    // Verify membership
    const membership = await this.prisma.listMember.findUnique({
      where: { userId_listId: { userId, listId: dto.listId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this list');
    }

    // Find the last task to determine position
    const lastTask = await this.prisma.task.findFirst({
      where: { listId: dto.listId, deletedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });

    const position = generatePositionBetween(lastTask?.position ?? null, null);

    return this.prisma.task.create({
      data: {
        text: dto.text,
        listId: dto.listId,
        creatorId: userId,
        position,
      },
      include: {
        creator: { select: { id: true, email: true, name: true } },
      },
    });
  }

  /**
   * Update a task with optimistic concurrency control.
   *
   * Conflict resolution strategy: **Optimistic Locking with Version Check**
   * - Each task has a `version` field incremented on every update.
   * - The client must send the version it last read.
   * - If the version doesn't match (another user updated it), we reject
   *   with a ConflictException and return the current server state.
   * - This allows the client to show a merge dialog or apply last-write-wins.
   */
  async update(taskId: string, dto: UpdateTaskDto, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        list: {
          include: { members: true },
        },
      },
    });

    if (!task || task.deletedAt) {
      throw new NotFoundException('Task not found or has been deleted');
    }

    // Verify membership
    const isMember = task.list.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this list');
    }

    // Optimistic concurrency check
    if (dto.version !== undefined && dto.version !== task.version) {
      throw new ConflictException({
        message: 'Task has been modified by another user',
        currentVersion: task.version,
        currentText: task.text,
        currentCompleted: task.completed,
        yourVersion: dto.version,
      });
    }

    const updateData: Record<string, unknown> = {
      version: { increment: 1 },
      updatedAt: new Date(),
    };

    if (dto.text !== undefined) updateData.text = dto.text;
    if (dto.completed !== undefined) updateData.completed = dto.completed;

    return this.prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        creator: { select: { id: true, email: true, name: true } },
      },
    });
  }

  /**
   * Delete a task following business rules:
   * - Admin can delete any task
   * - Member can only delete their own tasks
   * - Cannot delete completed tasks (must uncheck first)
   *   - Exception: Admin can force-delete with confirmation
   * - Warning if another user is editing the task (handled via WebSocket)
   *
   * Uses soft delete to prevent data loss during concurrent editing.
   */
  async remove(taskId: string, userId: string, forceDelete = false) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        list: {
          include: { members: true },
        },
      },
    });

    if (!task || task.deletedAt) {
      throw new NotFoundException('Task not found');
    }

    const membership = task.list.members.find((m) => m.userId === userId);
    if (!membership) {
      throw new ForbiddenException('You are not a member of this list');
    }

    const isAdmin = membership.role === ListRole.ADMIN;

    // Member can only delete their own tasks
    if (!isAdmin && task.creatorId !== userId) {
      throw new ForbiddenException('You can only delete tasks you created');
    }

    // Cannot delete completed tasks unless admin with forceDelete
    if (task.completed) {
      if (!isAdmin) {
        throw new ForbiddenException(
          'Cannot delete a completed task. Uncheck it first.',
        );
      }
      if (!forceDelete) {
        throw new ConflictException({
          message: 'This task is completed. Confirm force deletion.',
          requiresConfirmation: true,
          taskId: task.id,
          taskText: task.text,
        });
      }
    }

    // Soft delete
    return this.prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date() },
      include: {
        creator: { select: { id: true, email: true, name: true } },
      },
    });
  }

  /**
   * Reorder a task. Uses fractional indexing so concurrent reorders
   * don't corrupt the list order.
   */
  async reorder(dto: ReorderTaskDto, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      include: {
        list: {
          include: { members: true },
        },
      },
    });

    if (!task || task.deletedAt) {
      throw new NotFoundException('Task not found');
    }

    const isMember = task.list.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this list');
    }

    // Optimistic concurrency check for reorder
    if (dto.version !== undefined && dto.version !== task.version) {
      throw new ConflictException({
        message: 'Task has been modified during reorder',
        currentVersion: task.version,
      });
    }

    return this.prisma.task.update({
      where: { id: dto.taskId },
      data: {
        position: dto.newPosition,
        version: { increment: 1 },
      },
      include: {
        creator: { select: { id: true, email: true, name: true } },
      },
    });
  }

  /**
   * Get all active tasks for a list.
   */
  async findAllForList(listId: string, userId: string) {
    // Verify membership
    const membership = await this.prisma.listMember.findUnique({
      where: { userId_listId: { userId, listId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this list');
    }

    return this.prisma.task.findMany({
      where: { listId, deletedAt: null },
      orderBy: { position: 'asc' },
      include: {
        creator: { select: { id: true, email: true, name: true } },
      },
    });
  }
}
