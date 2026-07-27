import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 200;

export class UpdateUrlDto {
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(MAX_URL_LENGTH)
  originalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;
}
