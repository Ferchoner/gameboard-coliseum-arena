/**
 * Mareas: el catálogo (ADR-023, MA4; anexo del catálogo, versión 0.2).
 *
 * Todo es diseño propio: ninguna carta copia otra del juego en que se
 * inspira. Los valores son iniciales y se ajustan con la simulación
 * (`simulation.ts`).
 */
import type {
  TidesBirdCard,
  TidesBirdKind,
  TidesIslandCard,
  TidesOrderCard,
  TidesOrderUse,
  TidesSeason,
} from './types.js';

export const SEASONS: readonly TidesSeason[] = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'];

/** Las 20 islas. `minPlayers` es la marca: 12 entran con 2, 16 con 3 y las 20 con 4. */
export const ISLANDS: readonly TidesIslandCard[] = [
  // Roca Gris
  {
    id: 'I01',
    seasons: ['SPRING'],
    minPlayers: 2,
    points: 4,
    spaces: [
      { figure: 'NET', reward: 'FISH' },
      { figure: 'ANCHOR', reward: 'SALT' },
      { figure: 'SAIL', reward: 'BIRD' },
    ],
  },
  // Cala Honda
  {
    id: 'I02',
    seasons: ['SPRING'],
    minPlayers: 2,
    points: 5,
    spaces: [
      { figure: 'NET', reward: 'FISH' },
      { figure: 'NET', reward: 'FISH' },
      { figure: 'ANCHOR', reward: 'ALGAE' },
      { figure: 'SAIL', reward: 'SALT' },
    ],
  },
  // Isla del Faro
  {
    id: 'I03',
    seasons: ['SUMMER'],
    minPlayers: 2,
    points: 4,
    spaces: [
      { figure: 'NET', reward: 'SALT' },
      { figure: 'SAIL', reward: 'BIRD' },
      { figure: 'ANCHOR', reward: 'FISH' },
    ],
  },
  // El Arenal
  {
    id: 'I04',
    seasons: ['SUMMER'],
    minPlayers: 2,
    points: 5,
    spaces: [
      { figure: 'ANCHOR', reward: 'SALT' },
      { figure: 'ANCHOR', reward: 'SALT' },
      { figure: 'NET', reward: 'ALGAE' },
      { figure: 'SAIL', reward: 'BIRD' },
    ],
  },
  // Los Cangrejos
  {
    id: 'I05',
    seasons: ['SUMMER'],
    minPlayers: 2,
    points: 7,
    spaces: [
      { figure: 'NET', reward: 'ALGAE' },
      { figure: 'ANCHOR', reward: 'FISH' },
      { figure: 'SAIL', reward: 'ALGAE' },
      { figure: 'NET', reward: 'SALT' },
      { figure: 'ANCHOR', reward: 'BIRD' },
    ],
  },
  // Punta Brava
  {
    id: 'I06',
    seasons: ['AUTUMN'],
    minPlayers: 2,
    points: 4,
    spaces: [
      { figure: 'ANCHOR', reward: 'ALGAE' },
      { figure: 'NET', reward: 'BIRD' },
      { figure: 'SAIL', reward: 'FISH' },
    ],
  },
  // Las Salinas
  {
    id: 'I07',
    seasons: ['AUTUMN'],
    minPlayers: 2,
    points: 5,
    spaces: [
      { figure: 'SAIL', reward: 'SALT' },
      { figure: 'ANCHOR', reward: 'SALT' },
      { figure: 'NET', reward: 'SALT' },
      { figure: 'SAIL', reward: 'ALGAE' },
    ],
  },
  // Isla Verde
  {
    id: 'I08',
    seasons: ['WINTER'],
    minPlayers: 2,
    points: 3,
    spaces: [
      { figure: 'NET', reward: 'ALGAE' },
      { figure: 'ANCHOR', reward: 'ALGAE' },
      { figure: 'SAIL', reward: 'BIRD' },
    ],
  },
  // Bahía Quieta
  {
    id: 'I09',
    seasons: ['WINTER'],
    minPlayers: 2,
    points: 5,
    spaces: [
      { figure: 'NET', reward: 'FISH' },
      { figure: 'SAIL', reward: 'ALGAE' },
      { figure: 'ANCHOR', reward: 'SALT' },
      { figure: 'NET', reward: 'BIRD' },
    ],
  },
  // Peñón Alto
  {
    id: 'I10',
    seasons: ['WINTER'],
    minPlayers: 2,
    points: 5,
    spaces: [
      { figure: 'SAIL', reward: 'FISH' },
      { figure: 'SAIL', reward: 'SALT' },
      { figure: 'ANCHOR', reward: 'ALGAE' },
      { figure: 'ANCHOR', reward: 'BIRD' },
    ],
  },
  // Dos Vientos
  {
    id: 'I11',
    seasons: ['SPRING', 'SUMMER'],
    minPlayers: 2,
    points: 4,
    spaces: [
      { figure: 'NET', reward: 'SALT' },
      { figure: 'ANCHOR', reward: 'FISH' },
      { figure: 'SAIL', reward: 'ALGAE' },
      { figure: 'SAIL', reward: 'FISH' },
    ],
  },
  // Las Gemelas
  {
    id: 'I12',
    seasons: ['AUTUMN', 'WINTER'],
    minPlayers: 2,
    points: 4,
    spaces: [
      { figure: 'ANCHOR', reward: 'FISH' },
      { figure: 'NET', reward: 'ALGAE' },
      { figure: 'SAIL', reward: 'SALT' },
      { figure: 'ANCHOR', reward: 'BIRD' },
    ],
  },
  // Isla Larga
  {
    id: 'I13',
    seasons: ['SPRING'],
    minPlayers: 3,
    points: 7,
    spaces: [
      { figure: 'NET', reward: 'ALGAE' },
      { figure: 'ANCHOR', reward: 'SALT' },
      { figure: 'SAIL', reward: 'FISH' },
      { figure: 'NET', reward: 'FISH' },
      { figure: 'SAIL', reward: 'BIRD' },
    ],
  },
  // Morro Negro
  {
    id: 'I14',
    seasons: ['SUMMER'],
    minPlayers: 3,
    points: 5,
    spaces: [
      { figure: 'ANCHOR', reward: 'ALGAE' },
      { figure: 'NET', reward: 'FISH' },
      { figure: 'NET', reward: 'BIRD' },
      { figure: 'SAIL', reward: 'SALT' },
    ],
  },
  // Playa Blanca
  {
    id: 'I15',
    seasons: ['AUTUMN'],
    minPlayers: 3,
    points: 7,
    spaces: [
      { figure: 'SAIL', reward: 'SALT' },
      { figure: 'NET', reward: 'SALT' },
      { figure: 'ANCHOR', reward: 'FISH' },
      { figure: 'SAIL', reward: 'ALGAE' },
      { figure: 'NET', reward: 'BIRD' },
    ],
  },
  // Arrecife Rojo
  {
    id: 'I16',
    seasons: ['WINTER'],
    minPlayers: 3,
    points: 4,
    spaces: [
      { figure: 'NET', reward: 'ALGAE' },
      { figure: 'ANCHOR', reward: 'FISH' },
      { figure: 'SAIL', reward: 'SALT' },
    ],
  },
  // Isla Ballena
  {
    id: 'I17',
    seasons: ['SPRING'],
    minPlayers: 4,
    points: 8,
    spaces: [
      { figure: 'ANCHOR', reward: 'FISH' },
      { figure: 'ANCHOR', reward: 'FISH' },
      { figure: 'NET', reward: 'ALGAE' },
      { figure: 'SAIL', reward: 'SALT' },
      { figure: 'NET', reward: 'BIRD' },
    ],
  },
  // Cayo del Sur
  {
    id: 'I18',
    seasons: ['AUTUMN'],
    minPlayers: 4,
    points: 5,
    spaces: [
      { figure: 'NET', reward: 'ALGAE' },
      { figure: 'ANCHOR', reward: 'ALGAE' },
      { figure: 'SAIL', reward: 'FISH' },
      { figure: 'SAIL', reward: 'BIRD' },
    ],
  },
  // La Encrucijada
  {
    id: 'I19',
    seasons: ['SPRING', 'WINTER'],
    minPlayers: 4,
    points: 4,
    spaces: [
      { figure: 'SAIL', reward: 'FISH' },
      { figure: 'NET', reward: 'SALT' },
      { figure: 'ANCHOR', reward: 'ALGAE' },
      { figure: 'NET', reward: 'BIRD' },
    ],
  },
  // Cabo Mayor
  {
    id: 'I20',
    seasons: ['AUTUMN', 'SUMMER'],
    minPlayers: 4,
    points: 6,
    spaces: [
      { figure: 'NET', reward: 'FISH' },
      { figure: 'SAIL', reward: 'SALT' },
      { figure: 'ANCHOR', reward: 'ALGAE' },
      { figure: 'ANCHOR', reward: 'SALT' },
      { figure: 'SAIL', reward: 'BIRD' },
    ],
  },
];

