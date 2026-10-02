import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SecretCipherService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string) {
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(value: string) {
    const [version, ivText, tagText, encryptedText] = value.split('.');
    if (
      version !== 'v1' ||
      !ivText ||
      !tagText ||
      !encryptedText
    ) {
      throw new Error('Invalid encrypted secret format.');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key() {
    return createHash('sha256')
      .update(
        this.config.getOrThrow<string>('PLATFORM_SECRET_ENCRYPTION_KEY'),
      )
      .digest();
  }
}
