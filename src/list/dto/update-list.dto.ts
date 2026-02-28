import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ListVisibility } from '../list.entity';

export class UpdateListDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ListVisibility)
  @IsOptional()
  visibility?: ListVisibility;
}
