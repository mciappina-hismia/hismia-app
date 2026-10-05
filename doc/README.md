# Alcance conceptual del MVP de Hismia

Este documento conserva el alcance y los bloqueos existentes; [ARQUITECTURA.md](ARQUITECTURA/ARQUITECTURA.md) explica las responsabilidades conceptuales y [TECNOLOGIAS.md](TECNOLOGIAS/TECNOLOGIAS.md) presenta las herramientas sin presumir que todas las integraciones estén operativas.

## Estado de implementación de la unidad 2 (no modifica el alcance)

- **Implementado en código:** T1, contratos compartidos y validación de edad adulta; T2, identidad confirmada en API; T4a, alta, ingreso y confirmación PKCE en frontend. El flujo T4a usa sesión persistida por el SDK en el navegador; no implica SSR ni cookies HttpOnly.
- **Sin aceptación integral:** T3 tiene fuente de persistencia, pero faltan conexión con TLS estricto y prueba integrada. T4b no recopila ni guarda perfiles: el onboarding actual es un placeholder. T5, lectura y edición de perfiles propios, queda excluido de esta recuperación.
- **Evidencia limitada:** la entrega en `develop` mediante merge `074994f` no acredita aceptación completa. Históricamente, 50/50 tests de frontend y lint independiente pasaron; el lint incorporado al build de Next falló. No hay prueba de integración real ni verificación en navegador. Las condiciones de aceptación de las unidades propuestas más abajo siguen vigentes; el seguimiento operativo local está en `odd/tasks/auth-only-mvp-2.md` (no publicado en Git).

## Resultado buscado

MVP gradual con **50 cuentas iniciales**, ampliadas según mediciones hacia aproximadamente **1.000 cuentas totales**, con pacientes que administran su historia clínica, incluidos PDF clínicos reales solicitados para la beta, profesionales que solicitan acceso y, tras aceptación del paciente, disponen de una autorización individual de una hora revocable para leer y escribir dentro de su alcance, e instituciones que ven únicamente estadísticas agregadas permitidas. La distribución por rol, la concurrencia y la capacidad real aún no están medidas. «Lista de espera de unas 1.000 personas» no equivale a cuentas activas ni a concurrencia verificada.

**Alcance solicitado, no habilitación:** el usuario sube su historias y PDF clínicos reales para esta beta. Este plan no autoriza recopilar ni cargar datos existentes, conectar servicios, migrar, desplegar o abrir.

## Alcance y decisiones

### Acceso

Registro directo de pacientes, profesionales e instituciones, con verificación obligatoria del email de cuenta antes de habilitar el acceso para los tres tipos. Tras confirmar el enlace, una sesión válida y un email confirmado permiten pasar automáticamente al onboarding; sin sesión válida (por ejemplo, si se abrió el enlace en otro navegador o venció), se solicita ingreso con email y contraseña antes de continuar. La selección de tipo durante el registro es sólo una preferencia de onboarding, nunca autoridad. El frontend autentica directamente con Supabase Auth; el backend nunca recibe contraseñas. Confirmar el email no concede autorización clínica, verificación profesional ni administración global. Diseñar onboarding seguro y control de abuso; no autoconceder privilegios.

### Paciente

Ingresa su perfil privado, fecha de nacimiento (día calendario) para validar al menos 18 años y calcular edad estadística; para nacidos un 29 de febrero, cuando el año del decimoctavo aniversario no es bisiesto sólo alcanzan la edad mínima el 1 de marzo, no el 28 de febrero. Género opcional (mujer, varón, no binario, otra identidad, prefiero no informar), localidad donde vive y su historia por PDF o texto. No inferir sexo clínico ni incluir género en el QR.

Puede eliminar cualquier PDF de su propia historia, incluso uno cargado por un profesional, sin habilitar borrado de historias ajenas.

### Profesional

Ingresa nombre, especialidad y localidad donde ejerce en su perfil privado; puede leer, agregar notas y cargar PDF nuevos de resultados de estudios del paciente, y editar únicamente sus propias notas mientras siga vigente el grant aceptado; se conservan versiones anteriores y auditoría, incluso tras revocación en la historia del paciente. No edita notas de otros autores ni el paciente edita notas del profesional.

### Institución

Se registra directamente como una cuenta institucional única con nombre, tipo y ubicación, sin aprobación de nadie ni titular personal, equipo, membresías o invitaciones. Esto no implica compartir credenciales ni fija cuántas personas la operan; sólo consulta estadísticas agregadas de edad, género y horario **por institución** cuando se resuelvan sus bloqueos.

