/** Un correo listo para enviar. Solo texto: el MVP no envía correos con formato. */
export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Cómo envía correo el servidor (ADR-017, U6). Quien envía no sabe si el
 * correo es real o simulado: el servicio real, que llega con el
 * alojamiento, será otra implementación de esta misma clase.
 */
export abstract class Mailer {
  abstract send(mail: OutgoingMail): Promise<void>;
}
