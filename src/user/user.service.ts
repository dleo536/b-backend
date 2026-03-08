import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, ILike } from "typeorm";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./user.entity";
import { UserFollow } from "./follow.entity";

@Injectable()
export class UserService {
    private readonly logger = new Logger(UserService.name);

    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(UserFollow)
        private followRepository: Repository<UserFollow>,
    ) {}

    async create(createUserDto: CreateUserDto) {
        const legacyUid = (createUserDto as any).uid;
        const oauthId =
            createUserDto.oauthId ??
            (typeof legacyUid === "string" && legacyUid.length > 0 ? legacyUid : undefined);

        const user = this.userRepository.create({
            ...createUserDto,
            usernameLower: createUserDto.username.toLowerCase(),
            emailLower: createUserDto.email?.toLowerCase(),
            oauthId,
        });
        const result = await this.userRepository.save(user);
        return result;
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

    async findByOauthId(oauthId: string) {
        const user = await this.userRepository.findOne({
            where: { oauthId },
        });
        return user;
    }

    async findOne(identifier: string) {
        let user = await this.userRepository.findOne({
            where: { id: identifier },
        });

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

    async update(identifier: string, updateUserDto: UpdateUserDto) {
        const user = await this.findOne(identifier);
        
        // Update usernameLower if username is being updated
        if (updateUserDto.username) {
            updateUserDto['usernameLower'] = updateUserDto.username.toLowerCase();
        }

        Object.assign(user, updateUserDto);
        const result = await this.userRepository.save(user);
        
        return { message: 'User updated successfully', user: result };
    }

    async remove(identifier: string) {
        const user = await this.findOne(identifier);
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

        this.logger.log(
            `[followUser] authUserId=${currentUser.id} targetId=${targetUser.id} followExists=${Boolean(existingFollow)}`,
        );

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

        this.logger.log(
            `[unfollowUser] authUserId=${currentUser.id} targetId=${targetUser.id} followExists=${Boolean(existingFollow)}`,
        );

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

        this.logger.log(
            `[getFollowingByIdentifier] authUserId=${user.id} followingCount=${followingIds.length}`,
        );

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

        this.logger.log(
            `[isFollowing] authUserId=${currentUser.id} targetId=${targetUser.id} following=${Boolean(existingFollow)}`,
        );

        return {
            following: Boolean(existingFollow),
            isSelf: false,
            followerId: currentUser.id,
            followingId: targetUser.id,
        };
    }
}