Estadísticas solicitadas. Institución registra el evento de **ingreso** del paciente; la hora del ingreso no equivale a hora de atención ni de login. Definir si representa ingreso físico o a plataforma antes de instrumentarlo.

### Profesional → paciente

El profesional solicita acceso; sólo la aceptación del paciente crea el grant individual. La hora empieza en la aceptación según reloj del servidor; el paciente puede revocar antes.

Revalidar vigencia y alcance en cada lectura, descarga y escritura; solicitud pendiente o rechazada no es permiso. Acceso a toda la historia médica del paciente confirmado, no selección individual de documentos; al vencer se exige nueva solicitud profesional y nueva aceptación del paciente, sin renovación automática; no usar permiso general ni consentimiento institucional.

### Administrador global

Dashboard privado con cantidad total de cuentas y por tipo; consulta de nombre, email de cuenta, tipo de usuario, localidad y estado de cuenta.

Lista cerrada: sin DNI, fecha de nacimiento, historias, notas, archivos médicos ni métricas clínicas institucionales; sin impersonación ni permisos en nombre del paciente.

### Membresía Pioneer

Niveles BLACK, Platinum, Dorada y **Bronce** fijos en beta, múltiples miembros por nivel; asignación manual por administrador global. Bronce contradice el canon actual de tres niveles; elegibilidad y beneficios exactos pendientes. Beneficios fijos (hardcodeados), sin editor administrativo, confirmado para beta; los valores concretos siguen pendientes: no activar derechos ni prometer pagos, descuentos, cuotas o privilegios clínicos ficticios. Ningún nivel concede autoridad clínica o administrativa.

### Recordatorios

Paciente guarda, consulta, edita y desactiva recordatorios de medicación recurrentes y avisos anticipados de turnos; configura el intervalo de recurrencia y la anticipación respectivamente, sin intervalos fijos de producto; entrega real por bandeja interna, email y web push en MVP.

Bandeja persistente; email genérico sin fármaco, dosis ni datos clínicos; push opcional con permiso. Programación en servidor, deduplicación, reintentos y privacidad; no garantiza puntualidad ni sustituye alarma médica.

### PDF clínicos

Paciente o profesional específico con grant activo de una hora y alcance explícito de carga incorpora PDF de estudios e historia.

Verificar identidad y permiso al iniciar y finalizar carga, en API y almacenamiento; registrar propietario paciente y autor por separado. PDF nunca público. El paciente puede eliminar cualquier PDF de su propia historia, incluido uno cargado por un médico; no implica editar/sustituir archivos ni autoriza al profesional a eliminarlos.

### QR público de emergencia

Paciente genera, actualiza, descarga, imprime y lleva un QR para que un médico lea en urgencias cuando el paciente esté inconsciente; cualquier poseedor podrá leerlo técnicamente sin login, aunque el destinatario previsto sea sanitario: **nombre, alergias y grupo sanguíneo**.

Divulgación clínica excepcional y acotada, separada del grant profesional y con aceptación expresa del paciente. Enlace público opaco a ficha actualizable y desactivable sin reimprimir; requiere internet, y desactivar sólo impide futuras consultas, no retira copias; no añadir DNI, contacto ni medicamentos por inferencia. En beta todos los datos clínicos del QR son DECLARADOS, con fecha de última actualización.

## Experiencia mínima por actor

1. **Paciente:** crea cuenta directa sólo con edad mínima de 18 años; completa nombre visible, fecha de nacimiento, género opcional, localidad donde vive y los datos de perfil que se habiliten explícitamente; carga PDF de estudios o historia o agrega un registro escrito; recibe la solicitud iniciada por el profesional y la acepta o rechaza; sólo la aceptación inicia la hora de acceso, y puede revocar antes. Elimina cualquier PDF propio, incluido el cargado por un médico, sin editar notas de autoría médica. Configura intervalos de medicación recurrente y anticipación de avisos de turnos, gestiona recordatorios, recibe avisos en bandeja, email y, si concede permiso, web push; acepta expresamente la divulgación de nombre, alergias y grupo sanguíneo antes de generar, actualizar, descargar, imprimir y llevar su QR público de emergencia para lectura médica urgente.

