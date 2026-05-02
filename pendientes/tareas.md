# Tarea pendientes

## [Tarea] Bloquear unión de participantes después de iniciar juego

**Problema**: Cualquier player puede unirse mientras el juego está en curso (estado `active`).

**Solución**: 
1. Agregar validación en servidor
2. Mensaje de error friendly

**Implementación**:

1. **Server** - `server/gameManager.js`, función `addPlayer()`:
   ```javascript
   if (room.status !== 'waiting') {
     return { success: false, message: 'El juego ya ha comenzado. Espera al próximo round!' };
   }
   ```

2. **Client Player** - Verificar que el mensaje se muestra correctamente cuando `success: false`. Ya debería funcionar con el flujo actual, pero verificar en `client/player/` el manejo de respuesta a `JOIN_GAME`.

**Archivos a modificar**:
- `server/gameManager.js`

**Sin cambios requeridos en clientes** - el servidor retornará el mensaje y el cliente player ya lo muestra.