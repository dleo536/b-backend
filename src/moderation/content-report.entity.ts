import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";
import { User } from "../user/user.entity";

export const ReportTargetType = {
    USER: "user",
    REVIEW: "review",
    LIST: "list",
} as const;

export type ReportTargetType = "user" | "review" | "list";

export const ReportTargetTypeValues = [
    ReportTargetType.USER,
    ReportTargetType.REVIEW,
    ReportTargetType.LIST,
];

export const ReportReason = {
    ABUSE: "abuse",
    HARASSMENT: "harassment",
    HATE: "hate",
    SEXUAL_CONTENT: "sexual_content",
    SPAM: "spam",
    IMPERSONATION: "impersonation",
    SELF_HARM: "self_harm",
    OTHER: "other",
} as const;

export type ReportReason =
    | "abuse"
    | "harassment"
    | "hate"
    | "sexual_content"
    | "spam"
    | "impersonation"
    | "self_harm"
    | "other";

export const ReportReasonValues = [
    ReportReason.ABUSE,
    ReportReason.HARASSMENT,
    ReportReason.HATE,
    ReportReason.SEXUAL_CONTENT,
    ReportReason.SPAM,
    ReportReason.IMPERSONATION,
    ReportReason.SELF_HARM,
    ReportReason.OTHER,
];

export const ReportStatus = {
    OPEN: "open",
    REVIEWED: "reviewed",
    ACTIONED: "actioned",
    DISMISSED: "dismissed",
} as const;

export type ReportStatus = "open" | "reviewed" | "actioned" | "dismissed";

export const ReportStatusValues = [
    ReportStatus.OPEN,
    ReportStatus.REVIEWED,
    ReportStatus.ACTIONED,
    ReportStatus.DISMISSED,
];

@Entity("content_reports")
@Index(["status", "createdAt"])
@Index(["targetType", "targetId"])
@Index(["reporterUserId", "createdAt"])
export class ContentReport {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column("uuid")
    reporterUserId: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "reporterUserId" })
    reporterUser: User;

    @Column({ type: "enum", enum: ReportTargetTypeValues })
    targetType: ReportTargetType;

    @Column("uuid")
    targetId: string;

    @Column({ type: "enum", enum: ReportReasonValues, default: ReportReason.OTHER })
    reason: ReportReason;

    @Column({ type: "text", nullable: true })
    details?: string | null;

    @Column({ type: "enum", enum: ReportStatusValues, default: ReportStatus.OPEN })
    status: ReportStatus;

    @Column("uuid", { nullable: true })
    reviewedByUserId?: string | null;

    @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "reviewedByUserId" })
    reviewedByUser?: User | null;

    @Column({ type: "text", nullable: true })
    reviewNotes?: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