2. **Profesional:** crea cuenta propia y completa nombre, especialidad y localidad donde ejerce; solicita acceso al paciente; una solicitud por sí sola no concede permiso. Tras aceptación consulta sólo el PHR autorizado y agrega notas o PDF si el grant vigente permite cada operación. Edita exclusivamente sus propias notas mientras el grant siga activo, conservando versiones previas y auditoría; no edita notas ajenas, sustituye PDF ni elimina PDF del paciente. Tras revocación cesan lectura y escritura; las notas permanecen en la historia del paciente.

3. **Institución:** crea directamente una cuenta institucional única con nombre, tipo y ubicación, sin aprobación de administrador ni otra persona, titular personal, equipo, membresías o invitaciones. No se infiere uso compartido de credenciales ni cantidad de operadores. No obtiene administración global, acceso a instituciones ajenas ni PHR. Estadísticas V1 de pacientes asociados a su institución bloqueadas hasta resolver atribución, fundamento/autorización estadística, definición del ingreso registrado por la institución y protección de celdas; no usar semillas de demostración.

4. **Administrador global:** accede a un dashboard privado con cantidades de cuentas total y por tipo, y datos básicos limitados a nombre, email de cuenta, tipo de usuario, localidad y estado de cuenta. No se muestra DNI, fecha de nacimiento ni información clínica. La asignación administrativa es separada: ni el alta pública ni los metadatos enviados por usuarios crean roles elevados o estado profesional verificado.

5. **Pioneer:** puede pertenecer a uno de cuatro niveles fijos en beta, compartido con otros miembros; el nivel no sustituye grants ni roles. Lo asigna manualmente el administrador global. Criterios de elegibilidad y beneficios exactos pendientes; sin beneficios activos ni promesas ficticias. Cuando se definan, los beneficios serán fijos (hardcodeados) durante beta, sin editor administrativo.

**Privacidad de acceso:** el login es la entrada de autenticación, no un perfil público ni un formulario de localidad. Los perfiles, sus consultas y modificaciones, y el dashboard requieren sesión y autorización de servidor por propietario/rol. No publicar directorios de perfiles. El contacto visible al admin es el email de cuenta, no el email clínico cifrado del paciente. Los conteos de cuentas no son estadísticas de salud. Esta ampliación administrativa es una decisión del nuevo MVP; debe reconciliarse con la consulta acotada de soporte del contrato actual antes de implementarse, sin habilitar exportación masiva ni edición de permisos.

## Campos de perfil y observaciones heredadas

Las referencias a esquema, DTO y controladores a continuación provienen de una inspección anterior; esta tarea documental no verificó el código ni acredita que los flujos estén operativos.

### Perfil del paciente

Nombre visible, fecha de nacimiento para edad mínima de 18 años y estadística de edad, género opcional (mujer, varón, no binario, otra identidad, prefiero no informar), localidad de residencia y carga de historia; otros datos se concretan en diseño.

`profiles.displayName` es obligatorio y se usa en el alta por invitación. `patients` tiene `birthDate` y campos cifrados opcionales para email, DNI, teléfono y seguro; género no figura en el esquema/DTO inspeccionado. Correo/clave de Auth no son el correo clínico cifrado. Añadir interfaz de edición propia, fecha de nacimiento persistida y género opcional con contrato acotado; no inferir sexo clínico.

### Perfil del profesional

Nombre, especialidad y localidad de ejercicio.

Esquema `professionals` exige `registrationNumber` y `jurisdiction`, con `verificationState` predeterminado `pending`; controlador `/me` observado para lectura de identidad, sin alta/edición profesional observada en el alcance revisado. Diseñar alta propia, especialidad y cambios reversibles de contrato/esquema.

### Perfil de la institución

Nombre, tipo y ubicación; la observación heredada no prueba ausencia exhaustiva. Alta directa de una sola cuenta institucional sin aprobación, titular personal, equipo, membresías ni invitaciones es decisión de producto; el panel requiere autorización por institución aún por diseñar.

## Discrepancia pendiente sobre PDF

La redacción anterior del perfil profesional sugería editar PDF. La unidad 4 y la experiencia por actor, en cambio, prohíben sustituir o editar PDF: sólo contemplan cargar PDF nuevos bajo un grant vigente y autorizado. Se conserva esta regla restrictiva y queda pendiente reconciliar la discrepancia; no se autoriza edición de PDF.

## Unidades de entrega propuestas

Las unidades siguientes son planificación, **no trabajo completado**. Cada aceptación es una prueba futura; los comandos y ambientes se fijarán tras verificar el estado ejecutable del proyecto. No hay resultados de test observados en este documento.

### 1. Línea base ejecutable y límites del entorno

