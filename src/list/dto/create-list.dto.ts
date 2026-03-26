import { ArrayMaxSize, IsArray, IsIn, IsEnum, IsNotEmpty, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ListType, ListVisibility } from '../list.entity';

const LaunchListVisibilityValues = [ListVisibility.PUBLIC, ListVisibility.PRIVATE] as const;

export class CreateListDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  title: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 140)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "slug must be lowercase letters, numbers, and hyphens only",
  })
  slug: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsEnum(ListType)
  @IsOptional()
  listType?: ListType;

  @IsIn(LaunchListVisibilityValues)
  @IsOptional()
  visibility?: ListVisibility.PUBLIC | ListVisibility.PRIVATE;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  albumIds?: string[];

  // Legacy payload key used by the mobile client
  @IsArray()
  @IsOptional()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  albumList?: string[];
}
