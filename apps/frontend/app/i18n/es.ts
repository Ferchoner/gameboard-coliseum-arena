import type { ERROR_CATALOG, ErrorCode, ValidationRule } from '@gameboard/contracts';

/**
 * Todos los textos que ve la persona, en un solo lugar (ADR-012, decisión S24).
 */

/** Códigos que pueden llegar al cliente. Los dos del motor que nunca llegan no tienen texto. */
export type ClientErrorCode = {
  [Code in ErrorCode]: (typeof ERROR_CATALOG)[Code]['reaction'] extends null ? never : Code;
}[ErrorCode];

export const es = {
  app: {
    name: 'Juegos de Mesa en Línea',
    tagline: 'Juega contra otras personas, en tiempo real o por turnos.',
  },

  nav: {
    home: 'Juegos',
    signIn: 'Entrar',
    register: 'Crear cuenta',
    signOut: 'Salir',
    signingOut: 'Saliendo…',
    signedInAs: 'Sesión de',
  },

  home: {
    title: 'Juegos',
    loading: 'Cargando los juegos…',
    empty: 'Todavía no hay juegos disponibles.',
    retry: 'Volver a intentar',
    players: {
      exact: (count: number) => `${count} jugadores`,
      range: (min: number, max: number) => `De ${min} a ${max} jugadores`,
    },
    modes: {
      REALTIME: 'En tiempo real',
      TURN_BASED: 'Por turnos',
    },
    timePerPlayer: 'por jugador',
    welcome: (name: string) => `Hola, ${name}.`,
    guest: 'Crea una cuenta o entra para jugar.',
  },

  register: {
    title: 'Crear cuenta',
    submit: 'Crear cuenta',
    submitting: 'Creando la cuenta…',
    haveAccount: '¿Ya tienes cuenta?',
  },

  signIn: {
    title: 'Entrar',
    submit: 'Entrar',
    submitting: 'Entrando…',
    noAccount: '¿No tienes cuenta?',
  },

  fields: {
    email: { label: 'Correo electrónico' },
    username: {
      label: 'Nombre de usuario',
      hint: (min: number, max: number) =>
        `De ${min} a ${max} caracteres: letras sin acento, números y guion bajo.`,
    },
    password: {
      label: 'Contraseña',
      hint: (min: number) => `Al menos ${min} caracteres.`,
    },
  },

  /** Qué le pasa a un campo según la regla que incumple (catálogo de errores, decisión E7). */
  validation: {
    REQUIRED: 'Este dato es obligatorio.',
    INVALID_FORMAT: 'El formato no es válido.',
    TOO_SHORT: 'Es demasiado corto.',
    TOO_LONG: 'Es demasiado largo.',
    OUT_OF_RANGE: 'El valor está fuera de lo permitido.',
  } satisfies Record<ValidationRule, string>,

  /** Un texto por cada código del catálogo de errores. */
  errors: {
    // Generales
    VALIDATION_ERROR: 'Revisa los datos marcados.',
    INVALID_MESSAGE: 'Algo falló en la aplicación. Recarga la página.',
    UNAUTHENTICATED: 'Tu sesión terminó. Vuelve a entrar.',
    FORBIDDEN: 'No tienes permiso para hacer esto.',
    ORIGIN_NOT_ALLOWED: 'Algo falló en la aplicación. Recarga la página.',
    ROUTE_NOT_FOUND: 'Algo falló en la aplicación. Recarga la página.',
    METHOD_NOT_ALLOWED: 'Algo falló en la aplicación. Recarga la página.',
    PAYLOAD_TOO_LARGE: 'Algo falló en la aplicación. Recarga la página.',
    RATE_LIMITED: 'Demasiados intentos. Espera un momento y vuelve a intentarlo.',
    INTERNAL_ERROR: 'El servidor tuvo un problema. Vuelve a intentarlo en un momento.',

    // Autenticación y cuenta
    EMAIL_TAKEN: 'Ya hay una cuenta con ese correo.',
    USERNAME_TAKEN: 'Ese nombre de usuario ya está en uso.',
    INVALID_CREDENTIALS: 'El nombre de usuario o la contraseña no son correctos.',
    ACCOUNT_SUSPENDED: 'Tu cuenta está suspendida.',
    INVALID_RESET_TOKEN:
      'El enlace para cambiar la contraseña no es válido o ya caducó. Pide otro.',
    INVALID_CURRENT_PASSWORD: 'La contraseña actual no es correcta.',

    // Jugadores y catálogo
    PLAYER_NOT_FOUND: 'Ese jugador no existe.',
    GAME_NOT_FOUND: 'Ese juego no existe o no está disponible.',

    // Salas
    ROOM_NOT_FOUND: 'Esa sala no existe.',
    PLAYER_NOT_IN_ROOM: 'Ya no estás en esa sala.',
    ROOM_NOT_WAITING: 'La sala ya no admite cambios.',
    ROOM_FULL: 'La sala está llena.',
    ROOM_IN_MATCH: 'No se puede hacer mientras la sala tiene una partida en curso.',
    MATCH_LIMIT_REACHED:
      'Llegaste al máximo de partidas simultáneas. Termina alguna para empezar otra.',
    UNSUPPORTED_ROOM_OPTIONS: 'El juego no admite esas opciones de sala.',
    INVALID_SETTINGS: 'La configuración de la partida no es válida para este juego.',

    // Partidas y juego
    MATCH_NOT_FOUND: 'Esa partida no existe.',
    PLAYER_NOT_IN_MATCH: 'No participas en esa partida.',
    MATCH_NOT_IN_PROGRESS: 'La partida ya no está en curso.',
    STALE_STATE_VERSION: 'La partida cambió mientras jugabas. Se actualizó el tablero.',
    CLOCK_EXPIRED: 'Se te acabó el tiempo.',
    NOT_YOUR_TURN: 'No es tu turno.',
    INVALID_ACTION: 'Esa jugada no es válida.',

    // Administración
    USER_NOT_FOUND: 'Esa cuenta no existe.',
    CANNOT_CHANGE_OWN_STATUS: 'No puedes cambiar el estado de tu propia cuenta.',
    GAME_VERSION_NOT_FOUND: 'Esa versión del juego no existe.',
    ENGINE_NOT_REGISTERED: 'Esa versión no se puede activar porque el servidor no tiene su motor.',
    GAME_VERSION_IS_CURRENT:
      'No se puede desactivar la versión vigente. Elige antes otra como vigente.',
    GAME_VERSION_NOT_ACTIVE: 'Solo una versión activa puede ser la vigente.',
  } satisfies Record<ClientErrorCode, string>,

  /** Fallos que no vienen del servidor. */
  client: {
    network: 'No se pudo conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.',
    unexpected: 'El servidor respondió algo inesperado. Vuelve a intentarlo en un momento.',
    sessionUnknown: 'No se pudo comprobar tu sesión.',
  },

  duration: {
    hours: (count: number) => (count === 1 ? '1 hora' : `${count} horas`),
    minutes: (count: number) => (count === 1 ? '1 minuto' : `${count} minutos`),
    seconds: (count: number) => (count === 1 ? '1 segundo' : `${count} segundos`),
    and: 'y',
  },
} as const;
