import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE = 'gameboard:raw-response';

/**
 * Marca una operación que responde sin el sobre `{ success, data }`. Solo
 * para operaciones de servicio que no forman parte de la API para clientes,
 * como la comprobación de salud.
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);
