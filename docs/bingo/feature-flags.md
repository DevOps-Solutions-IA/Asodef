# Feature flags Bingo

## Contrato backend

Bingo se despliega apagado. Ninguna variable habilita una superficie por sí
sola: `BINGO_ENABLED=true` es un prerrequisito y cada superficie exige además
su flag específico.

| Variable | Superficie | Valor por defecto |
| --- | --- | --- |
| `BINGO_ENABLED` | Módulo maestro | `false` |
| `BINGO_ADMIN_ENABLED` | API administrativa | `false` |
| `BINGO_AFFILIATE_ENABLED` | API autenticada de afiliado | `false` |
| `BINGO_PUBLIC_ENABLED` | API pública | `false` |
| `BINGO_REALTIME_ENABLED` | Publicación/consumo realtime futuro | `false` |

La validación de entorno rechaza un flag de superficie activo cuando el flag
maestro está apagado. Los valores aceptados son únicamente las cadenas
`true` y `false`.

## Comportamiento fail-closed

`RequireBingoSurface` instala el guard y declara la superficie de cada
controller. El guard responde `404` con el código estable
`BINGO_FEATURE_DISABLED` cuando:

- falta metadata de superficie;
- el flag maestro falta o no es `true`;
- el flag de la superficie falta o no es `true`;
- una ruta requiere varias superficies y cualquiera está apagada.

Realtime deberá declarar tanto su audiencia como `realtime`, por ejemplo
`RequireBingoSurfaces("public", "realtime")`. Así, el transporte no puede
eludir el flag público, autenticado o administrativo de la audiencia.

Los flags no sustituyen RBAC, sesión, CSRF ni elegibilidad. Son una capa de
aislamiento operacional adicional. Habilitar una superficie no concede
permisos y deshabilitarla no modifica ni elimina evidencia persistida.

Los workers o publishers sin `ExecutionContext` deben importar
`BingoFeatureFlagsModule`, inyectar `BingoFeatureFlagsService` y no iniciar
timers, suscripciones ni consumo de outbox cuando
`isEnabled("realtime") === false`. El servicio aplica también el flag maestro;
no se debe leer `process.env` directamente ni degradar a un valor permisivo.

## Activación y rollback

La secuencia segura es activar el maestro y luego una superficie a la vez,
manteniendo las demás apagadas. El rollback inmediato consiste en apagar la
superficie afectada; apagar el maestro bloquea todas las superficies Bingo.
Los cambios de configuración requieren el mecanismo normal de reinicio o
rollout de la API; no existe mutación remota de flags en esta etapa.
