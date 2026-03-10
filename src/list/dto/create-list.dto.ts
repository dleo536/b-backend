import { IsString, IsNotEmpty, IsOptional, IsArray, IsEnum, Length, IsBoolean } from 'class-validator';
import { ListType, ListVisibility } from '../list.entity';

export class CreateListDto {
  @IsString()
  @IsOptional()
  ownerId?: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 128)
  firebaseUid: string; // Firebase UID - will be mapped to User.id (UUID) in service

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ListType)
  @IsOptional()
  listType?: ListType;

  @IsEnum(ListVisibility)
  @IsOptional()
  visibility?: ListVisibility;

  @IsBoolean()
  @IsOptional()
  isSystem?: boolean;

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
