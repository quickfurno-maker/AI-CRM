import { Global, Module } from '@nestjs/common';
import { SecretCipherService } from './secret-cipher.service.js';

@Global()
@Module({
  providers: [SecretCipherService],
  exports: [SecretCipherService],
})
export class SecurityModule {}
