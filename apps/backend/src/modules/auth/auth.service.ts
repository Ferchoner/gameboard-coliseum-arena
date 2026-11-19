import type {
  ChangePasswordRequest,
  LoginRequest,
  Me,
  RegisterRequest,
  UpdateMeRequest,
} from '@gameboard/contracts';
import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { DatabaseService } from '../../database/database.service.js';
import { type Player, PlayersService } from '../players/players.service.js';
import {
  normalizeDisplayName,
  type Profile,
  ProfilesService,
} from '../profiles/profiles.service.js';
import { type User, UsersService } from '../users/users.service.js';
import { PasswordHasher } from './password-hasher.js';
import { type AuthContext, type IssuedSession, SessionsService } from './sessions.service.js';

export interface SignedIn {
  readonly me: Me;
  readonly session: IssuedSession;
}

function toMe(user: User, profile: Profile, player: Player): Me {
  return {
    userId: user.id,
    playerId: player.id,
    email: user.email,
    username: user.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    biography: profile.biography,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Registro, inicio y cierre de sesión. */
@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly users: UsersService,
    private readonly profiles: ProfilesService,
    private readonly players: PlayersService,
    private readonly sessions: SessionsService,
    private readonly hasher: PasswordHasher,
  ) {}

  /**
   * Crea la cuenta, el perfil y el jugador, e inicia la sesión, todo en una
   * sola transacción (modelo de datos, sección 6; API, decisión A6).
   */
  async register(input: RegisterRequest): Promise<SignedIn> {
    // Antes que nada, para no calcular el hash de una petición que no vale.
    const displayName = normalizeDisplayName(input.displayName ?? input.username);
    await this.users.assertAvailable(input.email, input.username);
    // El hash es lento a propósito, así que se calcula fuera de la transacción.
    const passwordHash = await this.hasher.hash(input.password);

    return this.database.transaction(async (tx) => {
      const user = await this.users.create(
        { email: input.email, username: input.username, passwordHash },
        tx,
      );
      const profile = await this.profiles.create(
        { userId: user.id, displayName },
        tx,
      );
      const player = await this.players.createForUser(user.id, tx);
      const session = await this.sessions.create(user.id, tx);
      return { me: toMe(user, profile, player), session };
    });
  }

  /**
   * Inicia sesión con el nombre de usuario y la contraseña (API, decisión
   * A7). No dice cuál de los dos falló. Que la cuenta esté suspendida solo
   * se dice a quien acertó la contraseña.
   */
  async login(input: LoginRequest): Promise<SignedIn> {
    const user = await this.users.findByUsername(input.username);
    const passwordMatches = user
      ? await this.hasher.verify(user.passwordHash, input.password)
      : await this.hasher.verifyAgainstNothing(input.password);

    if (!user || !passwordMatches) {
      throw new AppError('INVALID_CREDENTIALS', 'The username or the password is not correct');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError('ACCOUNT_SUSPENDED', 'The account is suspended');
    }

    if (this.hasher.needsRehash(user.passwordHash)) {
      await this.users.updatePasswordHash(user.id, await this.hasher.hash(input.password));
    }

    const me = await this.loadMe(user);
    const session = await this.sessions.create(user.id);
    return { me, session };
  }

  /** Cierra la sesión en el servidor. Si no había sesión, no hace nada. */
  async logout(token: string | null): Promise<void> {
    await this.sessions.revoke(token);
  }

  /** La cuenta, el perfil y el jugador de quien ha iniciado sesión. */
  async getMe(userId: string): Promise<Me> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppError('UNAUTHENTICATED', 'There is no valid session');
    return this.loadMe(user);
  }

  /**
   * Cambia el nombre visible o la biografía de la cuenta propia. Solo
   * cambia lo que llega (API, `PATCH /me`).
   */
  async updateMe(userId: string, changes: UpdateMeRequest): Promise<Me> {
    // El contrato pide al menos un campo (`minProperties: 1`).
    if (changes.displayName === undefined && changes.biography === undefined) {
      throw new AppError('VALIDATION_ERROR', 'The request body is not valid', {
        fields: [{ field: 'body', rule: 'REQUIRED' }],
      });
    }
    await this.profiles.update(userId, changes);
    return this.getMe(userId);
  }

  /**
   * Cambia la contraseña de la cuenta propia. Cierra las demás sesiones de
   * la cuenta y sus conexiones; la actual sigue abierta (API,
   * `PUT /me/password`).
   */
  async changePassword(auth: AuthContext, input: ChangePasswordRequest): Promise<void> {
    const user = await this.users.findById(auth.userId);
    if (!user) throw new AppError('UNAUTHENTICATED', 'There is no valid session');
    if (!(await this.hasher.verify(user.passwordHash, input.currentPassword))) {
      throw new AppError('INVALID_CURRENT_PASSWORD', 'The current password is not correct');
    }
    const passwordHash = await this.hasher.hash(input.newPassword);

    await this.database.transaction(async (tx) => {
      await this.users.lock(user.id, tx);
      await this.users.updatePasswordHash(user.id, passwordHash, tx);
      await this.sessions.endAllOf(user.id, tx, auth.sessionId);
    });
  }

  private async loadMe(user: User): Promise<Me> {
    const [profile, player] = await Promise.all([
      this.profiles.findByUserId(user.id),
      this.players.findByUserId(user.id),
    ]);
    if (!profile || !player) {
      throw new Error(`La cuenta ${user.id} no tiene perfil o jugador`);
    }
    return toMe(user, profile, player);
  }
}
