import {
    IsDateString,
    IsNotEmpty,
    IsOptional,
    IsString,
    Length,
    MaxLength,
} from "class-validator";

export class CompleteOnboardingDetailsDto {
    @IsDateString()
    dateOfBirth: string;

    @IsString()
    @IsNotEmpty()
    @Length(1, 80)
    country: string;

    @IsString()
    @IsNotEmpty()
    @Length(1, 120)
    city: string;

    @IsOptional()
    @IsString()
    @MaxLength(160)
    bio?: string;
}
