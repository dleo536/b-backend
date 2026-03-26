import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
} from "@nestjs/common";
import { createHash } from "node:crypto";

@Injectable()
export class DiscogsService {
    private readonly discogsBaseUrl = "https://api.discogs.com";
    private readonly musicBrainzBaseUrl = "https://musicbrainz.org/ws/2";
    private readonly userAgent = "b.sides/1.0";

    private getDiscogsToken(): string {
        const token = process.env.DISCOGS_TOKEN?.trim();

        if (!token) {
            throw new InternalServerErrorException(
                "Discogs is not configured. Set DISCOGS_TOKEN on the backend.",
            );
        }

        return token;
    }

    private async fetchJson<T>(
        input: string,
        init?: RequestInit,
        { required = false }: { required?: boolean } = {},
    ): Promise<T | null> {
        const response = await fetch(input, init);

        if (!response.ok) {
            if (required) {
                throw new BadRequestException(`Upstream request failed with status ${response.status}`);
            }

            return null;
        }

        return (await response.json()) as T;
    }

    private async fetchDiscogs<T>(
        path: string,
        query: Record<string, string | undefined>,
        { required = false }: { required?: boolean } = {},
    ): Promise<T | null> {
        const url = new URL(`${this.discogsBaseUrl}${path}`);

        Object.entries(query).forEach(([key, value]) => {
            if (typeof value === "string" && value.trim()) {
                url.searchParams.set(key, value.trim());
            }
        });

        return this.fetchJson<T>(
            url.toString(),
            {
                headers: {
                    Accept: "application/json",
                    Authorization: `Discogs token=${this.getDiscogsToken()}`,
                    "User-Agent": this.userAgent,
                },
            },
            { required },
        );
    }

    private async fetchPublicJson<T>(url: string): Promise<T | null> {
        return this.fetchJson<T>(url, {
            headers: {
                Accept: "application/json",
                "User-Agent": this.userAgent,
            },
        });
    }

    async getMusicianMixedCredits(musicianName?: string) {
        const normalizedName = musicianName?.trim();
        if (!normalizedName) {
            return [];
        }

        const response = await this.fetchDiscogs<{ results?: unknown[] }>(
            "/database/search",
            {
                q: normalizedName,
                credit: "Mixed By",
                type: "release",
            },
            { required: true },
        );

        return Array.isArray(response?.results) ? response.results : [];
    }

    async getArtists(searchValue?: string) {
        const normalizedQuery = searchValue?.trim();
        if (!normalizedQuery) {
            return [];
        }

        const response = await this.fetchDiscogs<{ results?: unknown[] }>(
            "/database/search",
            {
                q: normalizedQuery,
                type: "artist",
            },
            { required: true },
        );

        return Array.isArray(response?.results) ? response.results : [];
    }

    async getLabels(searchValue?: string) {
        const normalizedQuery = searchValue?.trim();
        if (!normalizedQuery) {
            return [];
        }

        const response = await this.fetchDiscogs<{ results?: unknown[] }>(
            "/database/search",
            {
                q: normalizedQuery,
                type: "label",
            },
            { required: true },
        );

        return Array.isArray(response?.results) ? response.results : [];
    }

    async getArtistBio(artistName?: string) {
        const normalizedName = artistName?.trim();
        if (!normalizedName) {
            return "Artist not found";
        }

        const searchResponse = await this.fetchDiscogs<{ results?: Array<{ id?: number }> }>(
            "/database/search",
            {
                q: normalizedName,
                type: "artist",
            },
            { required: true },
        );
        const artistId = searchResponse?.results?.[0]?.id;

        if (!artistId) {
            return "Artist not found";
        }

        const artist = await this.fetchDiscogs<{ profile?: string }>(
            `/artists/${artistId}`,
            {},
            { required: true },
        );

        return artist?.profile || "No bio available.";
    }

    async getArtistImage(artistName?: string) {
        const normalizedName = artistName?.trim();
        if (!normalizedName) {
            return null;
        }

        const searchResponse = await this.fetchDiscogs<{ results?: Array<{ id?: number }> }>(
            "/database/search",
            {
                q: normalizedName,
                type: "artist",
            },
            { required: true },
        );
        const artistId = searchResponse?.results?.[0]?.id;

        if (!artistId) {
            return null;
        }

        const artistData = await this.fetchDiscogs<{ images?: Array<{ uri?: string }> }>(
            `/artists/${artistId}`,
            {},
        );
        const discogsImage = artistData?.images?.[0]?.uri;
        if (discogsImage) {
            return discogsImage;
        }

        const releases = await this.fetchDiscogs<{ releases?: Array<{ thumb?: string }> }>(
            `/artists/${artistId}/releases`,
            {},
        );
        const releaseThumb = releases?.releases?.[0]?.thumb;
        if (releaseThumb) {
            return releaseThumb;
        }

        const mbSearch = await this.fetchPublicJson<{ artists?: Array<{ id?: string }> }>(
            `${this.musicBrainzBaseUrl}/artist/?query=${encodeURIComponent(normalizedName)}&fmt=json`,
        );
        const mbid = mbSearch?.artists?.[0]?.id;
        if (!mbid) {
            return null;
        }

        const mbDetail = await this.fetchPublicJson<{
            relations?: Array<{ type?: string; url?: { resource?: string } }>;
        }>(
            `${this.musicBrainzBaseUrl}/artist/${encodeURIComponent(mbid)}?inc=url-rels&fmt=json`,
        );
        const wikidataUrl = mbDetail?.relations?.find((relation) => relation.type === "wikidata")?.url?.resource;
        if (!wikidataUrl) {
            return null;
        }

        const wikidataId = wikidataUrl.split("/").pop();
        if (!wikidataId) {
            return null;
        }

        const wikidata = await this.fetchPublicJson<{
            entities?: Record<
                string,
                { claims?: { P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }> } }
            >;
        }>(
            `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(wikidataId)}.json`,
        );
        const imageFile = wikidata?.entities?.[wikidataId]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (!imageFile) {
            return null;
        }

        const formatted = imageFile.replace(/ /g, "_");
        const md5 = createHash("md5").update(formatted).digest("hex");

        return `https://upload.wikimedia.org/wikipedia/commons/${md5.slice(0, 1)}/${md5.slice(0, 2)}/${formatted}`;
    }
}
