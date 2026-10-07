import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuthUser } from '../common/types/auth-user.js';
import { CreateTaskDto, UpdateTaskDto, ReorderTaskDto } from './dto/task.dto.js';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async create(@Body() dto: CreateTaskDto, @CurrentUser() user: AuthUser) {
    return this.tasksService.create(dto, user.id);
  }

  @Get('list/:listId')
  async findAllForList(
    @Param('listId') listId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.findAllForList(listId, user.id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.update(id, dto, user.id);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Query('force') force?: string,
  ) {
    return this.tasksService.remove(id, user.id, force === 'true');
  }

  @Post('reorder')
  async reorder(@Body() dto: ReorderTaskDto, @CurrentUser() user: AuthUser) {
    return this.tasksService.reorder(dto, user.id);
  }
}
