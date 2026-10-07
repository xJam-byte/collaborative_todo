import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class WsCreateTaskDto {
  @IsString()
  text: string;

  @IsString()
  listId: string;
}

export class WsUpdateTaskDto {
  @IsString()
  taskId: string;

  @IsString()
  @IsOptional()
  text?: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  @IsOptional()
  version?: number;
}

export class WsDeleteTaskDto {
  @IsString()
  taskId: string;

  @IsBoolean()
  @IsOptional()
  forceDelete?: boolean;
}

export class WsReorderTaskDto {
  @IsString()
  taskId: string;

  @IsString()
  newPosition: string;

  @IsOptional()
  version?: number;
}

export class WsFocusDto {
  @IsString()
  @IsOptional()
  taskId?: string | null; // null means unfocus
}

export class WsJoinListDto {
  @IsString()
  listId: string;
}
