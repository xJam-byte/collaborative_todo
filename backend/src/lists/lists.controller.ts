import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ListsService } from './lists.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AuthUser } from '../common/types/auth-user.js';

@Controller('lists')
@UseGuards(JwtAuthGuard)
export class ListsController {
  constructor(private readonly listsService: ListsService) {}

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body('title') title: string) {
    return this.listsService.create(user.id, title);
  }

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    return this.listsService.findAllForUser(user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.listsService.findOne(id, user.id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.listsService.remove(id, user.id);
  }

  @Post(':id/invite')
  async inviteByEmail(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Body('email') email: string,
  ) {
    return this.listsService.inviteByEmail(id, user.id, email);
  }

  @Post(':id/invite-link')
  async generateInviteLink(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.listsService.generateInviteLink(id, user.id);
  }

  @Post('accept-invite')
  async acceptInvitation(
    @CurrentUser() user: AuthUser,
    @Body('token') token: string,
  ) {
    return this.listsService.acceptInvitation(token, user.id);
  }
}
