const STORAGE_KEY = 'bobaroom_auth';
const CREDENTIALS = { username: 'admin', password: '101969' };

export const authService = {
  isLoggedIn(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  },

  login(username: string, password: string): boolean {
    if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
      localStorage.setItem(STORAGE_KEY, 'true');
      return true;
    }
    return false;
  },

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
