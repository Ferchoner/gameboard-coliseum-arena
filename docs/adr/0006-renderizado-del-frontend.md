# ADR-006: Frontend renderizado en el navegador, con páginas públicas pregeneradas

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Parte del vacío G-09 de la auditoría (modo de renderizado del frontend) |
| **Depende de** | Acuerdo B9 (Nuxt, Vue y TypeScript; ver ADR-007) |
| **Relacionados** | ADR-004 (autenticación), ADR-005 (organización del repositorio), ADR-008 (alcance del MVP) |

## 1. Contexto

- El frontend se construye con Nuxt, Vue y TypeScript (acuerdo B9).
- Frontend y backend se alojan por separado, en subdominios de un mismo dominio propio (ADR-004).
- La aplicación debe poder instalarse como PWA (ADR-008).
- El lobby y el tablero son contenido personal y en tiempo real, que no necesita indexarse en buscadores.

## 2. Decisión

El frontend es una **aplicación renderizada en el navegador**. Las páginas públicas (portada, catálogo, reglas) se **pregeneran** al construir. No hay servidor de frontend en ejecución: el resultado son archivos estáticos.

## 3. Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Renderizado en servidor | Añade un segundo servidor que mantener. Si renderiza páginas con sesión, la cookie debe compartirse entre subdominios, lo que amplía su alcance |

## 4. Consecuencias

**Positivas**
- Se aloja como archivos estáticos en cualquier servicio.
- La cookie de sesión puede quedar ligada solo al host de la API, que es el alcance más restringido (propuesta pendiente de confirmación en ADR-004). *Confirmada el 2026-11-16 (ADR-012, S13).*
- Encaja de forma natural con una PWA.

**Negativas**
- Las páginas con contenido dinámico no se indexan igual de bien en buscadores. Las públicas pregeneradas sí.

**Coste de reversión:** bajo. Nuxt permite fijar el modo de renderizado por ruta, así que una ruta concreta puede pasar a renderizarse en servidor sin rehacer la aplicación.

## 5. Datos verificados

Verificado el 2026-11-14 en el registro de npm: la versión actual de Nuxt es la 4.6.4 y admite Node.js 26, la versión elegida para el backend (ADR-001).

## 6. Referencias

- `docs/auditoria/despliegue-y-requisitos.md`, subdecisión 5c.
