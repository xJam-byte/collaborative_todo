import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListRole } from '@prisma/client';
import { randomBytes } from 'crypto';

@Injectable()
export class ListsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new list. The creator automatically becomes an ADMIN member.
   */
  async create(userId: string, title: string) {
    return this.prisma.todoList.create({
      data: {
        title,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: ListRole.ADMIN,
          },
        },
      },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
      },
    });
  }

  /**
   * Get all lists the user is a member of.
   */
  async findAllForUser(userId: string) {
    return this.prisma.todoList.findMany({
      where: {
        members: { some: { userId } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
        tasks: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
        },
        _count: {
          select: {
            tasks: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Get a single list by ID. Throws if the user is not a member.
   */
  async findOne(listId: string, userId: string) {
    const list = await this.prisma.todoList.findUnique({
      where: { id: listId },
      include: {
        members: {
          include: { user: { select: { id: true, email: true, name: true } } },
        },
        tasks: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
          include: {
            creator: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('List not found');
    }

    const isMember = list.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this list');
    }

    return list;
  }

  /**
   * Delete a list. Only the owner (ADMIN) can delete it.
   */
  async remove(listId: string, userId: string) {
    const membership = await this.prisma.listMember.findUnique({
      where: { userId_listId: { userId, listId } },
    });

    if (!membership) {
      throw new NotFoundException('List not found');
    }

    if (membership.role !== ListRole.ADMIN) {
      throw new ForbiddenException('Only the admin can delete this list');
    }

    return this.prisma.todoList.delete({ where: { id: listId } });
  }

  /**
   * Get user's role in a list.
   */
  async getUserRole(listId: string, userId: string): Promise<ListRole | null> {
    const membership = await this.prisma.listMember.findUnique({
      where: { userId_listId: { userId, listId } },
    });
    return membership?.role ?? null;
  }

  /**
   * Invite a user by email. Creates an invitation with a unique token.
   */
  async inviteByEmail(listId: string, senderId: string, email: string) {
    const senderMembership = await this.prisma.listMember.findUnique({
      where: { userId_listId: { userId: senderId, listId } },
    });

    if (!senderMembership || senderMembership.role !== ListRole.ADMIN) {
      throw new ForbiddenException('Only admins can invite users');
    }

    // Check if user is already a member
    const targetUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (targetUser) {
      const existingMember = await this.prisma.listMember.findUnique({
        where: {
          userId_listId: { userId: targetUser.id, listId },
        },
      });

      if (existingMember) {
        throw new ConflictException('User is already a member of this list');
      }
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return this.prisma.invitation.create({
      data: {
        listId,
        senderId,
        email,
        token,
        expiresAt,
      },
    });
  }

  /**
   * Generate an invite link (token-based, no email needed).
   */
  async generateInviteLink(listId: string, senderId: string) {
    const senderMembership = await this.prisma.listMember.findUnique({
      where: { userId_listId: { userId: senderId, listId } },
    });

    if (!senderMembership || senderMembership.role !== ListRole.ADMIN) {
      throw new ForbiddenException('Only admins can generate invite links');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.invitation.create({
      data: {
        listId,
        senderId,
        token,
        expiresAt,
      },
    });

    return { token: invitation.token, expiresAt: invitation.expiresAt };
  }

  /**
   * Accept an invitation by token.
   */
  async acceptInvitation(token: string, userId: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { list: true },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.accepted) {
      throw new ConflictException('Invitation already accepted');
    }

    if (invitation.expiresAt < new Date()) {
      throw new ForbiddenException('Invitation has expired');
    }

    // Check if already a member
    const existingMember = await this.prisma.listMember.findUnique({
      where: {
        userId_listId: { userId, listId: invitation.listId },
      },
    });

    if (existingMember) {
      throw new ConflictException('You are already a member of this list');
    }

    // Accept invitation and add member in a transaction
    return this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { accepted: true },
      });

      await tx.listMember.create({
        data: {
          userId,
          listId: invitation.listId,
          role: ListRole.MEMBER,
        },
      });

      return tx.todoList.findUnique({
        where: { id: invitation.listId },
        include: {
          members: {
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          },
        },
      });
    });
  }
}
