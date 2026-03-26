import { Controller, Get, Query } from "@nestjs/common";
import { DiscogsService } from "./discogs.service";

@Controller("discogs")
export class DiscogsController {
    constructor(private readonly discogsService: DiscogsService) {}

    @Get("mixing-credits")
    getMixingCredits(@Query("name") musicianName?: string) {
        return this.discogsService.getMusicianMixedCredits(musicianName);
    }

    @Get("artists/search")
    getArtists(@Query("q") query?: string) {
        return this.discogsService.getArtists(query);
    }

    @Get("labels/search")
    getLabels(@Query("q") query?: string) {
        return this.discogsService.getLabels(query);
    }

    @Get("artists/bio")
    getArtistBio(@Query("name") artistName?: string) {
        return this.discogsService.getArtistBio(artistName);
    }

    @Get("artists/image")
    getArtistImage(@Query("name") artistName?: string) {
        return this.discogsService.getArtistImage(artistName);
    }
}
