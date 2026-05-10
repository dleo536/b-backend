import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
    @IsString()
    @MinLength(8)
    @MaxLength(128)
    @Matches(/[A-Z]/, {
        message: "Password must include at least one uppercase letter",
    })
    @Matches(/[a-z]/, {
        message: "Password must include at least one lowercase letter",
    })
    @Matches(/\d/, {
        message: "Password must include at least one number",
    })
    newPassword!: string;
}
