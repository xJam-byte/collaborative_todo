import { Injectable, Logger } from '@nestjs/common';
import { TasksService } from '../tasks/tasks.service.js';
import { ListsService } from '../lists/lists.service.js';
import { AuthUser } from '../common/types/auth-user.js';

/**
 * Tracks online users and their focus state per list.
 */
export interface UserPresence {
  user: AuthUser;
  socketId: string;
  focusedTaskId: string | null;
  joinedAt: Date;
}

/**
 * Pending offline operations from a client.
 */
export interface OfflineOperation {
  type: 'create' | 'update' | 'delete' | 'reorder' | 'toggle';
  payload: Record<string, unknown>;
  timestamp: number;
}

@Injectable()
export class CollaborationService {
  private readonly logger = new Logger(CollaborationService.name);

  /**
   * Map of listId -> Map<socketId, UserPresence>
   * Tracks who is connected to which list and what they're focusing on.
   */
  private readonly listPresence = new Map<string, Map<string, UserPresence>>();

  constructor(
    private readonly tasksService: TasksService,
    private readonly listsService: ListsService,
  ) {}

  /**
   * Register a user joining a list room.
   */
  joinList(listId: string, user: AuthUser, socketId: string): UserPresence[] {
    if (!this.listPresence.has(listId)) {
      this.listPresence.set(listId, new Map());
    }

    const presenceMap = this.listPresence.get(listId)!;
    presenceMap.set(socketId, {
      user,
      socketId,
      focusedTaskId: null,
      joinedAt: new Date(),
    });

    this.logger.log(
      `User ${user.name} (${user.id}) joined list ${listId} via socket ${socketId}`,
    );

    return Array.from(presenceMap.values());
  }

  /**
   * Remove a user from a list room.
   */
  leaveList(listId: string, socketId: string): UserPresence | null {
    const presenceMap = this.listPresence.get(listId);
    if (!presenceMap) return null;

    const presence = presenceMap.get(socketId);
    presenceMap.delete(socketId);

    if (presenceMap.size === 0) {
      this.listPresence.delete(listId);
    }

    return presence ?? null;
  }

  /**
   * Remove user from all lists (on disconnect).
   */
  disconnectSocket(socketId: string): Array<{ listId: string; presence: UserPresence }> {
    const removed: Array<{ listId: string; presence: UserPresence }> = [];

    for (const [listId, presenceMap] of this.listPresence.entries()) {
      const presence = presenceMap.get(socketId);
      if (presence) {
        presenceMap.delete(socketId);
        removed.push({ listId, presence });

        if (presenceMap.size === 0) {
          this.listPresence.delete(listId);
        }
      }
    }

    return removed;
  }

  /**
   * Update a user's focus state (which task they're editing).
   */
  setFocus(
    listId: string,
    socketId: string,
    taskId: string | null,
  ): UserPresence | null {
    const presenceMap = this.listPresence.get(listId);
    if (!presenceMap) return null;

    const presence = presenceMap.get(socketId);
    if (!presence) return null;

    presence.focusedTaskId = taskId;
    return presence;
  }

  /**
   * Get all users currently focusing on a specific task.
   */
  getUsersEditingTask(
    listId: string,
    taskId: string,
    excludeSocketId?: string,
  ): UserPresence[] {
    const presenceMap = this.listPresence.get(listId);
    if (!presenceMap) return [];

    return Array.from(presenceMap.values()).filter(
      (p) =>
        p.focusedTaskId === taskId &&
        (excludeSocketId ? p.socketId !== excludeSocketId : true),
    );
  }

  /**
   * Get all online users in a list.
   */
  getListPresence(listId: string): UserPresence[] {
    const presenceMap = this.listPresence.get(listId);
    if (!presenceMap) return [];
    return Array.from(presenceMap.values());
  }

  /**
   * Process a batch of offline operations (reconnection sync).
   * Operations are applied in order, with conflict detection.
   */
  async processOfflineQueue(
    operations: OfflineOperation[],
    userId: string,
  ): Promise<Array<{ success: boolean; operation: OfflineOperation; result?: unknown; error?: string }>> {
    const results: Array<{
      success: boolean;
      operation: OfflineOperation;
      result?: unknown;
      error?: string;
    }> = [];

    // Sort by timestamp to maintain order
    const sorted = [...operations].sort((a, b) => a.timestamp - b.timestamp);

    for (const op of sorted) {
      try {
        let result: unknown;

        switch (op.type) {
          case 'create':
            result = await this.tasksService.create(
              {
                text: op.payload.text as string,
                listId: op.payload.listId as string,
              },
              userId,
            );
            break;

          case 'update':
            result = await this.tasksService.update(
              op.payload.taskId as string,
              {
                text: op.payload.text as string | undefined,
                completed: op.payload.completed as boolean | undefined,
                version: op.payload.version as number | undefined,
              },
              userId,
            );
            break;

          case 'toggle':
            result = await this.tasksService.update(
              op.payload.taskId as string,
              {
                completed: op.payload.completed as boolean,
                version: op.payload.version as number | undefined,
              },
              userId,
            );
            break;

          case 'delete':
            result = await this.tasksService.remove(
              op.payload.taskId as string,
              userId,
              (op.payload.forceDelete as boolean) ?? false,
            );
            break;

          case 'reorder':
            result = await this.tasksService.reorder(
              {
                taskId: op.payload.taskId as string,
                newPosition: op.payload.newPosition as string,
                version: op.payload.version as number | undefined,
              },
              userId,
            );
            break;
        }

        results.push({ success: true, operation: op, result });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Offline operation failed: ${op.type} - ${errorMessage}`,
        );
        results.push({ success: false, operation: op, error: errorMessage });
      }
    }

    return results;
  }
}
