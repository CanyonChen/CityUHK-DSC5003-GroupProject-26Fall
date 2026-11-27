import { reactive } from 'vue';

export const TOKEN_KEY = 'cityuhk-events-hub.token';
const USER_KEY = 'cityuhk-events-hub.user';
const oldTokenKey = 'stagepass.token';
const oldUserKey = 'stagepass.user';

// Move the previous session as a pair. A profile from another session must never be attached to a newer token.
const oldToken = localStorage.getItem(oldTokenKey);
if (oldToken && localStorage.getItem(TOKEN_KEY) === null && localStorage.getItem(USER_KEY) === null) {
  localStorage.setItem(TOKEN_KEY, oldToken);
}
if (oldToken && localStorage.getItem(TOKEN_KEY) === oldToken && localStorage.getItem(USER_KEY) === null) {
  const oldUser = localStorage.getItem(oldUserKey);
  if (oldUser !== null) localStorage.setItem(USER_KEY, oldUser);
}
localStorage.removeItem(oldTokenKey);
localStorage.removeItem(oldUserKey);

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
