import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { Public } from '../auth/decorators/public.decorator';

// Public — search should work for anonymous visitors browsing the
// marketing site too, same as the course catalog itself.
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Public()
  @Get()
  search(@Query('q') query: string) {
    return this.searchService.search(query);
  }
}
