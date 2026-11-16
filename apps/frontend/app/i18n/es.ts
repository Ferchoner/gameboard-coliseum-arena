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
    rooms: 'Salas',
    matches: 'Partidas',
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
    goToRooms: 'Ver las salas',
    guest: 'Crea una cuenta o entra para jugar.',
  },

  /** Lista de salas en espera y formulario para crear una. */
  rooms: {
    title: 'Salas',
    intro: 'Entra a una sala que esté esperando jugadores o crea la tuya.',
    refresh: 'Actualizar',
    refreshing: 'Actualizando…',
    loading: 'Cargando las salas…',
    empty: 'Ahora mismo no hay ninguna sala esperando jugadores.',
    more: 'Ver más salas',
    loadingMore: 'Cargando…',
    listTitle: 'Salas en espera',
    filters: {
      game: 'Juego',
      mode: 'Modalidad',
      anyGame: 'Todos los juegos',
      anyMode: 'Todas',
    },
    places: (members: number, capacity: number) => `${members} de ${capacity} jugadores`,
    ownedBy: (name: string) => `Sala de ${name}`,
    withRematch: 'Con revancha',
    join: 'Entrar',
    joining: 'Entrando…',
    open: 'Ver',
    create: {
      title: 'Crear una sala',
      noGames: 'Todavía no hay juegos disponibles, así que aún no se pueden crear salas.',
      game: 'Juego',
      mode: 'Modalidad',
      timeControl: 'Tiempo por jugador',
      maxPlayers: 'Jugadores',
      rematch: 'Volver a jugar en la misma sala al terminar',
      rematchHint:
        'Si no lo marcas, la sala se cierra al terminar la partida. En tiempo real la sala siempre queda abierta para la revancha.',
      submit: 'Crear sala',
      submitting: 'Creando la sala…',
    },
  },

  /** Sala de espera. */
  room: {
    title: (owner: string) => `Sala de ${owner}`,
    /** Cuando quien la creó ya no está, que es lo que pasa en una sala cerrada porque salió. */
    untitled: 'Sala',
    loading: 'Cargando la sala…',
    back: 'Volver a las salas',
    status: {
      WAITING: 'En espera',
      IN_MATCH: 'Partida en curso',
      CLOSED: 'Cerrada',
    },
    closeReasons: {
      OWNER_LEFT: 'La sala se cerró porque quien la creó salió.',
      IDLE: 'La sala se cerró por falta de actividad.',
      MATCH_ENDED: 'La sala se cerró al terminar su partida.',
      ADMIN: 'Un administrador cerró la sala.',
    },
    details: {
      game: 'Juego',
      mode: 'Modalidad',
      timeControl: 'Tiempo por jugador',
      rematch: 'Revancha',
      rematchOn: 'La sala sigue abierta al terminar la partida',
      rematchOff: 'La sala se cierra al terminar la partida',
    },
    membersTitle: (members: number, capacity: number) => `Jugadores (${members} de ${capacity})`,
    freePlace: 'Plaza libre',
    owner: 'Anfitrión',
    you: 'Tú',
    ready: 'Listo',
    notReady: 'Sin marcar',
    connected: 'Conectado',
    disconnected: 'Desconectado',
    howItStarts: {
      whenFullAndReady: 'La partida empieza cuando la sala esté completa y todos estén listos.',
      whenFull: 'La partida empieza en cuanto la sala se complete.',
      whenAllReady: 'La sala está completa. La partida empieza cuando todos estén listos.',
      allReady: 'Todos están listos. La partida empezará enseguida.',
    },
    inMatch: 'Esta sala tiene una partida en curso.',
    goToMatch: 'Ir a la partida',
    actions: {
      join: 'Entrar a la sala',
      joining: 'Entrando…',
      setReady: 'Estoy listo',
      unsetReady: 'Ya no estoy listo',
      leave: 'Salir de la sala',
      leaving: 'Saliendo…',
      ownerLeaveHint: 'Eres quien creó la sala: si sales, se cierra para todos.',
    },
    notLive: 'Los cambios de esta sala no se están recibiendo en vivo. Se actualiza al recargar.',
  },

  /** Una partida: el tablero, los relojes y el resultado. */
  match: {
    title: (rival: string) => `Partida contra ${rival}`,
    untitled: 'Partida',
    loading: 'Cargando la partida…',
    status: {
      IN_PROGRESS: 'En curso',
      FINISHED: 'Terminada',
      ABORTED: 'Anulada',
    },
    playersTitle: 'Jugadores',
    boardTitle: 'Tablero',
    you: 'Tú',
    turnBadge: 'Tiene el turno',
    clockOf: (name: string) => `Tiempo de ${name}`,
    /** Cuenta atrás de un rival desconectado (regla 7.26). */
    abandonIn: (time: string) => `Pierde por abandono en ${time}`,
    turn: {
      yours: 'Te toca jugar.',
      theirs: (name: string) => `Le toca a ${name}.`,
      sending: 'Enviando tu jugada…',
    },
    outcome: {
      WIN: 'Ganaste',
      LOSS: 'Perdiste',
      DRAW: 'Empate',
    },
    /** Por qué terminó, contado a quien lo provocó y a los demás. */
    endReasons: {
      COMPLETED: 'La partida llegó a su final.',
      TIMEOUT: {
        you: 'Se te acabó el tiempo.',
        other: (name: string) => `A ${name} se le acabó el tiempo.`,
      },
      RESIGNATION: {
        you: 'Te rendiste.',
        other: (name: string) => `${name} se rindió.`,
      },
      ABANDONMENT: {
        you: 'Abandonaste la partida.',
        other: (name: string) => `${name} abandonó la partida.`,
      },
    },
    aborted: {
      title: 'Partida anulada',
      FAILURE: 'La partida se anuló por un fallo del servidor. No cuenta para nadie.',
      ADMIN: 'Un administrador anuló la partida. No cuenta para nadie.',
    },
    resign: {
      action: 'Rendirse',
      question: '¿Seguro que quieres rendirte? Perderás la partida.',
      confirm: 'Sí, rendirme',
      cancel: 'Seguir jugando',
      sending: 'Rindiéndote…',
    },
    after: {
      backToRoom: 'Volver a la sala',
      rematchHint: 'En la sala pueden marcarse listos otra vez para jugar la revancha.',
      roomClosedHint: 'La sala de esta partida se cerró al terminar.',
      /** Quien pierde por abandono sale de la sala (regla 7.32). */
      leftRoomHint: 'Al perder por abandono saliste de la sala.',
      allMatches: 'Ver mis partidas',
    },
    unknownGame: 'Esta versión de la aplicación no sabe mostrar este juego. Recarga la página.',
    noBoard: 'El tablero de esta partida no se puede mostrar.',
    notConnected: 'No hay conexión con el servidor, así que no se envió. Vuelve a intentarlo.',
  },

  /** Lista de las partidas propias. */
  matches: {
    title: 'Mis partidas',
    intro: 'Las partidas que tienes en curso y las que ya terminaste.',
    inProgressTitle: 'En curso',
    historyTitle: 'Historial',
    loading: 'Cargando tus partidas…',
    emptyInProgress: 'No tienes ninguna partida en curso.',
    emptyHistory: 'Todavía no has terminado ninguna partida.',
    against: (names: string) => `Contra ${names}`,
    play: 'Ir a la partida',
    open: 'Ver',
    yourTurn: 'Te toca',
    theirTurn: 'Le toca a tu rival',
    startedAt: (date: string) => `Empezó el ${date}`,
    endedAt: (date: string) => `Terminó el ${date}`,
    more: 'Ver más partidas',
    loadingMore: 'Cargando…',
    outcome: {
      WIN: 'Victoria',
      LOSS: 'Derrota',
      DRAW: 'Empate',
    },
    endReasons: {
      COMPLETED: 'partida completa',
      TIMEOUT: 'por tiempo',
      RESIGNATION: 'por rendición',
      ABANDONMENT: 'por abandono',
    },
  },

  /** Textos propios de cada juego. */
  games: {
    'four-in-a-row': {
      seats: ['Rojas', 'Amarillas'],
      dropIn: (column: number) => `Soltar ficha en la columna ${column}`,
      columnState: (tokens: number, capacity: number) => `${tokens} de ${capacity} fichas`,
      end: {
        line: 'Cuatro en línea.',
        full: 'El tablero se llenó sin cuatro en línea.',
      },
      rejections: {
        MALFORMED_ACTION: 'Esa jugada no es válida.',
        COLUMN_OUT_OF_RANGE: 'Esa columna no existe.',
        COLUMN_FULL: 'Esa columna está llena.',
      },
    },
  },

  /** Estado de la conexión de tiempo real. */
  realtime: {
    reconnecting: 'Se perdió la conexión con el servidor. Reconectando…',
    /** Se añade mientras hay una partida en tiempo real en curso (ADR-015, decisión V8). */
    reconnectingInMatch: 'Si no vuelves a conectar en 2 minutos, perderás la partida.',
    stopped: {
      SESSION_ENDED: 'Tu sesión terminó. Vuelve a entrar.',
      UNSUPPORTED_VERSION: 'Hay una versión nueva de la aplicación. Recarga la página.',
      TOO_MANY_CONNECTIONS:
        'Tienes demasiadas pestañas abiertas con esta cuenta. Cierra alguna y recarga la página.',
      PROTOCOL_ERROR: 'Algo falló en la aplicación. Recarga la página.',
    },
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
