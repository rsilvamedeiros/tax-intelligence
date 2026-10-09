import {
  authenticatedIdentitySchema,
  browserSessionSchema,
} from '@tax/contracts';
import { readCookie, type AuthStore } from './handlers';
export function createTokenReader(store: AuthStore) {
  return async (request: Request) => {
    const id = readCookie(request, 'tax_session');
    const data = id ? await store.read('session', id) : undefined;
    if (
      !data ||
      typeof data.accessToken !== 'string' ||
      !data.accessToken ||
      !browserSessionSchema.shape.csrfToken.safeParse(data.csrfToken).success ||
      !authenticatedIdentitySchema.safeParse(data.identity).success
    )
      return undefined;
    return {
      accessToken: data.accessToken,
      csrfToken: browserSessionSchema.shape.csrfToken.parse(data.csrfToken),
    };
  };
}
