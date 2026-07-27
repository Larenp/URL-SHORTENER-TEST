import { IsOptional, IsString, IsUrl, Length, Matches, MaxLength } from 'class-validator';
import {
  CUSTOM_CODE_MAX_LENGTH,
  CUSTOM_CODE_MIN_LENGTH,
  CUSTOM_CODE_PATTERN,
} from '../url-code.util';

const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 200;

export class CreateUrlDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(MAX_URL_LENGTH)
  originalUrl: string;

  @IsOptional()
  @IsString()
  @Length(CUSTOM_CODE_MIN_LENGTH, CUSTOM_CODE_MAX_LENGTH)
  @Matches(CUSTOM_CODE_PATTERN, {
    message: 'customCode may only contain letters, numbers, hyphens, and underscores',
  })
  customCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;
}
