import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpotifyService } from '../spotify/spotify.service';
import { CreateRecentReleaseAlbumDto } from './dto/create-recent-release-album.dto';
import { RecentReleaseAlbum } from './recent-release-album.entity';

@Injectable()
export class RecentReleaseService {
  constructor(
    @InjectRepository(RecentReleaseAlbum)
    private readonly recentReleaseAlbumRepository: Repository<RecentReleaseAlbum>,
    private readonly spotifyService: SpotifyService,
  ) {}

  private normalizeLimit(limit = 24) {
    if (!Number.isFinite(limit)) {
      return 24;
    }

    return Math.min(Math.max(Math.trunc(limit), 1), 100);
  }

  private normalizeOffset(offset = 0) {
    if (!Number.isFinite(offset)) {
      return 0;
    }

    return Math.max(Math.trunc(offset), 0);
  }

  async findAll(limit = 24, offset = 0) {
    const normalizedLimit = this.normalizeLimit(limit);
    const normalizedOffset = this.normalizeOffset(offset);
    const [data, totalCount] =
      await this.recentReleaseAlbumRepository.findAndCount({
        order: {
          sortOrder: 'ASC',
          createdAt: 'DESC',
        },
        take: normalizedLimit,
        skip: normalizedOffset,
      });

    return {
      data,
      totalCount,
      hasMore: normalizedOffset + data.length < totalCount,
    };
  }

  async create(createDto: CreateRecentReleaseAlbumDto) {
    const spotifyAlbumId = createDto.spotifyAlbumId?.trim();
    if (!spotifyAlbumId) {
      throw new BadRequestException('spotifyAlbumId is required');
    }

    const albumSnapshot = (await this.spotifyService.getAlbum(
      spotifyAlbumId,
    )) as Record<string, unknown>;

    const existing = await this.recentReleaseAlbumRepository.findOne({
      where: { spotifyAlbumId },
    });
    const nextEntry = this.recentReleaseAlbumRepository.create({
      ...(existing || {}),
      spotifyAlbumId,
      sortOrder: Number.isFinite(createDto.sortOrder)
        ? Number(createDto.sortOrder)
        : existing?.sortOrder || 0,
      albumSnapshot,
    });

    return this.recentReleaseAlbumRepository.save(nextEntry);
  }

  async createMany(createDtos: CreateRecentReleaseAlbumDto[]) {
    if (!Array.isArray(createDtos) || createDtos.length === 0) {
      throw new BadRequestException('albums must include at least one album');
    }

    const normalizedDtos = createDtos
      .map((createDto) => ({
        ...createDto,
        spotifyAlbumId: createDto?.spotifyAlbumId?.trim(),
      }))
      .filter((createDto) => Boolean(createDto.spotifyAlbumId));

    if (normalizedDtos.length === 0) {
      throw new BadRequestException('albums must include at least one spotifyAlbumId');
    }

    const results: RecentReleaseAlbum[] = [];
    const seenAlbumIds = new Set<string>();

    for (const createDto of normalizedDtos) {
      if (!createDto.spotifyAlbumId || seenAlbumIds.has(createDto.spotifyAlbumId)) {
        continue;
      }

      seenAlbumIds.add(createDto.spotifyAlbumId);
      results.push(await this.create(createDto));
    }

    return results;
  }

  async removeBySpotifyAlbumId(spotifyAlbumId: string) {
    const normalizedSpotifyAlbumId = spotifyAlbumId?.trim();
    if (!normalizedSpotifyAlbumId) {
      throw new BadRequestException('spotifyAlbumId is required');
    }

    const entry = await this.recentReleaseAlbumRepository.findOne({
      where: { spotifyAlbumId: normalizedSpotifyAlbumId },
    });

    if (!entry) {
      throw new NotFoundException('Recent release album not found');
    }

    await this.recentReleaseAlbumRepository.remove(entry);

    return {
      success: true,
      spotifyAlbumId: normalizedSpotifyAlbumId,
      deleted: true,
    };
  }
}
