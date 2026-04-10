import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
    ContentReport,
    ReportReason,
    ReportStatus,
    ReportTargetType,
} from "./content-report.entity";
import { UserBlock } from "./user-block.entity";
import { User } from "../user/user.entity";
import { Review } from "../review/review.entity";
import { AlbumList } from "../list/list.entity";
import { UserFollow } from "../user/follow.entity";
import { CreateReportDto } from "./dto/create-report.dto";
import { UpdateReportStatusDto } from "./dto/update-report-status.dto";

const DEFAULT_BLOCKED_TERMS = [
    "fuck",
    "fucking",
    "motherfucker",
    "shit",
    "bitch",
    "asshole",
    "bastard",
    "cunt",
    "whore",
    "slut",
    "fag",
    "retard",
];

const normalizeModerationText = (value: string) =>
    value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

@Injectable()
export class ModerationService {
    private readonly blockedTerms: string[];

    constructor(
        @InjectRepository(ContentReport)
        private readonly contentReportRepository: Repository<ContentReport>,
        @InjectRepository(UserBlock)
        private readonly userBlockRepository: Repository<UserBlock>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(Review)
        private readonly reviewRepository: Repository<Review>,
        @InjectRepository(AlbumList)
        private readonly listRepository: Repository<AlbumList>,
        @InjectRepository(UserFollow)
        private readonly followRepository: Repository<UserFollow>,
    ) {
        const configuredTerms = (process.env.MODERATION_BLOCKLIST ?? "")
            .split(",")
            .map((term) => normalizeModerationText(term))
            .filter((term) => term.length > 0);

        this.blockedTerms = Array.from(
            new Set(
                [...DEFAULT_BLOCKED_TERMS, ...configuredTerms]
                    .map((term) => normalizeModerationText(term))
                    .filter((term) => term.length > 0),
            ),
        );
    }

