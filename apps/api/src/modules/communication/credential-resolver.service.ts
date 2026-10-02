import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class CredentialResolverService {
  resolve(reference?: string): string {
    if (!reference) {
      throw new ServiceUnavailableException(
        'Channel credential reference is not configured.',
      );
    }

    if (reference.startsWith('env:')) {
      const name = reference.slice(4);
      const value = process.env[name];
      if (!value) {
        throw new ServiceUnavailableException(
          `Credential environment variable ${name} is not configured.`,
        );
      }
      return value;
    }

    if (reference.startsWith('mock:')) {
      return reference;
    }

    throw new ServiceUnavailableException(
      'Unsupported credential reference. Use env:<VARIABLE> for now.',
    );
  }
}
