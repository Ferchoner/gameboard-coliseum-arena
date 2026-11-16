import { Injectable, type OnApplicationBootstrap, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';

interface RouteEntry {
  readonly pattern: RegExp;
  readonly method: string;
}

function normalize(path: string): string {
  const joined = `/${path}`.replace(/\/+/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function toPattern(path: string): RegExp {
  const source = normalize(path)
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  return new RegExp(`^${source}/?$`);
}

/**
 * Las rutas que el servidor tiene registradas. Sirve para distinguir una
 * ruta que no existe (`ROUTE_NOT_FOUND`) de una que existe pero no admite
 * el método pedido (`METHOD_NOT_ALLOWED`), cosa que el enrutador no hace
 * por sí solo.
 */
@Injectable()
export class RouteTable implements OnApplicationBootstrap {
  private routes: RouteEntry[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  onApplicationBootstrap(): void {
    const routes: RouteEntry[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const instance = wrapper.instance as object | undefined;
      if (!instance || !wrapper.metatype) continue;
      const prefix = Reflect.getMetadata(PATH_METADATA, wrapper.metatype) as string | undefined;
      const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;

      for (const name of this.scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name] as object;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const path = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
        routes.push({
          pattern: toPattern(`${prefix ?? ''}/${path}`),
          method: RequestMethod[method],
        });
      }
    }
    this.routes = routes;
  }

  /** Métodos que admite una ruta. Vacía si la ruta no existe. */
  allowedMethods(path: string): string[] {
    const methods = new Set<string>();
    for (const route of this.routes) {
      if (!route.pattern.test(path)) continue;
      methods.add(route.method);
      if (route.method === 'GET') methods.add('HEAD');
    }
    return [...methods].sort();
  }
}
