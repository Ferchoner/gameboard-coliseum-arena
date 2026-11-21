/**
 * Los textos de Mareas. Cada juego tiene los suyos en su carpeta (ADR-018,
 * decisión Z7). El nombre del juego en que se inspira no aparece en la
 * aplicación (ADR-023, MA1). Los nombres de las cartas son los del anexo del
 * catálogo propio.
 */
export const tidesStrings = {
  seats: ['Asiento 1', 'Asiento 2', 'Asiento 3', 'Asiento 4'],
  you: 'Tú',

  seasons: {
    SPRING: 'Primavera',
    SUMMER: 'Verano',
    AUTUMN: 'Otoño',
    WINTER: 'Invierno',
  },
  /** Cada cara, con su figura: la figura es lo que distingue sin color. */
  faces: {
    NET: 'Red',
    ANCHOR: 'Ancla',
    SAIL: 'Vela',
    CALM: 'Calma',
    STORM: 'Tormenta',
    BREEZE: 'Brisa',
  },
  symbols: {
    NET: '#',
    ANCHOR: '⚓',
    SAIL: '⛵',
    CALM: '☀',
    STORM: '⚡',
    BREEZE: '≈',
  },
  kinds: { BOAT: 'barca', WEATHER: 'clima' },
  ingredients: {
    FISH: 'Pescado',
    SALT: 'Sal',
    ALGAE: 'Algas',
    PEARL: 'Perla',
  },
  ingredientSymbols: { FISH: 'P', SALT: 'S', ALGAE: 'A', PEARL: '◆' },
  rewards: { FISH: 'pescado', SALT: 'sal', ALGAE: 'algas', BIRD: 'ave' },

  islands: {
    I01: 'Roca Gris',
    I02: 'Cala Honda',
    I03: 'Isla del Faro',
    I04: 'El Arenal',
    I05: 'Los Cangrejos',
    I06: 'Punta Brava',
    I07: 'Las Salinas',
    I08: 'Isla Verde',
    I09: 'Bahía Quieta',
    I10: 'Peñón Alto',
    I11: 'Dos Vientos',
    I12: 'Las Gemelas',
    I13: 'Isla Larga',
    I14: 'Morro Negro',
    I15: 'Playa Blanca',
    I16: 'Arrecife Rojo',
    I17: 'Isla Ballena',
    I18: 'Cayo del Sur',
    I19: 'La Encrucijada',
    I20: 'Cabo Mayor',
  } as Readonly<Record<string, string>>,

  birds: {
    PUFFIN: 'Frailecillo',
    SKUA: 'Págalo',
    AUK: 'Alca',
    TERN: 'Charrán',
    CORMORANT: 'Cormorán',
    GULL: 'Gaviota',
    PELICAN: 'Pelícano',
    HERON: 'Garza',
    FLAMINGO: 'Flamenco',
    ALBATROSS: 'Albatros',
    PETREL: 'Petrel',
    SHAG: 'Cuervo marino',
  },
  birdPowers: {
    PUFFIN: 'Al colocar una barca con red: +1 pescado.',
    SKUA: 'Casilla de clima: mueve una barca colocada a una casilla vacía de su figura, sin recoger.',
    AUK: 'Fin de ronda: +1 punto por cada isla que reclames esa ronda.',
    TERN: 'Al colocar en el puerto: +1 sal.',
    CORMORANT: 'Casilla de barca: +1 perla.',
    GULL: 'Al cumplir un encargo de 4 o más ingredientes: +2 puntos.',
    PELICAN: 'Al recoger con calma: +1 más.',
    HERON: 'Casilla de clima: 2 ingredientes distintos.',
    FLAMINGO: 'Fin de ronda: puedes pagar 1 pescado, 1 sal y 1 algas por 4 puntos.',
    ALBATROSS:
      'Al poner clima en una isla: puedes poner un bajío en otra casilla vacía de esa isla.',
    PETREL: 'Casilla de barca: apalabra 1 encargo.',
    SHAG: 'Al soltar otra ave: +1 punto.',
  },
  /** Las aves con casilla propia y el dado que admite. */
  birdSpaces: {
    SKUA: 'WEATHER',
    CORMORANT: 'BOAT',
    HERON: 'WEATHER',
    PETREL: 'BOAT',
  } as Readonly<Record<string, 'BOAT' | 'WEATHER'>>,

  orders: {
    E01: 'Brújula',
    E02: 'Carta de mareas',
    E03: 'Sextante',
    E04: 'Catalejo',
    E05: 'Astrolabio',
    E06: 'Dados del puerto',
    E07: 'Viento de cola',
    E08: 'Canción de faena',
    E09: 'Fiesta del puerto',
    E10: 'Faena nocturna',
    E11: 'Turno de guardia',
    E12: 'Jornada larga',
    E13: 'Gran pesquería',
    E14: 'Cabo de remolque',
    E15: 'Corriente traidora',
    E16: 'Remolcador',
    E17: 'Marejada',
    E18: 'Deriva',
    E19: 'Cambio de amarre',
    E20: 'Trueque de barcas',
    E21: 'Rumbo cruzado',
    E22: 'Baile de proas',
    E23: 'Nudo marinero',
    E24: 'Ancla echada',
    E25: 'Red enredada',
    E26: 'Puerto cerrado',
    E27: 'Temporal',
    E28: 'Regreso',
    E29: 'Faro encendido',
    E30: 'Bocina del puerto',
    E31: 'La lonja',
    E32: 'Gran regata',
  } as Readonly<Record<string, string>>,
  uses: {
    TURN_DIE: 'Gira un dado de tu reserva a la cara que quieras.',
    REROLL: 'Vuelve a tirar los dados de tu reserva que elijas.',
    DOUBLE_SHIFT: 'Coloca un dado más este turno.',
    TOW: 'Remolca una barca de una isla a una casilla vacía, sin recoger.',
    CROSS: 'Intercambia dos barcas de las islas con la misma cara.',
    MOOR: 'Aparta un dado colocado hasta la ronda siguiente.',
    RETURN_BOAT: 'Devuelve una barca tuya colocada a tu reserva.',
  },

  port: {
    title: 'Puerto',
    HIGH: 'Pleamar',
    LOW: 'Bajamar',
    spaces: {
      ANY_1: 'Cualquier dado',
      ANY_2: 'Cualquier dado',
      CALM: 'Calma',
      STORM: 'Tormenta',
      BREEZE: 'Brisa',
    },
    effects: {
      HIGH: {
        ANY_1: '1 ingrediente a elegir',
        ANY_2: 'Sube un ave a bordo',
        CALM: '+1 pescado y +1 algas',
        STORM: 'Aparta todo el clima de las islas',
        BREEZE: '+1 sal y apalabra 1',
      },
      LOW: {
        ANY_1: '2 del mismo ingrediente',
        ANY_2: 'Cambia hasta 2 ingredientes',
        CALM: 'Sube un ave y 1 ingrediente a elegir',
        STORM: 'Pon hasta 2 bajíos',
        BREEZE: 'Apalabra hasta 2',
      },
    },
    used: 'usada esta ronda',
  },

  round: (round: number, side: string) => `Ronda ${round} · ${side}`,
  islandsLeft: (count: number) =>
    count === 1 ? 'Queda 1 isla en el mazo' : `Quedan ${count} islas en el mazo`,
  ordersLeft: (count: number) =>
    count === 1 ? 'Queda 1 encargo en el mazo' : `Quedan ${count} encargos en el mazo`,
  rowTitle: 'El archipiélago: islas de esta ronda',
  steps: {
    label: 'Tu turno',
    place: 'Coloca un dado',
    orders: 'Si quieres, cumple o usa un encargo',
    end: 'Termina el turno',
  },
  guide: {
    title: 'Cómo se juega',
    lines: [
      'En tu turno, toca uno de tus dados y después una casilla resaltada: una isla, el puerto o un ave tuya con casilla.',
      'Una barca recoge lo que da la casilla de su misma figura (red, ancla o vela). En otra figura se puede forzar pagando, sin recoger.',
      'El clima va en una casilla vacía. La calma recoge dos más, la tormenta puede ir encima de cualquier dado y la brisa, encima de una barca tuya, que vuelve a tu mano.',
      'Con lo recogido, cumple encargos del mercado: dan puntos y se usan una vez. Después, termina el turno.',
      'Al acabar la ronda, cada isla es de quien tiene más barcas arriba de sus pilas. Tras cuatro rondas gana quien tenga más puntos.',
    ],
  },
  tabs: {
    label: 'Zonas del tablero',
    ORDERS: 'Encargos y aves',
    RIVALS: 'Jugadores',
  },
  islandPoints: (points: number) => `${points} puntos`,
  leader: (name: string) => `Domina: ${name}`,
  noLeader: 'Nadie la domina',
  shoal: 'Bajío',
  emptySpace: (figure: string, reward: string) => `${figure}: da ${reward}`,
  space: (island: string, index: number, figure: string, reward: string, top: string | null) =>
    `${island}, casilla ${index}: ${figure}, da ${reward}${top ? `; arriba, ${top}` : '; vacía'}`,
  die: (face: string, kind: string, owner: string) => `${face} (${kind} de ${owner})`,
  market: 'Mercado de encargos',
  emptySlot: 'Hueco vacío',
  order: (name: string, cost: string, points: number) =>
    `${name}: cuesta ${cost}, ${points} puntos`,
  cost: 'Coste',
  points: (points: number) => (points === 1 ? '1 punto' : `${points} puntos`),
  marketHelp:
    'En tu turno, cumple un encargo pagando sus ingredientes: ganas sus puntos y te quedas la carta para usar su efecto una vez.',
  birdPiles: 'Aves de paso',
  birdsHelp:
    'Un ave sube a bordo cuando colocas un dado en una casilla que da «ave» o en el puerto que lo dice. Mientras la llevas, te da su poder.',
  cards: {
    order: 'Encargo',
    bird: 'Ave',
    effect: 'Al usarlo:',
    canPay: 'Te alcanza para cumplirlo.',
    missing: (list: string, pearls: boolean) =>
      `Te falta: ${list}${pearls ? ' (cada perla cubre uno)' : ''}.`,
    emptyPile: 'Montón vacío.',
    pile: (count: number) =>
      count === 1 ? 'Es la última del montón' : `Quedan ${count} en el montón`,
    space: { BOAT: 'Casilla para una barca', WEATHER: 'Casilla para un clima' },
    yours: 'Tus cartas',
    yoursHelp:
      'Tus aves a bordo, los encargos que apalabraste y los cumplidos que aún puedes usar.',
    promised: 'Apalabrado',
    inHand: 'Cumplido, sin usar',
  },

  yourPool: 'Tus dados',
  pool: 'Reserva',
  aside: 'Apartados',
  ingredientsTitle: 'Ingredientes',
  aboard: 'A bordo',
  free: 'Sueltas',
  nests: 'Anidadas',
  hand: 'Encargos cumplidos',
  used: 'Ya usados',
  promised: 'Apalabrados',
  claimed: 'Islas reclamadas',
  score: (total: number) => `${total} puntos`,
  scoreDetail: (score: {
    islands: number;
    orders: number;
    birds: number;
    tokens: number;
    leftovers: number;
  }) =>
    `Islas ${score.islands} · encargos ${score.orders} · aves ${score.birds} · fichas ${score.tokens} · sobrantes ${score.leftovers}`,
  retired: 'se retiró',
  turn: 'juega',
  none: 'Nada',

  status: {
    yourTurn: 'Te toca: elige uno de tus dados y dónde ponerlo.',
    afterPlace: 'Ya colocaste. Puedes cumplir o usar un encargo, o terminar el turno.',
    placeMore: (count: number) =>
      count === 1 ? 'Te queda 1 dado por colocar.' : `Te quedan ${count} dados por colocar.`,
    roundEnd: 'Fin de ronda: quien lleva un Flamenco decide si lo paga.',
    finished: 'La partida terminó.',
    pickTarget: (die: string) => `Elige dónde poner ${die}.`,
  },
  actions: {
    endTurn: 'Terminar turno',
    cancel: 'Cancelar',
    fulfil: 'Cumplir',
    use: 'Usar',
    promise: 'Apalabrar',
    release: 'Soltar',
    board: 'Subir a bordo',
    nest: 'Anidar en',
    force: (what: string) => `Forzar pagando ${what}`,
    forceTitle: 'Esa casilla pide otra figura. Puedes forzar pagando:',
    confirm: 'Confirmar',
    skip: 'No, gracias',
    rollAll: 'Todos',
  },
  pending: {
    BOARD_BIRD: 'Elige qué ave sube a bordo: toca uno de los montones de aves de paso.',
    RELEASE_BIRD: 'Llevas cuatro aves: toca la que sueltas.',
    CHOOSE_INGREDIENTS: {
      ONE: 'Elige un ingrediente.',
      TWO_SAME: 'Elige un ingrediente: te llevas dos.',
      TWO_DISTINCT: 'Elige dos ingredientes distintos.',
    },
    EXCHANGE: (upTo: number) =>
      `Puedes cambiar hasta ${upTo} ingredientes, uno por uno. Elige qué das y qué tomas.`,
    give: 'Das',
    take: 'Tomas',
    SHOAL: (remaining: number) =>
      remaining === 1
        ? 'Puedes poner un bajío: toca una casilla vacía.'
        : `Puedes poner hasta ${remaining} bajíos: toca casillas vacías.`,
    MOVE_BOAT: 'Toca una barca de las islas y después la casilla vacía de su figura a la que va.',
    PROMISE: 'Apalabra un encargo: la carta revelada o una del mercado. Solo tú podrás cumplirlo.',
    revealed: 'Carta revelada',
    waiting: (name: string) => `${name} está decidiendo.`,
  },
  use: {
    TURN_DIE: 'Elige un dado de tu reserva y su nueva cara.',
    REROLL: 'Elige los dados que vuelves a tirar.',
    TOW: 'Toca la barca que remolcas y después una casilla vacía.',
    CROSS: 'Toca dos barcas con la misma cara.',
    MOOR: 'Toca el dado que apartas.',
    RETURN_BOAT: 'Toca una barca tuya colocada.',
  },
  roundEnd: {
    title: 'Flamenco',
    question: (most: number) =>
      most === 1
        ? '¿Pagas 1 pescado, 1 sal y 1 algas por 4 puntos?'
        : `¿Cuántas veces pagas 1 pescado, 1 sal y 1 algas por 4 puntos? Hasta ${most}.`,
    times: (count: number) =>
      count === 0 ? 'Ninguna' : count === 1 ? 'Una vez' : `${count} veces`,
    waiting: 'Esperando a quien lleva un Flamenco.',
  },

  /** El aviso neutro sobre el origen, sin la marca (ADR-023, MA1). */
  credit:
    'Inspirado en un juego de mesa comercial. Si te gusta, apoya a sus autores comprando el original.',
  end: {
    single: (points: number) => `Ganó con ${points} puntos.`,
    shared: (points: number) => `Victoria compartida, con ${points} puntos.`,
  },
  rejections: {
    MALFORMED_ACTION: 'Esa jugada no es válida.',
    DIE_NOT_IN_POOL: 'Ese dado no está en tu reserva.',
    SPACE_OCCUPIED: 'Esa casilla ya está ocupada.',
    SPACE_SHOALED: 'Esa casilla tiene un bajío esta ronda.',
    FACE_MISMATCH: 'La cara del dado no corresponde a esa casilla.',
    CANNOT_FORCE: 'Ahí no se puede forzar con eso.',
    CANNOT_AFFORD: 'No te alcanza para pagarlo.',
    ALREADY_PLACED: 'Ya colocaste un dado en este turno.',
    ALREADY_FULFILLED: 'Ya cumpliste un encargo en este turno.',
    ALREADY_USED: 'Ya usaste un encargo en este turno.',
    MUST_PLACE_FIRST: 'Primero coloca un dado.',
    PENDING_DECISION: 'Primero resuelve lo que tienes pendiente.',
    NO_PENDING_DECISION: 'No hay nada pendiente que resolver.',
    ORDER_NOT_AVAILABLE: 'Ese encargo no está disponible.',
    BAD_TARGET: 'Eso no vale ahí.',
    NEST_NOT_ALLOWED: 'Esa ave no puede anidar en esa isla.',
    PORT_SPACE_USED: 'Esa casilla del puerto ya se usó esta ronda.',
    NOT_YOUR_BIRD: 'Esa ave no va a bordo contigo.',
    BAD_PAYMENT: 'El pago no cubre el coste justo.',
    BAD_CHOICE: 'Esa elección no vale.',
    WRONG_PHASE: 'Ahora no toca eso.',
  },
} as const;
