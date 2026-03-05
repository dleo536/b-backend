import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ListType, ListVisibility } from '../list.entity';

export class UpdateListDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ListType)
  @IsOptional()
  listType?: ListType;

  @IsEnum(ListVisibility)
  @IsOptional()
  visibility?: ListVisibility;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  albumIds?: string[];

  // Legacy payload key used by the mobile client
  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  albumList?: string[];
}
