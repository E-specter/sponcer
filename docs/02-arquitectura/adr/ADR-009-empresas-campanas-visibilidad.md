---
responsable: Eduard
estado: aprobado
ultima_actualizacion: 2026-11-27
---

# ADR-009: Empresas, campañas, visibilidad y registro completo (F7)

## Contexto

En la presentación de v1.3.0 el equipo recibió cinco observaciones:

1. El producto habla de "marcas" como si fueran usuarios. Debe hablar de **Empresas** (persona natural o jurídica) que administran una o más marcas, cada una con sus propios matches, cotizaciones y enfoque.
2. El flujo de cotización debe completarse con **campañas** (por temporada, general, por segmento, etc.).
3. Una cotización se puede enviar **sin match**.
4. Hace falta un módulo de **Visibilidad**, al estilo de LinkedIn, que muestre quién está interesado en tu perfil aunque no haya match.
5. Hace falta un **registro completo** para empresas y para influencers.

Hoy una misma cuenta puede tener perfiles de marca y de creador mezclados, la cotización se pide sobre un servicio del catálogo del creador y no existe un registro guiado.

## Decisiones (aprobadas por Eduard el 2026-11-27)

1. **Tipo de cuenta exclusivo.** Al registrarse, el usuario elige entre dos tipos:
   - **Empresa:** tabla `companies`. Persona natural (DNI de 8 dígitos) o persona jurídica (RUC de 11 dígitos con dígito verificador válido). Guarda razón social o nombre, nombre comercial y ciudad. Administra una o más **marcas**, que son los perfiles `brand` ahora ligados a `company_id`.
   - **Influencer:** administra una o más cuentas de Instagram (perfiles `creator`).

   El tipo no se puede cambiar desde la app. Los perfiles, matches, cotizaciones y campañas siguen siendo **por perfil (marca)**: el selector de perfil activo se mantiene.
2. **Registro completo** (onboarding tras el primer enlace mágico): tipo de cuenta, datos de la empresa o del influencer, aceptación de términos y de la política de privacidad, y luego el primer perfil:
   - la empresa crea su primera marca;
   - el influencer reclama su cuenta de Instagram con el código en la bio (ADR-002).

   El consentimiento se guarda con su fecha y la versión del texto (Ley 29733). La validación del RUC y del DNI es de formato y dígito verificador, sin consultar a SUNAT ni a RENIEC.
3. **Campañas.** Una marca crea campañas con estos datos:
   - nombre;
   - tipo: `temporada`, `general`, `segmento` u `otro`;
   - fechas, presupuesto en PEN, nichos y ciudades objetivo;
   - estado: `borrador`, `activa` o `cerrada`.

   Toda cotización nueva que envía una marca pertenece a una campaña. Desde una campaña se puede cotizar a **varios influencers a la vez**: se crea una cotización por influencer, con un servicio de su catálogo o como propuesta abierta sin servicio. El panel muestra el avance por campaña: cotizaciones por estado y monto comprometido.
4. **Cotizar sin match.** Crear una cotización ya no exige match ni ninguna interacción previa. El límite anti-abuso es por marca y por hora. La negociación ocurre en el historial de la cotización. El chat sigue requiriendo match.
5. **Visibilidad.** Para cada perfil muestra dos listas, con contadores de 7 y 30 días:
   - **intereses recibidos sin match** (los "me interesa" que todavía no son recíprocos);
   - **visitas**: quién vio tu ficha.

   Solo se registran visitas de usuarios autenticados con un perfil activo del **tipo opuesto**, una por visitante y perfil por día. No se registran visitas a fichas previas sin dueño ni de administradores. Desde la lista se puede ver la ficha, devolver el interés o cotizar. La política de privacidad lo informa. El modo "visita anónima" queda fuera de F7.
6. **Migración de datos de demo.** Las cuentas demo que hoy mezclan marca y creador se reparten en cuentas Empresa y cuentas Influencer. El botón de acceso demo ofrece una de cada tipo.

## Consecuencias

- Hay cambios incompatibles en el contrato: el registro, el alta de marca con `companyId`, y `CreateQuoteRequest` (con `campaignId`, `creatorProfileId` y `serviceId` opcional). La versión pasa a v1.4.0.
- Hay nuevas tablas con RLS: `companies`, `campaigns`, `profile_views` y `consents`.
- Las cotizaciones antiguas sin campaña se migran a una campaña "General" por marca.
- Registrar visitas guarda datos de navegación entre usuarios autenticados. Se limita a lo mínimo (quién, a quién y día) y se borra con la cuenta.