    private isUuid(value: string): boolean {
        if (typeof value !== "string") {
            return false;
        }

        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
        );
    }

    private async findUserByIdentifier(identifier?: string | null): Promise<User | null> {
        if (!identifier) {
            return null;
        }

        if (this.isUuid(identifier)) {
            return this.userRepository.findOne({ where: { id: identifier } });
        }

        return this.userRepository.findOne({ where: { oauthId: identifier } });
    }

    async requireUserByIdentifier(identifier: string, label = "User"): Promise<User> {
        if (!identifier?.trim()) {
            throw new BadRequestException(`${label} identifier is required`);
        }

        const user = await this.findUserByIdentifier(identifier.trim());
        if (!user) {
            throw new NotFoundException(`${label} not found`);
        }

        return user;
    }

    private containsBlockedTerm(value?: string | null): boolean {
        if (typeof value !== "string") {
            return false;
        }

        const normalized = normalizeModerationText(value);
        if (!normalized) {
            return false;
        }

        const padded = ` ${normalized} `;
        const squashed = normalized.replace(/\s+/g, "");

        return this.blockedTerms.some((term) => {
            if (!term) {
                return false;
            }

            return padded.includes(` ${term} `) || squashed.includes(term.replace(/\s+/g, ""));
        });
    }

    assertTextFieldsAreAllowed(fields: Array<{ label: string; value?: string | null }>) {
        for (const field of fields) {
            if (!field?.label) {
                continue;
            }

            if (this.containsBlockedTerm(field.value)) {
                throw new BadRequestException(
                    `Your ${field.label.toLowerCase()} contains language that is not allowed.`,
                );
            }
        }
    }

    async getVisibilityExcludedUserIds(viewerUserId?: string | null): Promise<string[]> {
        if (!viewerUserId) {
            return [];
        }

        const blocks = await this.userBlockRepository.find({
            where: [{ blockerId: viewerUserId }, { blockedId: viewerUserId }],
        });

        return Array.from(
            new Set(
                blocks.map((block) =>
                    block.blockerId === viewerUserId ? block.blockedId : block.blockerId,
                ),
            ),
        );
    }

    async isBlockedBetweenUsersByIds(
        leftUserId?: string | null,
        rightUserId?: string | null,
    ): Promise<boolean> {
        if (!leftUserId || !rightUserId) {
            return false;
        }

        const block = await this.userBlockRepository.findOne({
            where: [
                { blockerId: leftUserId, blockedId: rightUserId },
                { blockerId: rightUserId, blockedId: leftUserId },
            ],
        });

        return Boolean(block);
    }

    async assertUsersCanInteract(leftUserId?: string | null, rightUserId?: string | null) {
        if (!leftUserId || !rightUserId) {
            return;
        }

        const blocked = await this.isBlockedBetweenUsersByIds(leftUserId, rightUserId);
        if (blocked) {
            throw new ForbiddenException("This action is unavailable because one of these users is blocked.");
        }
    }

    private async syncFollowCounts(userIds: string[]) {
        const uniqueUserIds = Array.from(
            new Set(
                userIds.filter((userId): userId is string => typeof userId === "string" && userId.length > 0),
            ),
        );

        if (uniqueUserIds.length === 0) {
            return;
        }

        const users = await this.userRepository.find({
            where: {
                id: In(uniqueUserIds),
            },
        });

        const countEntries = await Promise.all(
            uniqueUserIds.map(async (userId) => {
                const [followingCount, followersCount] = await Promise.all([
                    this.followRepository.count({ where: { followerId: userId } }),
                    this.followRepository.count({ where: { followingId: userId } }),
                ]);

                return [userId, { followingCount, followersCount }] as const;
            }),
        );

        const counts = new Map(countEntries);
        users.forEach((user) => {
            const nextCounts = counts.get(user.id);
            if (!nextCounts) {
                return;
            }

            user.followingCount = nextCounts.followingCount;
            user.followersCount = nextCounts.followersCount;
        });

        await this.userRepository.save(users);
    }

    private async removeFollowRelationships(leftUserId: string, rightUserId: string) {
        const follows = await this.followRepository.find({
            where: [
                { followerId: leftUserId, followingId: rightUserId },
                { followerId: rightUserId, followingId: leftUserId },
            ],
        });

        if (follows.length > 0) {
            await this.followRepository.remove(follows);
        }

        await this.syncFollowCounts([leftUserId, rightUserId]);
    }

    async getBlockState(currentUserOauthId: string, targetIdentifier: string) {
        const currentUser = await this.requireUserByIdentifier(currentUserOauthId, "Current user");
        const targetUser = await this.requireUserByIdentifier(targetIdentifier, "Target user");

        if (currentUser.id === targetUser.id) {
            return {
                isSelf: true,
                blocked: false,
                blockedByYou: false,
                blockedByUser: false,
                blockerId: currentUser.id,
                blockedId: targetUser.id,
            };
        }

        const [blockedByYou, blockedByUser] = await Promise.all([
            this.userBlockRepository.findOne({
                where: {
                    blockerId: currentUser.id,
                    blockedId: targetUser.id,
                },
            }),
            this.userBlockRepository.findOne({
                where: {
                    blockerId: targetUser.id,
                    blockedId: currentUser.id,
                },
            }),
        ]);

        return {
            isSelf: false,
            blocked: Boolean(blockedByYou || blockedByUser),
            blockedByYou: Boolean(blockedByYou),
            blockedByUser: Boolean(blockedByUser),
            blockerId: currentUser.id,
            blockedId: targetUser.id,
        };
    }

    async blockUser(currentUserOauthId: string, targetIdentifier: string) {
        const currentUser = await this.requireUserByIdentifier(currentUserOauthId, "Current user");
        const targetUser = await this.requireUserByIdentifier(targetIdentifier, "Target user");

        if (currentUser.id === targetUser.id) {
            throw new BadRequestException("You cannot block yourself");
        }

        const existingBlock = await this.userBlockRepository.findOne({
            where: {
                blockerId: currentUser.id,
                blockedId: targetUser.id,
            },
        });

        if (!existingBlock) {
            const block = this.userBlockRepository.create({
                blockerId: currentUser.id,
                blockedId: targetUser.id,
            });
            await this.userBlockRepository.save(block);
        }

        await this.removeFollowRelationships(currentUser.id, targetUser.id);

        return {
            success: true,
            blocked: true,
            blockerId: currentUser.id,
            blockedId: targetUser.id,
        };
    }

    async unblockUser(currentUserOauthId: string, targetIdentifier: string) {
        const currentUser = await this.requireUserByIdentifier(currentUserOauthId, "Current user");
        const targetUser = await this.requireUserByIdentifier(targetIdentifier, "Target user");

        const existingBlock = await this.userBlockRepository.findOne({
            where: {
                blockerId: currentUser.id,
                blockedId: targetUser.id,
            },
        });

        if (existingBlock) {
            await this.userBlockRepository.remove(existingBlock);
        }

        return {
            success: true,
            blocked: false,
            blockerId: currentUser.id,
            blockedId: targetUser.id,
        };
    }

    private async resolveReportTarget(targetType: ReportTargetType, targetId: string) {
        switch (targetType) {
            case ReportTargetType.USER: {
                const user = await this.requireUserByIdentifier(targetId, "Reported user");
                return {
                    targetId: user.id,
                    ownerUserId: user.id,
                };
            }
            case ReportTargetType.REVIEW: {
                const review = await this.reviewRepository.findOne({ where: { id: targetId } });
                if (!review) {
                    throw new NotFoundException("Reported review not found");
                }

                return {
                    targetId: review.id,
                    ownerUserId: review.userId,
                };
            }
            case ReportTargetType.LIST: {
                const list = await this.listRepository.findOne({ where: { id: targetId } });
                if (!list) {
                    throw new NotFoundException("Reported list not found");
                }

                return {
                    targetId: list.id,
                    ownerUserId: list.ownerId,
                };
            }
            default:
                throw new BadRequestException("Unsupported report target");
        }
    }

    async createReport(currentUserOauthId: string, createReportDto: CreateReportDto) {
        const reporterUser = await this.requireUserByIdentifier(currentUserOauthId, "Reporting user");
        const targetType = createReportDto.targetType;
        const targetResolution = await this.resolveReportTarget(targetType, createReportDto.targetId);

        if (targetResolution.ownerUserId && targetResolution.ownerUserId === reporterUser.id) {
            throw new BadRequestException("You cannot report your own content");
        }

        const existingOpenReport = await this.contentReportRepository.findOne({
            where: {
                reporterUserId: reporterUser.id,
                targetType,
                targetId: targetResolution.targetId,
                status: ReportStatus.OPEN,
            },
        });

        if (existingOpenReport) {
            return existingOpenReport;
        }

        const report = this.contentReportRepository.create({
            reporterUserId: reporterUser.id,
            targetType,
            targetId: targetResolution.targetId,
            reason: createReportDto.reason ?? ReportReason.OTHER,
            details: createReportDto.details?.trim() || null,
            status: ReportStatus.OPEN,
        });

        return this.contentReportRepository.save(report);
    }

    async listReports(status?: string) {
        const normalizedStatus = status?.trim().toLowerCase();
        const where =
            normalizedStatus &&
            [ReportStatus.OPEN, ReportStatus.REVIEWED, ReportStatus.ACTIONED, ReportStatus.DISMISSED].includes(
                normalizedStatus as ReportStatus,
            )
                ? { status: normalizedStatus as ReportStatus }
                : {};

        return this.contentReportRepository.find({
            where,
            order: {
                createdAt: "DESC",
            },
        });
    }

    async updateReportStatus(
        reportId: string,
        currentUserOauthId: string,
        updateReportStatusDto: UpdateReportStatusDto,
    ) {
        const report = await this.contentReportRepository.findOne({
            where: { id: reportId },
        });

        if (!report) {
            throw new NotFoundException("Report not found");
        }

        const reviewingUser = await this.requireUserByIdentifier(currentUserOauthId, "Reviewing user");

        report.status = updateReportStatusDto.status;
        report.reviewedByUserId = reviewingUser.id;
        report.reviewNotes = updateReportStatusDto.reviewNotes?.trim() || null;

        return this.contentReportRepository.save(report);
    }
}