- **Resultado:** mapa reproducible de arranque local, autenticación, persistencia, almacenamiento PDF y tests disponibles, con entornos de prueba aislados que usan fixtures sintéticos y requisitos explícitos para operar datos reales.

- **Reutilizar / crear:** inspeccionar configuración y rutas actuales sin ejecutar instalaciones o migraciones por este plan; definir fixtures sin datos clínicos reales y controles para evitar conexiones accidentales a entornos reales.

- **Aceptar cuando:** el equipo documente cómo levantar y verificar cada componente, y demuestre aislamiento de pruebas y denegación de accesos no autorizados; esta evidencia local no acredita preparación para operar datos reales. Registrar fallos conocidos en vez de presumir que arranca.

### 2. Alta directa y perfiles propios

- **Resultado:** paciente adulto (>=18), profesional e institución crean cuentas directas con email de cuenta confirmado antes de acceder y editan sólo recursos propios; la institución nueva carga sus tres campos acordados sin aprobación de terceros ni modelo de titular/equipo.
- **Reutilizar / crear:** adaptar el formulario de invitación y rutas de Auth sin exigir token; aprovechar esquema de perfiles y DTOs de paciente; añadir fecha de nacimiento persistida, validación de edad mínima 18, género opcional, especialidad, localidad de residencia/ejercicio, UI propia privada y alta institucional directa. Diseñar migración reversible para campos profesionales exigidos y pausa Beta 2 sin falsos datos. No confiar en rol solicitado por el cliente.
- **Aceptar cuando:** se deniegue acceso a los tres tipos mientras su email no esté confirmado; confirmar email no conceda permisos clínicos, verificación profesional ni admin global; el alta normal persista campos permitidos, se persista y valide fecha de nacimiento en alta y edición para edad adulta y métricas, y solicitudes de autoasignación de admin global/verified, de membresía institucional o perfiles ajenos sean rechazadas. Probar reversibilidad de esquema y preservar restricciones en entornos reales.

### 3. Historia propia y PDF (datos reales solicitados; habilitación condicionada)

- **Resultado:** paciente crea y consulta entradas textuales y PDF propios y elimina cualquier PDF de su historia, incluso el cargado por un profesional; no se exponen ni eliminan recursos de terceros.
- **Reutilizar / crear:** partir de controlador/servicio de historias existente; revisar almacenamiento, descarga, tipo/tamaño de PDF, sanitización, propietario y auditoría antes de exponer una interfaz de carga. No asumir que la existencia de endpoints implica flujo web operativo.
- **Aceptar cuando:** API, UI y almacenamiento respeten propietario; cargas inválidas y acceso cruzado se denieguen; el paciente pueda eliminar PDF propio independientemente del autor y no eliminar uno ajeno, sin conceder edición o sustitución de PDF. Especificar resultado en almacenamiento, respaldos, retención y enlaces firmados antes de afirmar eliminación física; las pruebas usen sólo fixtures sintéticos; antes de admitir datos reales verificar permisos por recurso, tratamiento y eliminación operativa.

### 4. Solicitud, grant horario, notas versionadas y PDF profesional

- **Resultado:** profesional solicita acceso; paciente acepta o rechaza. Sólo aceptar inicia una hora en servidor, revocable antes; el profesional lee, añade notas o PDF nuevos y edita únicamente sus propias notas con alcance explícito mientras el grant esté vigente. Las versiones previas y notas permanecen en historia del paciente tras revocación.
- **Reutilizar / crear:** extender READ/DOWNLOAD con alcances explícitos de nota nueva, edición versionada de nota propia y carga PDF; el flujo de carga observado exige paciente autenticado y consentimiento. Diseñar validaciones del profesional al iniciar y finalizar carga en API y almacenamiento, separar paciente propietario de identidad autora, verificar autoría y conservar versiones/auditoría, mantener PDF privado y reconciliar contratos y pruebas antes de activar.
- **Aceptar cuando:** ante solicitud pendiente/rechazada, antes de aceptación, tras revocación, tras vencimiento y con otro profesional se denieguen lectura, descarga y **escritura**, incluida carga en inicio y finalización. Ni admin ni institución ni un ID conocido eluden controles; sólo el autor profesional edite su nota con grant activo, con versiones previas retenidas; ni paciente ni otro profesional editen esa nota, y nadie sobrescriba PDF previos. Probar inicio horario en aceptación, revocación concurrente con lectura/escritura y reloj del servidor. Lectura y descarga abarcan toda la historia médica del paciente; la edición sigue limitada a notas propias del médico y la carga al alcance autorizado. Tras el vencimiento sólo una nueva solicitud y aceptación crea otro grant, nunca autorrenovación.

