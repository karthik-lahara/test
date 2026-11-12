const KEY = "tm.accessToken";

/** Access token kept for the session. The real API also sets an httpOnly refresh cookie. */
export const authToken = {
  get(): string | null {
    try {
      return sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    try {
      sessionStorage.setItem(KEY, token);
    } catch {
      /* storage blocked: the session lasts until reload */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
