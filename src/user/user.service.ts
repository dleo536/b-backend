import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, ILike } from "typeorm";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { User } from "./user.entity";

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) {}

    async create(createUserDto: CreateUserDto) {
        const user = this.userRepository.create({
            ...createUserDto,
            usernameLower: createUserDto.username.toLowerCase(),
            emailLower: createUserDto.email?.toLowerCase(),
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

    async findOne(identifier: string) {
        // Try to find by id (uuid) first, then by uid if it exists
        // For now, we'll use id as the primary identifier
        // If you need uid support, add a uid column to the entity
        const user = await this.userRepository.findOne({
            where: { id: identifier },
        });

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
}