/** Las doce aves: tres por estación, una de cada tipo (anexo, sección 5). */
export const BIRD_SEASONS: Readonly<Record<TidesBirdKind, TidesSeason>> = {
  PUFFIN: 'SPRING',
  SKUA: 'SPRING',
  AUK: 'SPRING',
  TERN: 'SUMMER',
  CORMORANT: 'SUMMER',
  GULL: 'SUMMER',
  PELICAN: 'AUTUMN',
  HERON: 'AUTUMN',
  FLAMINGO: 'AUTUMN',
  ALBATROSS: 'WINTER',
  PETREL: 'WINTER',
  SHAG: 'WINTER',
};

/** Las aves con casilla propia, y qué dado admite: barca o clima. */
export const BIRD_SPACES: Readonly<Partial<Record<TidesBirdKind, 'BOAT' | 'WEATHER'>>> = {
  SKUA: 'WEATHER',
  CORMORANT: 'BOAT',
  HERON: 'WEATHER',
  PETREL: 'BOAT',
};

const BIRD_KINDS = Object.keys(BIRD_SEASONS) as TidesBirdKind[];

/** Las 36 cartas de ave: tres copias de cada tipo, de `B01` a `B36`. */
export const BIRDS: readonly TidesBirdCard[] = BIRD_KINDS.flatMap((kind, index) =>
  [0, 1, 2].map((copy) => ({
    id: `B${String(index * 3 + copy + 1).padStart(2, '0')}`,
    kind,
    season: BIRD_SEASONS[kind],
  })),
);

