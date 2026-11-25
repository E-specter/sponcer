---
responsable: leader
estado: aprobado
ultima_actualizacion: 2026-11-25
---

# ADR-002 — Verificación de propiedad de la cuenta de Instagram

## Contexto

- RF-02 exige demostrar que una cuenta de IG pertenece al usuario antes de vincularla.
- *Instagram Login* (OAuth, la opción preferente del prompt) requiere una app de Meta, que el equipo no puede crear (ADR-001).
- Además, el login de la plataforma es un enlace mágico de Supabase Auth (RF-03, opción b), independiente de Instagram.

## Opciones

| Opción | Viable | Nota |
|---|---|---|
| OAuth con Instagram Login | No | Requiere app de Meta |
| **Código temporal en la bio validado por la ingesta** | **Sí** | Usa el mismo adaptador `InstagramSource` (ADR-001) |
| Código por DM a una cuenta de Sponcer | No | Requiere leer DMs: otra vez API de Meta o automatización frágil |

## Decisión

Código temporal en la bio:

1. El usuario autenticado indica su `@handle`. `auth.StartProfileClaim` genera `sponcer-XXXXXX` (6 caracteres alfanuméricos sin ambiguos, vigencia de **30 min**) y lo guarda en `profile_claims` (usuario, handle, código hasheado, expiración, intentos).
2. El usuario pega el código en su bio y pulsa "Verificar".
3. `auth.ConfirmProfileClaim` llama a `ingestion.FetchLiveBio(handle)`, una lectura en vivo que no usa caché.
4. Si la bio contiene el código vigente:
   - se emite `ProfileVerified`;
   - `profiles` asigna `owner_user_id`. Si existía una ficha previa (RF-01), se reclama esa misma ficha y no se duplica;
   - se invalida el código.
5. Límite: **5 intentos por hora y usuario** (cada intento cuesta ~USD 0,0026). Si el perfil ya tiene dueño, se rechaza y se ofrece un reporte de disputa manual.
6. Tras verificar, se avisa al usuario que ya puede quitar el código de la bio.

En `ADAPTER_INGESTION=mock`, `FetchLiveBio` devuelve la bio semilla con el código pendiente añadido, para poder probar el flujo E2E sin Apify.

## Consecuencias

- (+) Funciona sin Meta y reutiliza la ingesta.
- (−) Hay un paso manual para el usuario (editar la bio). Se mitiga con instrucciones claras y un botón para copiar.
- (−) Prueba control de la cuenta en ese momento, no titularidad legal. Es suficiente para el MVP.
- Cuando exista app de Meta, OAuth entra como otra estrategia de verificación detrás del mismo caso de uso.
