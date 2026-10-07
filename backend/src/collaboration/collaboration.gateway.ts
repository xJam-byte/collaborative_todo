import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CollaborationService, UserPresence, OfflineOperation } from './collaboration.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { ListsService } from '../lists/lists.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthUser } from '../common/types/auth-user.js';
import {
  WsCreateTaskDto,
  WsUpdateTaskDto,
  WsDeleteTaskDto,
  WsReorderTaskDto,
  WsFocusDto,
  WsJoinListDto,
} from './dto/collaboration.dto.js';

interface AuthenticatedSocket extends Socket {
  user: AuthUser;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/collaboration',
})
export class CollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CollaborationGateway.name);

  constructor(
    private readonly collaborationService: CollaborationService,
    private readonly tasksService: TasksService,
    private readonly listsService: ListsService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Authenticate WebSocket connections via JWT token in handshake.
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>(
          'JWT_SECRET',
          'super-secret-key-change-me',
        ),
      });

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      client.user = {
        id: user.id,
        email: user.email,
        name: user.name,
      };

      this.logger.log(`Client connected: ${user.name} (${client.id})`);
      client.emit('connected', { user: client.user });
    } catch (error) {
      this.logger.warn(`Connection rejected: ${(error as Error).message}`);
      client.emit('error', { message: 'Authentication failed' });
      client.disconnect();
    }
  }

  /**
   * Clean up presence on disconnect.
   */
  handleDisconnect(client: AuthenticatedSocket) {
    if (!client.user) return;

    const removed = this.collaborationService.disconnectSocket(client.id);

    for (const { listId, presence } of removed) {
      this.server.to(`list:${listId}`).emit('user:left', {
        user: presence.user,
        presence: this.collaborationService.getListPresence(listId),
      });
    }

    this.logger.log(`Client disconnected: ${client.user?.name} (${client.id})`);
  }

  /**
   * Join a list room to receive real-time updates.
   */
  @SubscribeMessage('list:join')
  async handleJoinList(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsJoinListDto,
  ) {
    try {
      // Verify membership via service
      const list = await this.listsService.findOne(data.listId, client.user.id);

      // Join the Socket.IO room
      client.join(`list:${data.listId}`);

      // Register presence
      const presence = this.collaborationService.joinList(
        data.listId,
        client.user,
        client.id,
      );

      // Notify others
      client.to(`list:${data.listId}`).emit('user:joined', {
        user: client.user,
        presence,
      });

      // Send current state to the joining user
      return {
        event: 'list:joined',
        data: {
          list,
          presence,
        },
      };
    } catch (error) {
      return {
        event: 'error',
        data: { message: (error as Error).message },
      };
    }
  }

  /**
   * Leave a list room.
   */
  @SubscribeMessage('list:leave')
  handleLeaveList(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsJoinListDto,
  ) {
    client.leave(`list:${data.listId}`);
    const leftUser = this.collaborationService.leaveList(
      data.listId,
      client.id,
    );

    if (leftUser) {
      this.server.to(`list:${data.listId}`).emit('user:left', {
        user: leftUser.user,
        presence: this.collaborationService.getListPresence(data.listId),
      });
    }
  }

  /**
   * Create a new task and broadcast to the list.
   */
  @SubscribeMessage('task:create')
  async handleCreateTask(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsCreateTaskDto,
  ) {
    try {
      const task = await this.tasksService.create(
        { text: data.text, listId: data.listId },
        client.user.id,
      );

      // Broadcast to all clients in the list (including sender for confirmation)
      this.server.to(`list:${data.listId}`).emit('task:created', {
        task,
        by: client.user,
      });

      return { event: 'task:created', data: { task } };
    } catch (error) {
      return {
        event: 'error',
        data: { message: (error as Error).message },
      };
    }
  }

  /**
   * Update a task with conflict detection and broadcast.
   */
  @SubscribeMessage('task:update')
  async handleUpdateTask(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsUpdateTaskDto,
  ) {
    try {
      // Get the task to find its list
      const updatedTask = await this.tasksService.update(
        data.taskId,
        {
          text: data.text,
          completed: data.completed,
          version: data.version,
        },
        client.user.id,
      );

      // Broadcast to all clients in the list
      const listId = updatedTask.listId;
      this.server.to(`list:${listId}`).emit('task:updated', {
        task: updatedTask,
        by: client.user,
      });

      return { event: 'task:updated', data: { task: updatedTask } };
    } catch (error: unknown) {
      const err = error as { response?: { statusCode?: number } } & Error;
      // If it's a version conflict, send conflict event
      if (err.response?.statusCode === 409) {
        client.emit('task:conflict', {
          taskId: data.taskId,
          error: err.message,
          details: err.response,
        });
      }
      return {
        event: 'error',
        data: { message: err.message },
      };
    }
  }

  /**
   * Delete a task with presence check and broadcast.
   */
  @SubscribeMessage('task:delete')
  async handleDeleteTask(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsDeleteTaskDto,
  ) {
    try {
      // Check if someone else is editing this task
      // We need to find the list first
      const task = await this.tasksService.findAllForList(
        '', // We'll handle differently
        client.user.id,
      ).catch(() => null);

      // Attempt deletion
      const deletedTask = await this.tasksService.remove(
        data.taskId,
        client.user.id,
        data.forceDelete,
      );

      const listId = deletedTask.listId;

      // Check if anyone is editing this task
      const editingUsers = this.collaborationService.getUsersEditingTask(
        listId,
        data.taskId,
        client.id,
      );

      if (editingUsers.length > 0 && !data.forceDelete) {
        // Warn the deleter that someone is editing
        client.emit('task:delete-warning', {
          taskId: data.taskId,
          editingUsers: editingUsers.map((p) => p.user),
          message: 'Another user is currently editing this task',
        });
        return {
          event: 'task:delete-warning',
          data: {
            taskId: data.taskId,
            editingUsers: editingUsers.map((p) => p.user),
          },
        };
      }

      // Broadcast deletion to all
      this.server.to(`list:${listId}`).emit('task:deleted', {
        taskId: data.taskId,
        task: deletedTask,
        by: client.user,
      });

      return { event: 'task:deleted', data: { taskId: data.taskId } };
    } catch (error: unknown) {
      const err = error as { response?: { statusCode?: number; requiresConfirmation?: boolean } } & Error;
      if (err.response?.statusCode === 409 && (err.response as Record<string, unknown>)?.requiresConfirmation) {
        client.emit('task:delete-confirm', {
          taskId: data.taskId,
          message: err.message,
        });
      }
      return {
        event: 'error',
        data: { message: err.message },
      };
    }
  }

  /**
   * Reorder a task and broadcast new positions.
   */
  @SubscribeMessage('task:reorder')
  async handleReorderTask(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsReorderTaskDto,
  ) {
    try {
      const reorderedTask = await this.tasksService.reorder(
        {
          taskId: data.taskId,
          newPosition: data.newPosition,
          version: data.version,
        },
        client.user.id,
      );

      const listId = reorderedTask.listId;
      this.server.to(`list:${listId}`).emit('task:reordered', {
        task: reorderedTask,
        by: client.user,
      });

      return { event: 'task:reordered', data: { task: reorderedTask } };
    } catch (error) {
      return {
        event: 'error',
        data: { message: (error as Error).message },
      };
    }
  }

  /**
   * Update user focus/cursor presence — which task they're editing.
   */
  @SubscribeMessage('user:focus')
  handleFocus(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: WsFocusDto & { listId: string },
  ) {
    const updatedPresence = this.collaborationService.setFocus(
      data.listId,
      client.id,
      data.taskId ?? null,
    );

    if (updatedPresence) {
      client.to(`list:${data.listId}`).emit('user:focus-changed', {
        user: client.user,
        taskId: data.taskId,
        presence: this.collaborationService.getListPresence(data.listId),
      });
    }
  }

  /**
   * Process a batch of offline operations after reconnection.
   */
  @SubscribeMessage('sync:offline-queue')
  async handleOfflineSync(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      listId: string;
      operations: Array<{
        type: 'create' | 'update' | 'delete' | 'reorder' | 'toggle';
        payload: Record<string, unknown>;
        timestamp: number;
      }>;
    },
  ) {
    try {
      const results = await this.collaborationService.processOfflineQueue(
        data.operations,
        client.user.id,
      );

      // Broadcast all successful operations
      for (const result of results) {
        if (result.success && result.result) {
          const eventMap: Record<string, string> = {
            create: 'task:created',
            update: 'task:updated',
            delete: 'task:deleted',
            reorder: 'task:reordered',
            toggle: 'task:updated',
          };

          const event = eventMap[result.operation.type];
          if (event) {
            client.to(`list:${data.listId}`).emit(event, {
              task: result.result,
              by: client.user,
              offlineSync: true,
            });
          }
        }
      }

      return { event: 'sync:complete', data: { results } };
    } catch (error) {
      return {
        event: 'error',
        data: { message: (error as Error).message },
      };
    }
  }

  /**
   * Request full state sync (used after reconnection).
   */
  @SubscribeMessage('sync:request-state')
  async handleStateSync(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { listId: string },
  ) {
    try {
      const list = await this.listsService.findOne(data.listId, client.user.id);
      const presence = this.collaborationService.getListPresence(data.listId);

      return {
        event: 'sync:state',
        data: { list, presence },
      };
    } catch (error) {
      return {
        event: 'error',
        data: { message: (error as Error).message },
      };
    }
  }
}