### 5. Membresías Pioneer propuestas

- **Resultado:** BLACK, Platinum, Dorada y Bronce son los cuatro niveles fijos de beta y admiten múltiples miembros por nivel. El administrador global asigna manualmente un nivel, sin conceder privilegios clínicos o administrativos.
- **Aceptar cuando:** se reconcilie el canon previo de tres niveles y se pruebe que la membresía no concede PHR ni admin. Criterios exactos de elegibilidad y beneficios siguen pendientes: hasta definirlos no activar derechos, pagos, cuotas ni descuentos. La modalidad fija (hardcodeada) de los beneficios en beta está confirmada; sus valores concretos aún no están definidos.

### 6. Entrega de recordatorios propuesta

- **Resultado:** paciente configura la recurrencia de medicación y la anticipación de turnos, y guarda, ve, edita y desactiva ambos recordatorios; bandeja interna persistente, email genérico y web push opcional con permiso real.
- **Aceptar cuando:** scheduling de fondo en servidor (no temporizadores del navegador), intervalos de recurrencia de medicación y anticipación de turnos configurables por paciente, con zona horaria, UI y validación diseñadas sin imponer valores de producto no decididos; eventos futuros detenidos tras desactivar, deduplicación/reintento y privacidad verificados. Documentar soporte y permiso del navegador; en iOS/iPadOS 16.4+ web push requiere web app en pantalla de inicio. No prometer entrega puntual ni alarma médica. La fase 14 REM1 sólo prevé persistencia: enviar avisos amplía el alcance REM2 diferido y exige reconciliar contratos antes de implementar, sin activar nada aquí.

### 7. QR público de emergencia propuesto

- **Resultado:** con aceptación expresa del paciente, QR como enlace público opaco a ficha de nombre, alergias y grupo sanguíneo, actualizable o desactivable sin reimprimir. Requiere internet. Destinatario previsto: médico de urgencias; técnicamente cualquier poseedor puede consultar sin login. No equivale al grant profesional ni publica el resto del PHR, notas o PDF.
- **Aceptar cuando:** la ficha exponga datos clínicos sólo como **DECLARADOS** en beta y fecha de última actualización, sin autoverificación ni verificación inventada; un grupo sanguíneo desconocido nunca se complete por inferencia. La verificación clínica queda diferida. Probar actualización/desactivación para consultas futuras y advertir que datos ya vistos o copiados son irreversibles. Revisar privacidad, abuso y el bloqueo legal del contrato de fase 13 antes de activar un QR clínico nativo. La presencia solicitada de datos reales tampoco acredita aptitud médica de emergencia: equipos sanitarios deben confirmar por sus propios protocolos y no basar tratamiento o transfusión sólo en el QR.

### 8. Estadísticas institucionales, condicionadas

- **Resultado V1 confirmado, condicionado:** agregados de edad y género de pacientes asociados a la propia institución y hora del evento de **ingreso registrado por la institución**; no hora de atención ni login y no dataset de demostración. El alcance incluye además historias clínicas reales solicitadas, sin que eso autorice usar PHR para calcular o compartir métricas.
- **Bloqueo V1:** definir contrato del evento de ingreso (físico o a plataforma), asociación mínima paciente-institución, quién registra y corrige ingresos, autorización de la cuenta institucional y fuente de edad/género sin acceso institucional al PHR. Reconciliar la finalidad/autorización estadística y el consentimiento `institution_metrics_share` propuesto para V2 antes de operar métricas V1; no presumir consentimiento, exención legal por agregación ni que todos los pacientes de plataforma están disponibles para todas las instituciones. Ni grant clínico, alta propia, login o localidad equivalen a atribución o autorización. Definir supresión/minimización sin umbral inventado.
- **Aceptar cuando:** esas decisiones estén resueltas y se prueben aislamiento institucional, acceso autorizado de la cuenta institucional, autorización de finalidad, supresión de celdas conforme al contrato y rechazo de exportación identificable. Hasta entonces mantener el tablero V1 bloqueado; el resto del borrador no queda bloqueado.

### 9. Dashboard administrativo privado

