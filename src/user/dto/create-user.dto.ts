import { IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";
import { AuthProvider } from "../user.entity";
export class CreateUserDto {

    @IsOptional() @IsEmail()
    email?: string;


    @IsOptional() @IsIn(Object.values(AuthProvider))
    authProvider?: AuthProvider;

    @IsString()
    @IsNotEmpty()
    username: string;

    @IsOptional() @IsString()
    bio?: string;

    @IsOptional() @IsUrl()
    avatarUrl?: string;

    @IsOptional() @IsString()
    bannerUrl?: string;

    @IsOptional() @IsString()
    location?: string;

    @IsOptional() @IsString()
    websiteUrl?: string;


    @IsString()
    @IsNotEmpty()
    firstName: string;

    @IsString()
    @IsNotEmpty()
    lastName: string;
}
