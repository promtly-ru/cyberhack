/** Вход недоступен: нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (гостевой режим). */
export class BackendNotConfiguredError extends Error {
  constructor(message = 'Сервер не настроен: вход недоступен, прогресс хранится только в этом браузере') {
    super(message);
    this.name = 'BackendNotConfiguredError';
  }
}

/** Действие требует входа в аккаунт. */
export class AuthRequiredError extends Error {
  constructor(message = 'Нужно войти в аккаунт') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

/** Сервер недоступен (нет сети). Сохранения в этом случае ставятся в офлайн-очередь. */
export class NetworkError extends Error {
  constructor(message = 'Нет связи с сервером') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Ошибка сервера с текстом для пользователя. */
export class BackendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendError';
  }
}

export type LocalProfileErrorCode =
  | 'name_length'
  | 'name_chars'
  | 'name_taken'
  | 'pin_format'
  | 'pin_required'
  | 'pin_wrong'
  | 'not_found'
  | 'too_many';

/** Ошибка офлайн-профиля: текст можно сразу показывать игроку. */
export class LocalProfileError extends Error {
  constructor(
    readonly code: LocalProfileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LocalProfileError';
  }
}