- **Resultado:** administrador autorizado consulta cantidades de cuentas total y por tipo y los cinco datos básicos aprobados: nombre, email de cuenta, tipo de usuario, localidad y estado de cuenta. No se interpreta cantidad de cuentas como cantidad de personas únicas ni como concurrencia.
- **Reutilizar / crear:** revisar datos de cuenta/perfil existentes y agregar una proyección administrativa mínima, paginada y protegida. No reutilizar endpoints clínicos, enlaces paciente-institución ni privilegios de proveedor. La existencia de este panel no está acreditada.
- **Aceptar cuando:** usuarios sin asignación administrativa vigente no accedan a API ni UI; las respuestas excluyan DNI, fecha de nacimiento, historias, notas, archivos y datos clínicos incluso si el cliente los solicita. Verificar la localidad prevista por actor sin deducirla de atenciones, y registrar accesos de forma minimizada. No permitir impersonación, exportación masiva ni modificación de grants.

### 10. Beta privada gradual y medición

- **Resultado:** 50 cuentas iniciales y ampliación gradual según mediciones hacia unas 1.000 cuentas totales, con monitoreo y criterio de pausa documentados antes de abrir acceso. El equipo usuario atiende personalmente el soporte; canal y responsable específicos pendientes de definición operativa.
- **Reutilizar / crear:** medir distribución de roles, tasas de alta, almacenamiento, tiempos de respuesta y concurrencia; revisar fallos de permisos y auditoría. Definir controles de abuso para registro directo y procedimiento de recuperación sin invitación obligatoria ni aprobación encubierta.
- **Aceptar cuando:** pruebas de carga sobre un perfil de tráfico acordado, pruebas negativas de autorización y verificaciones de seguridad, privacidad y funcionalidad aplicables a datos reales sustenten el lote inicial, con aprobación humana de release antes del primer dato clínico real; registrar capacidad observada y ampliar sólo según resultados. No interpretar 1.000 cuentas como 1.000 sesiones simultáneas.

## Decisiones pendientes antes de ejecutar unidades afectadas

1. **Métricas institucionales V1 (bloquea unidad 8):** datos clínicos reales y estadísticas V1 ya están solicitados; no reabrir esas opciones. Definir asociación mínima a institución, evento de ingreso institucional (físico o a plataforma), origen y corrección de edad/género, permisos y supresión. Reconciliar la autorización/finalidad de estadísticas V1 con `institution_metrics_share` y el consentimiento estadístico propuesto para V2; sin autorización acreditada no abrir el panel.
2. **Acceso institucional y email (unidad 2):** alta directa de una cuenta institucional única sin aprobación, titular personal, equipo, membresías ni invitaciones confirmada. No inferir credenciales compartidas ni cantidad de operadores. Email confirmado obligatorio antes de acceder para paciente, profesional e institución; no equivale a permisos clínicos, verificación profesional ni admin global. Primer administrador global por configuración controlada, no por alta pública.
3. **Grant y versiones:** renovación decidida: nueva solicitud y aceptación después del vencimiento. Definir concurrencia entre revocación y operación, contrato de autor, propiedad paciente, scopes y eventos de edición/versionado. Sólo el autor profesional edita su nota con grant activo; las versiones permanecen en la historia.
4. **Perfil profesional adicional:** cualquier campo más allá de nombre, especialidad y localidad se difiere; concretar catálogo y validaciones. Perfil paciente adulto exige fecha de nacimiento persistida y comprobación de edad >=18 sin reintroducir DNI.
5. **Pioneer:** niveles BLACK, Platinum, Dorada y Bronce fijos en beta y asignación manual por administrador confirmados. Determinar elegibilidad y beneficios exactos; sin derechos activos hasta entonces. Beneficios fijos (hardcodeados) sin editor administrativo confirmados; valores concretos aún no decididos.
6. **Recordatorios:** diseñar zona horaria, UI, validaciones y reconciliación REM1/REM2 y notificaciones sin defaults inventados.
7. **QR público:** formato opaco actualizable/desactivable y sólo datos DECLARADOS confirmados. Resolver revisión legal y privacidad de la ficha clínica pública de fase 13 antes de activar; usar datos reales en beta tampoco acredita idoneidad para emergencias o decisiones médicas. No agregar otros campos por inferencia.
8. **Eliminación de PDF:** definir eliminación física, respaldos, retención y enlaces firmados, sin prometer purga instantánea.
9. **Soporte y apertura:** el equipo usuario da soporte personalmente; canal y responsable operativo específico se documentarán sin inventarlos. Lote inicial de 50 cuentas, medición y ampliación gradual hacia unas 1.000 sin invitaciones obligatorias ni aprobación encubierta; definir criterios técnicos de pausa y capacidad observada antes de abrir.
