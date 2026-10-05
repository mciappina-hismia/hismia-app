# Arquitectura conceptual de Hismia

Este documento explica vocabulario y responsabilidades, no define topología, módulos, API ni estado de implementación. El alcance y las autorizaciones pertenecen a [README.md](../README.md); las herramientas se describen en [TECNOLOGIAS.md](../TECNOLOGIAS/TECNOLOGIAS.md).

## Vocabulario de autorización (alineado con RFC 9700 y OWASP API Top 10 2023)

Para evitar que las decisiones de acceso dependan del sabor del momento, todo el modelo de autorización se expresa con un vocabulario cerrado. Cada operación clínica se evalúa con la misma forma.

- **Sujeto (`subject`).** Persona o cuenta que solicita la operación. Se identifica por el `sub` verificado del JWT y se ata al recurso por RLS.
- **Recurso (`resource`).** Objeto del sistema al que se accede: perfil propio, historia clínica, nota, archivo PDF, grant. Cada recurso tiene un dueño y un tipo.
- **Acción (`action`).** Operación sobre el recurso: `read`, `write`, `append`, `revoke`, `delete`. Es atómica y no se infiere del verbo HTTP sin la confirmación del caso de uso.
- **Grant (`grant`).** Autorización emitida por el paciente a un profesional específico para un alcance de su historia durante una ventana temporal. Mientras esté activo, no se reutiliza para otro profesional ni para otro alcance.
- **Vigencia y alcance (`scope`).** Ventana temporal y perímetro del recurso cubierto por el grant. Por defecto: una hora, revocable, sobre un único paciente y un subconjunto declarado de acciones.
- **Evaluación (`policy evaluation`).** Decisión binaria resultado de combinar sujeto, recurso, acción, grant activo y reglas del caso de uso. Se evalúa **en cada request**, contra el objeto y la propiedad solicitada, no contra el rol declarado.

La autorización nunca se delega al frontend: el backend verifica la firma del JWT contra el JWKS público de Supabase y, sobre esa identidad verificada, ejecuta la `policy evaluation`. Un token válido **no** autoriza por sí solo; el backend aplica las suyas propias sobre paciente, recurso, acción, vigencia del grant y autoría.

**Reglas formales, no inferidas:**
- Una cuenta confirmada con email verificado **no es** un grant profesional ni un rol administrativo.
- El tipo elegido durante el alta es **preferencia de onboarding**, no autoridad. La autoridad la da la `policy evaluation` por objeto y acción.
- Una `role` o `claim` del token que no esté validada contra el recurso solicitado **no** eleva privilegios (anti-BOLA/BFLA, OWASP API1/API5:2023).
- Una respuesta exitosa debe entregarse con campos allowlistados (anti-BOPLA, OWASP API3:2023); nunca se devuelven campos sensibles del recurso a menos que el caso de uso los autorice explícitamente.

## Modelar las reglas: DDD

DDD orienta el modelo alrededor de reglas del negocio y su lenguaje: una solicitud profesional no es un permiso; la aceptación del paciente inicia un grant individual de una hora revocable, y su vigencia y alcance se comprueban para cada operación. La autoría de una nota determina quién puede editarla; conservar versiones no equivale a permitir editar notas ajenas. Modelar estos conceptos evita confundir autenticación, rol y autorización sobre la historia de un paciente. No presupone una división física del sistema.

## Separar responsabilidades: arquitectura hexagonal y SRP

La arquitectura hexagonal distingue reglas de negocio de mecanismos de entrada y salida mediante límites y puertos conceptuales: una entrada solicita una operación y una salida consulta o persiste los datos necesarios. Los adaptadores conectan esos límites con transporte, interfaz y persistencia. Esto no prescribe carpetas, tecnologías concretas ni servicios separados.

SRP significa que cada responsabilidad tiene una razón coherente para cambiar, no que cada clase deba tener un único método. Una modificación del transporte HTTP no debería redefinir cuándo comienza el permiso; una modificación de presentación no debería decidir quién puede leer un PDF.

## Un flujo para reconocer los límites

1. **UI:** muestra al profesional cómo solicitar acceso y al paciente cómo aceptarlo o rechazarlo. No concede permisos por ocultar o mostrar botones.
2. **Controller:** recibe la solicitud, valida su forma y traslada la operación al caso de uso; no interpreta por sí solo la aceptación como una autorización general.
3. **Caso de uso o servicio:** aplica las reglas de solicitud, aceptación, vigencia, revocación y alcance pertinentes; para consultar o escribir comprueba el paciente, profesional, recurso y operación involucrados.
4. **Repositorio:** obtiene y persiste información requerida por esas reglas sin decidir por cuenta propia quién está autorizado. Una operación de persistencia no sustituye las comprobaciones de acceso.
5. **Guard:** puede comprobar identidad y restricciones generales en el límite de entrada; por sí solo no basta para autorizar un recurso específico, un grant aún vigente o la autoría de una nota. La validación efectiva debe cubrir también descargas y cargas, incluidas las comprobaciones al iniciar y finalizar una carga.

El dashboard global descrito en README sólo permite consulta limitada de cuentas y asignación manual de Pioneer según su alcance respectivo. La antigua mención de edición o suspensión administrativa no está confirmada allí: queda pendiente, no autorizada por este documento. Ninguna de estas responsabilidades crea acceso administrativo a historias clínicas.
