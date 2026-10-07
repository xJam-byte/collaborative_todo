import { IsString, IsOptional, IsBoolean, MinLength } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  text: string;

  @IsString()
  listId: string;
}

export class UpdateTaskDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  text?: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;

  /** Client must send the version it last read — used for optimistic concurrency control */
  @IsOptional()
  version?: number;
}

export class ReorderTaskDto {
  @IsString()
  taskId: string;

  @IsString()
  newPosition: string;

  @IsOptional()
  version?: number;
}
