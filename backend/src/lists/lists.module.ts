import { Module } from '@nestjs/common';
import { ListsService } from './lists.service.js';
import { ListsController } from './lists.controller.js';

@Module({
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
