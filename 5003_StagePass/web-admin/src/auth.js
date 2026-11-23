import { reactive } from 'vue';

const TOKEN_KEY = 'stagepass.admin.token';
const USER_KEY = 'stagepass.admin.user';

function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export const session = reactive({
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: readUser(),
});

export function setSession(data) {
  session.token = data.token;
  session.user = data.user;
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearSession() {
  session.token = '';
  session.user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export const isLoggedIn = () => Boolean(session.token);
export const isAdmin = () => Boolean(session.user?.roles?.includes('ADMIN'));
export const isChecker = () => Boolean(session.user?.roles?.includes('CHECKER'));
