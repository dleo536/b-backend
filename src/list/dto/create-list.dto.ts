import { IsString, IsNotEmpty, IsOptional, IsArray, IsEnum, Length } from 'class-validator';
import { ListVisibility } from '../list.entity';

export class CreateListDto {
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

  @IsEnum(ListVisibility)
  @IsOptional()
  visibility?: ListVisibility;
}