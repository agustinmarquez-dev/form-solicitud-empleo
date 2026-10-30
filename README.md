# Formulario de solicitud de empleo

Aplicación web de postulación laboral para local gastronómico. Guía al candidato a través de un formulario de cuatro etapas, calcula un perfil de manera interna y registra la postulación en Supabase.

El proyecto está hecho con HTML, CSS y JavaScript nativo: no requiere instalación de paquetes ni proceso de compilación.

## Características

- Formulario guiado en cuatro etapas: datos personales, disponibilidad, experiencia y autoevaluación.
- Validación de los datos requeridos antes de avanzar.
- Listas de barrios y localidades dinámicas según la zona elegida.
- Cuestionario de 12 afirmaciones con cálculo de puntaje y perfil interno.
- Guardado automático del progreso en el navegador durante 24 horas.
- Prevención local de envíos duplicados por correo electrónico.
- Envío de postulaciones a Supabase mediante su API REST.
- Pantalla final con acceso a la [documentación para postulantes](https://sites.google.com/view/postulantes-seleccion/documentacion).
- Diseño responsive con tema claro, optimizado para celular, tablet y escritorio.

## Tecnologías

- HTML5
- CSS3
- JavaScript nativo (ES6+)
- [Supabase](https://supabase.com/) para persistencia de postulaciones

## Estructura del proyecto

```text
.
├── assets/
│   └── img/
│       ├── extremas-logo.jpg
│       └── sabores-logo.jpg
├── app.js          # lógica del formulario, validaciones y envío
├── index.html      # estructura y contenido de las pantallas
├── styles.css      # sistema visual y diseño responsive
└── README.md
```

Los archivos terminados en `-old` son versiones anteriores que se conservan como referencia y no forman parte de la aplicación activa.

## Ejecutar localmente

1. Cloná el repositorio.

   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd form-solicitud-empleo-main
   ```

2. Abrí `index.html` en el navegador. Para una experiencia local más consistente, iniciá un servidor estático:

   ```bash
   python3 -m http.server 8000
   ```

3. Visitá `http://localhost:8000`.

No se necesitan dependencias ni archivos de entorno para visualizar la interfaz.

## Configuración de datos

La configuración principal se encuentra al inicio de [`app.js`](./app.js):

- `supabaseUrl`: URL del proyecto Supabase.
- `supabaseKey`: clave pública `anon` utilizada por el frontend.
- `storageKey` y `emailsKey`: claves usadas en `localStorage`.
- `draftTTL`: duración del borrador guardado, actualmente 24 horas.

La aplicación inserta los registros en la tabla `postulaciones`. Si usás otro proyecto de Supabase, actualizá la URL y la clave pública, y asegurate de crear la tabla y sus políticas correspondientes.

> **Seguridad:** no uses una clave `service_role` en el navegador. La tabla debe contar con políticas RLS que permitan únicamente las operaciones necesarias desde el cliente.

## Personalización

| Necesidad | Archivo a editar |
| --- | --- |
| Textos, campos y enlace de documentación | `index.html` |
| Colores, tipografía y comportamiento responsive | `styles.css` |
| Zonas, localidades, preguntas, puntajes y perfiles | `app.js` |
| Logos e imágenes | `assets/img/` |

Para agregar o editar localidades, modificá el objeto `LOCALIDADES` en `app.js`. Las zonas que requieren una selección adicional se definen en `ZONAS_CON_UBICACION`.

## Flujo de una postulación

1. La persona completa sus datos, disponibilidad y experiencia.
2. Responde el cuestionario de autoevaluación.
3. La aplicación calcula el puntaje y asigna un perfil interno.
4. Se envía un registro a Supabase.
5. Se muestra el siguiente paso para completar la documentación requerida.

## Estado del proyecto

Aplicación web estática lista para publicar en cualquier hosting que sirva archivos HTML, CSS y JavaScript.