function order(id: string, cost: string, points: number, use: TidesOrderUse): TidesOrderCard {
  const count = (letter: string) => [...cost].filter((one) => one === letter).length;
  return { id, cost: { FISH: count('P'), SALT: count('S'), ALGAE: count('G') }, points, use };
}

/** Los 32 encargos (anexo, sección 6). En el coste, P es pescado, S sal y G algas. */
export const ORDERS: readonly TidesOrderCard[] = [
  order('E01', 'PS', 2, 'TURN_DIE'), // Brújula
  order('E02', 'SG', 2, 'TURN_DIE'), // Carta de mareas
  order('E03', 'PPS', 4, 'TURN_DIE'), // Sextante
  order('E04', 'GGS', 4, 'TURN_DIE'), // Catalejo
  order('E05', 'PSGG', 6, 'TURN_DIE'), // Astrolabio
  order('E06', 'PG', 2, 'REROLL'), // Dados del puerto
  order('E07', 'SSG', 4, 'REROLL'), // Viento de cola
  order('E08', 'PPG', 4, 'REROLL'), // Canción de faena
  order('E09', 'PSSG', 5, 'REROLL'), // Fiesta del puerto
  order('E10', 'PSG', 3, 'DOUBLE_SHIFT'), // Faena nocturna
  order('E11', 'PPSS', 4, 'DOUBLE_SHIFT'), // Turno de guardia
  order('E12', 'PGGG', 4, 'DOUBLE_SHIFT'), // Jornada larga
  order('E13', 'PPSGG', 6, 'DOUBLE_SHIFT'), // Gran pesquería
  order('E14', 'PS', 1, 'TOW'), // Cabo de remolque
  order('E15', 'GG', 1, 'TOW'), // Corriente traidora
  order('E16', 'PSS', 3, 'TOW'), // Remolcador
  order('E17', 'PGG', 3, 'TOW'), // Marejada
  order('E18', 'PSSG', 4, 'TOW'), // Deriva
  order('E19', 'SG', 2, 'CROSS'), // Cambio de amarre
  order('E20', 'PP', 2, 'CROSS'), // Trueque de barcas
  order('E21', 'SGG', 4, 'CROSS'), // Rumbo cruzado
  order('E22', 'PSSG', 5, 'CROSS'), // Baile de proas
  order('E23', 'PS', 1, 'MOOR'), // Nudo marinero
  order('E24', 'SS', 1, 'MOOR'), // Ancla echada
  order('E25', 'PPG', 3, 'MOOR'), // Red enredada
  order('E26', 'PSGG', 4, 'MOOR'), // Puerto cerrado
  order('E27', 'PPSSG', 5, 'MOOR'), // Temporal
  order('E28', 'PG', 2, 'RETURN_BOAT'), // Regreso
  order('E29', 'SSG', 4, 'RETURN_BOAT'), // Faro encendido
  order('E30', 'PGG', 4, 'RETURN_BOAT'), // Bocina del puerto
  order('E31', 'PPSG', 5, 'RETURN_BOAT'), // La lonja
  order('E32', 'PSSGG', 7, 'RETURN_BOAT'), // Gran regata
];
