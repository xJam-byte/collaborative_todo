import { Module } from '@nestjs/common';
import { CollaborationGateway } from './collaboration.gateway.js';
import { CollaborationService } from './collaboration.service.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { ListsModule } from '../lists/lists.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TasksModule, ListsModule, UsersModule, AuthModule],
  providers: [CollaborationGateway, CollaborationService],
  exports: [CollaborationService],
})
export class CollaborationModule {}
