import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import {
    ReportStatus,
} from "../content-report.entity";

export class UpdateReportStatusDto {
    @IsEnum(ReportStatus)
    status: ReportStatus;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    reviewNotes?: string;
}
