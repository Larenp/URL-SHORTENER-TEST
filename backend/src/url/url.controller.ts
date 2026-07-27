import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UrlService } from './url.service';
import { CreateUrlDto } from './dto/create-url.dto';
import { UpdateUrlDto } from './dto/update-url.dto';
import { ListUrlsQueryDto } from './dto/list-urls-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../authorization/decorators/require-permissions.decorator';
import { Permission } from '../authorization/permission.enum';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@Controller('urls')
export class UrlController {
  constructor(private readonly urlService: UrlService) {}

  @Post()
  @RequirePermissions(Permission.URL_CREATE)
  create(@Body() dto: CreateUrlDto, @CurrentUser() currentUser: JwtPayload) {
    return this.urlService.create(dto, currentUser);
  }

  @Get()
  @RequirePermissions(Permission.URL_READ)
  findAll(@Query() query: ListUrlsQueryDto) {
    return this.urlService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(Permission.URL_READ)
  findOne(@Param('id') id: string) {
    return this.urlService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.URL_MANAGE_OWN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUrlDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.urlService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @RequirePermissions(Permission.URL_MANAGE_OWN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() currentUser: JwtPayload) {
    return this.urlService.remove(id, currentUser);
  }
}
