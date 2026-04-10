import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import {
    ReportReason,
    ReportTargetType,
} from "../content-report.entity";

export class CreateReportDto {
    @IsEnum(ReportTargetType)
    targetType: ReportTargetType;

    @IsUUID()
    targetId: string;

    @IsOptional()
    @IsEnum(ReportReason)
    reason?: ReportReason;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    details?: string;
}
