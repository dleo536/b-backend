import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateListDto } from "./dto/create-list.dto";
import { UpdateListDto } from "./dto/update-list.dto";
import { AlbumList } from "./list.entity";
import { User } from "../user/user.entity";

@Injectable()
export class ListService {
    constructor(
        @InjectRepository(AlbumList)
        private listRepository: Repository<AlbumList>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
    ) {}

    async create(createListDto: CreateListDto) {
        // Map Firebase UID to User UUID
        const user = await this.userRepository.findOne({
            where: { oauthId: createListDto.firebaseUid },
        });

        if (!user) {
            throw new NotFoundException(`User with Firebase UID ${createListDto.firebaseUid} not found`);
        }

        const list = this.listRepository.create({
            ...createListDto,
            ownerId: user.id, // Use User UUID for FK
            firebaseUid: createListDto.firebaseUid, // Store Firebase UID separately
        });
        const result = await this.listRepository.save(list);
        return result;
    }

    async findAll(userID?: string, offset: number = 0, limit: number = 10) {
        // Build query filter - Express uses userID, entity uses ownerId
        const where: any = {};
        if (userID) {
            where.ownerId = userID;
        }

        // Get the total count of matching documents
        const totalCount = await this.listRepository.count({ where });

        // Get paginated lists
        const lists = await this.listRepository.find({
            where,
            skip: offset,
            take: limit,
            order: {
                createdAt: 'DESC',
            },
        });

        const hasMore = offset + lists.length < totalCount;

        return {
            data: lists,
            hasMore,
            totalCount,
        };
    }

    async findByUserId(userID: string) {
        const lists = await this.listRepository.find({
            where: { ownerId: userID },
            order: {
                createdAt: 'DESC',
            },
        });

        return lists;
    }

    async findOne(id: string) {
        const list = await this.listRepository.findOne({
            where: { id },
        });

        if (!list) {
            throw new NotFoundException('List not found');
        }

        return list;
    }

    async update(id: string, updateListDto: UpdateListDto) {
        const list = await this.findOne(id);
        Object.assign(list, updateListDto);
        const result = await this.listRepository.save(list);
        return result;
    }

    async remove(id: string) {
        const list = await this.findOne(id);
        const result = await this.listRepository.remove(list);
        return result;
    }
}