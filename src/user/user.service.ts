import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, ILike, QueryFailedError } from "typeorm";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./user.entity";
import { UserFollow } from "./follow.entity";

@Injectable()
export class UserService {
    private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    private readonly usernameRegex = /^[A-Za-z0-9._]+$/;

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(UserFollow)
        private followRepository: Repository<UserFollow>,
    ) {}

    private isUuid(value: string): boolean {
        if (typeof value !== "string") {
            return false;
        }

        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }

    private normalizeUsername(username?: string): string {
        return typeof username === "string" ? username.trim() : "";
    }

    private normalizeEmail(email?: string): string | undefined {
        if (typeof email !== "string") {
            return undefined;
        }

        const normalizedEmail = email.trim().toLowerCase();
        return normalizedEmail.length > 0 ? normalizedEmail : undefined;
    }

    private validateUsername(username: string) {
        if (!username) {
            throw new BadRequestException("Username is required");
        }
        if (username.length < 3) {
            throw new BadRequestException("Username must be at least 3 characters long");
        }
        if (username.length > 24) {
            throw new BadRequestException("Username must be 24 characters or fewer");
        }
        if (!this.usernameRegex.test(username)) {
            throw new BadRequestException(
                "Username can only contain letters, numbers, periods, and underscores",
            );
        }
    }

    private validateEmail(email?: string) {
        if (!email) {
            return;
        }

        if (!this.emailRegex.test(email)) {
            throw new BadRequestException("Enter a valid email address");
        }
    }

    private mapUniqueConstraintError(error: unknown): ConflictException | null {
        if (!(error instanceof QueryFailedError)) {
            return null;
        }

        const driverError = (error as QueryFailedError & { driverError?: { code?: string; detail?: string; constraint?: string } }).driverError;
        if (driverError?.code !== "23505") {
            return null;
        }

        const detail = `${driverError.detail || ""} ${driverError.constraint || ""}`.toLowerCase();
        if (detail.includes("usernamelower")) {
            return new ConflictException("Username is already taken");
        }
        if (detail.includes("emaillower")) {
            return new ConflictException("Email is already in use");
        }
        if (detail.includes("oauthid")) {
            return new ConflictException("A profile already exists for this Firebase account");
        }

        return new ConflictException("A user with those details already exists");
    }

    async checkAvailability(username?: string, email?: string) {
        const normalizedUsername = this.normalizeUsername(username);
        const normalizedEmail = this.normalizeEmail(email);

        const usernameValid = normalizedUsername.length === 0
            ? null
            : normalizedUsername.length >= 3 &&
              normalizedUsername.length <= 24 &&
              this.usernameRegex.test(normalizedUsername);

        const emailValid = normalizedEmail === undefined
            ? null
            : this.emailRegex.test(normalizedEmail);

        const usernameUser =
            usernameValid && normalizedUsername
                ? await this.userRepository.findOne({
                      where: { usernameLower: normalizedUsername.toLowerCase() },
                  })
                : null;
        const emailUser =
            emailValid && normalizedEmail
                ? await this.userRepository.findOne({
                      where: { emailLower: normalizedEmail },
                  })
                : null;

        return {
            usernameAvailable:
                usernameValid === null ? null : Boolean(usernameValid && !usernameUser),
            emailAvailable: emailValid === null ? null : Boolean(emailValid && !emailUser),
            usernameValid,
            emailValid,
        };
    }

    async create(createUserDto: CreateUserDto, oauthId: string) {
        if (!oauthId) {
            throw new BadRequestException("Authenticated Firebase uid is required");
        }

        const normalizedUsername = this.normalizeUsername(createUserDto.username);
        const normalizedEmail = this.normalizeEmail(createUserDto.email);
        this.validateUsername(normalizedUsername);
        this.validateEmail(normalizedEmail);

        const existingOauthUser = await this.findByOauthId(oauthId);
        if (existingOauthUser) {
            return existingOauthUser;
        }

        const existingUsername = await this.userRepository.findOne({
            where: { usernameLower: normalizedUsername.toLowerCase() },
        });
        if (existingUsername) {
            throw new ConflictException("Username is already taken");
        }

        if (normalizedEmail) {
            const existingEmail = await this.userRepository.findOne({
                where: { emailLower: normalizedEmail },
            });
            if (existingEmail) {
                throw new ConflictException("Email is already in use");
            }
        }

        const displayName = [createUserDto.firstName, createUserDto.lastName]
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .join(" ")
            .trim();

        const user = this.userRepository.create({
            username: normalizedUsername,
            usernameLower: normalizedUsername.toLowerCase(),
            email: normalizedEmail,
            emailLower: normalizedEmail,
            authProvider: createUserDto.authProvider,
            oauthId,
            displayName: displayName || undefined,
            bio: createUserDto.bio,
            avatarUrl: createUserDto.avatarUrl,
            bannerUrl: createUserDto.bannerUrl,
            location: createUserDto.location,
            websiteUrl: createUserDto.websiteUrl,
        });

        try {
            const result = await this.userRepository.save(user);
            return result;
        } catch (error) {
            const mappedError = this.mapUniqueConstraintError(error);
            if (mappedError) {
                throw mappedError;
            }
            throw error;
        }
    }

    async findAll(page: number = 0, usersPerPage: number = 4, username?: string) {
        const skip = page * usersPerPage;
        
        if (username) {
            // Search for users with username matching (case-insensitive, partial match)
            const users = await this.userRepository.find({
                where: {
                    username: ILike(`%${username}%`),
                },
                skip,
                take: usersPerPage,
            });
            return users;
        }

        // Otherwise, paginate all users
        const users = await this.userRepository.find({
            skip,
            take: usersPerPage,
        });

        return users;
    }

    async findByOauthId(oauthId: string): Promise<User | null> {
        const user = await this.userRepository.findOne({
            where: { oauthId },
        });
        return user;
    }

    async findByOauthIdOrThrow(oauthId: string): Promise<User> {
        const user = await this.findByOauthId(oauthId);
        if (!user) {
            throw new NotFoundException("Authenticated user profile not found");
        }

        return user;
    }

    async findOne(identifier: string): Promise<User> {
        // TODO(authz): enforce profileVisibility rules for non-public profiles on read paths.
        let user: User | null = null;

        if (this.isUuid(identifier)) {
            user = await this.userRepository.findOne({
                where: { id: identifier },
            });
        }

        if (!user) {
            user = await this.userRepository.findOne({
                where: { oauthId: identifier },
            });
        }

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    async findByUsername(username: string, offset: number = 0, limit: number = 10) {
        const users = await this.userRepository.find({
            where: {
                usernameLower: username.toLowerCase(),
            },
            skip: offset,
            take: limit,
        });

        return users;
    }

    async updateCurrentUser(currentUserOauthId: string, updateUserDto: UpdateUserDto) {
        return this.update(currentUserOauthId, updateUserDto, currentUserOauthId);
    }

    async update(identifier: string, updateUserDto: UpdateUserDto, currentUserOauthId: string) {
        const currentUser = await this.findByOauthIdOrThrow(currentUserOauthId);
        const user = await this.findOne(identifier);
        this.ensureCanManageUser(currentUser, user);
        
        // Update usernameLower if username is being updated
        if (updateUserDto.username) {
            const normalizedUsername = this.normalizeUsername(updateUserDto.username);
            this.validateUsername(normalizedUsername);
            updateUserDto.username = normalizedUsername;
            updateUserDto['usernameLower'] = normalizedUsername.toLowerCase();
        }

        Object.assign(user, updateUserDto);
        const result = await this.userRepository.save(user);
        
        return { message: 'User updated successfully', user: result };
    }

    async removeCurrentUser(currentUserOauthId: string) {
        const currentUser = await this.findByOauthIdOrThrow(currentUserOauthId);
        return this.userRepository.remove(currentUser);
    }

    async remove(identifier: string, currentUserOauthId: string) {
        const currentUser = await this.findByOauthIdOrThrow(currentUserOauthId);
        const user = await this.findOne(identifier);
        this.ensureCanManageUser(currentUser, user);
        const result = await this.userRepository.remove(user);
        return result;
    }

    async followUser(currentUserIdentifier: string, targetIdentifier: string) {
        if (!currentUserIdentifier) {
            throw new BadRequestException("current user identifier is required");
        }
        if (!targetIdentifier) {
            throw new BadRequestException("target user identifier is required");
        }

        const currentUser = await this.findOne(currentUserIdentifier);
        const targetUser = await this.findOne(targetIdentifier);

        if (currentUser.id === targetUser.id) {
            throw new BadRequestException("You cannot follow yourself");
        }

        const existingFollow = await this.followRepository.findOne({
            where: {
                followerId: currentUser.id,
                followingId: targetUser.id,
            },
        });

        if (existingFollow) {
            return {
                success: true,
                following: true,
                message: "Already following user",
                followerId: currentUser.id,
                followingId: targetUser.id,
            };
        }

        const follow = this.followRepository.create({
            followerId: currentUser.id,
            followingId: targetUser.id,
        });
        await this.followRepository.save(follow);

        currentUser.followingCount = (currentUser.followingCount ?? 0) + 1;
        targetUser.followersCount = (targetUser.followersCount ?? 0) + 1;
        await this.userRepository.save([currentUser, targetUser]);

        return {
            success: true,
            following: true,
            message: "Followed user",
            followerId: currentUser.id,
            followingId: targetUser.id,
        };
    }

    async unfollowUser(currentUserIdentifier: string, targetIdentifier: string) {
        if (!currentUserIdentifier) {
            throw new BadRequestException("current user identifier is required");
        }
        if (!targetIdentifier) {
            throw new BadRequestException("target user identifier is required");
        }

        const currentUser = await this.findOne(currentUserIdentifier);
        const targetUser = await this.findOne(targetIdentifier);

        if (currentUser.id === targetUser.id) {
            throw new BadRequestException("You cannot unfollow yourself");
        }

        const existingFollow = await this.followRepository.findOne({
            where: {
                followerId: currentUser.id,
                followingId: targetUser.id,
            },
        });

        if (existingFollow) {
            await this.followRepository.remove(existingFollow);
            currentUser.followingCount = Math.max(0, (currentUser.followingCount ?? 0) - 1);
            targetUser.followersCount = Math.max(0, (targetUser.followersCount ?? 0) - 1);
            await this.userRepository.save([currentUser, targetUser]);
        }

        return {
            success: true,
            following: false,
            message: "Not following user",
            followerId: currentUser.id,
            followingId: targetUser.id,
        };
    }

    async getFollowingByIdentifier(identifier: string) {
        if (!identifier) {
            throw new BadRequestException("identifier is required");
        }

        const user = await this.findOne(identifier);

        const follows = await this.followRepository.find({
            where: { followerId: user.id },
            relations: ["following"],
            order: { createdAt: "DESC" },
        });

        const followingUsers = follows
            .map((follow) => follow.following)
            .filter((followedUser): followedUser is User => Boolean(followedUser));

        const followingIds = followingUsers.map((followedUser) => followedUser.id);

        return {
            userId: user.id,
            followingIds,
            following: followingUsers,
        };
    }

    async isFollowing(currentUserIdentifier: string, targetIdentifier: string) {
        if (!currentUserIdentifier) {
            throw new BadRequestException("current user identifier is required");
        }
        if (!targetIdentifier) {
            throw new BadRequestException("target user identifier is required");
        }

        const currentUser = await this.findOne(currentUserIdentifier);
        const targetUser = await this.findOne(targetIdentifier);

        if (currentUser.id === targetUser.id) {
            return {
                following: false,
                isSelf: true,
                followerId: currentUser.id,
                followingId: targetUser.id,
            };
        }

        const existingFollow = await this.followRepository.findOne({
            where: {
                followerId: currentUser.id,
                followingId: targetUser.id,
            },
        });

        return {
            following: Boolean(existingFollow),
            isSelf: false,
            followerId: currentUser.id,
            followingId: targetUser.id,
        };
    }

    private ensureCanManageUser(currentUser: User, targetUser: User) {
        if (currentUser.id !== targetUser.id) {
            // TODO(authz): allow admin/mod overrides once role-based authorization is introduced.
            throw new ForbiddenException("You can only modify your own user profile");
        }
    }
}
