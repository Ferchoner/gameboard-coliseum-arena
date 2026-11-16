import { Injectable } from '@nestjs/common';

/** La hora del servidor. Se inyecta para poder fijarla en las pruebas. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
