# Full Claro · Centro de operaciones

## Tablero GTR con SQL Server

La ruta principal `/` consulta directamente la base local `GTR_FullClaro`. No calcula indicadores en Next.js: ejecuta los procedimientos almacenados de resumen, tramos, modalidad y asesores. Conserva los gráficos de Bklit UI.

Ejecuta este tablero desde Windows PowerShell, para usar la autenticación integrada de SQL Server:

```powershell
Set-Location "C:\Users\bruno\Documents\Trabajo\A365\full-claro-dimensiones"
npm run dev
```

Abre `http://localhost:3000`. La reportería anterior basada en archivos/MySQL sigue disponible en `/reporteria` y el dimensionamiento en `/dimensionamiento`.

Aplicación local existente ampliada con reportería operativa en Next.js, gráficos reales de Bklit UI y persistencia MySQL. El dimensionamiento anterior sigue disponible en `/dimensionamiento` y usa sus tablas y cargador originales.

## Abrir

```powershell
docker compose up -d --build
```

Visita http://localhost:3000. Los puertos de la aplicación (3000) y MySQL (3307) están vinculados a localhost. Las credenciales se configuran con `.env.example`; se conservan las variables existentes de Docker.

Para detener sin borrar datos: `docker compose stop`. Los datos permanecen en el volumen `mysql_data`. No elimines el volumen para actualizar el frontend.

## Reportería

Carga un `.xlsx` de hasta 35 MB que contenga `Report De Trazabilidad(BP`. El cargador encuentra las columnas por nombre, valida fechas e indicadores calculados y guarda una versión comprimida en `report_imports`. El hash SHA-256 evita duplicar el mismo archivo. Se conserva el historial; Fuentes de datos permite seleccionar importaciones anteriores. Cada versión se analiza por separado para evitar duplicar días de archivos solapados.

Vistas:

- Vista general: volumen, atención, experiencia, calidad y detalle diario.
- Indicadores: 32 indicadores, fórmula visible y tendencia seleccionable.
- Equipo y agentes: filtros de supervisor/agente, búsqueda, orden y resultados agrupados.
- Franjas: intervalos de 30 minutos y distribución por cola. Si se eligen varios días, se suman las mismas franjas.
- Objetivos comerciales: comparación referencial con el PDF adjunto y fuentes faltantes.
- Fuentes: conciliación con Diario y explorador de las ocho hojas auxiliares, incluida Nómina. Sus valores mantienen los filtros guardados del Excel, independientemente de los filtros del dashboard.

Los filtros por fecha, supervisor, agente, cola y dirección recalculan desde los registros originales. Exportar descarga los indicadores diarios filtrados a CSV, con porcentajes expresados de 0 a 100. Una tasa sin denominador se muestra como `—`, nunca como cero.

## Definiciones y límites

- TMO: suma de `tmo_atendido` / atendidas con valor numérico; el Excel lo deriva de DURACION. No es automáticamente equivalente al TMG contractual.
- TNPS/NPS: sumas de puntuaciones / respuestas. Incluyen entrantes y salientes tal como el Excel. No se promedian porcentajes diarios ni de agentes.
- Transferencia a encuesta: `Tx Encuesta Entrante / (Tx Encuesta Entrante + CLIENTE Entrante + ASESOR Entrante + SISTEMA Entrante)`. Esta fórmula proviene de la tabla dinámica.
- NDS del Excel: atendidas en 20 s / recibidas. AVH2: atendidas en 20 s / atendidas.
- NS 15 s: estimación con ATENDIDA X SEG, campo usado por la fórmula Atendia en 20. Debe validarse con Claro antes de una liquidación contractual.
- CAT usa el campo Cat. No se sustituye por ASESOR, cuya regla es distinta.
- Objetivo TNPS de agosto y septiembre 2026: 91%; octubre a diciembre: 92%, verificado visualmente en la tabla de la página 3. Fuera de ese período, o con varios meses, no se inventa una meta.
- El PDF presenta inconsistencias en calidad emitida y número de intervalos; la interfaz las señala. No se calculan penalidades, bonos ni facturación sin el resto de fuentes y reglas.
- Adherencia, ocupación, calidad emitida, rellamadas D+1, rotación, estructura y horas facturables requieren fuentes adicionales. Los tiempos de conversación no se convierten en horas facturables.
- Se leen los resultados guardados de las fórmulas del Excel; no se ejecutan macros ni instrucciones del documento. Recalcula y guarda en Excel antes de cargar un archivo que tenga resultados faltantes.

## Dimensionamiento existente

`/dimensionamiento` conserva el cargador de la hoja `Detalle Franjas`, campaña FULL CLARO, con llamadas previstas, TMG, asesores requeridos y horas dimensionadas. Importar un mes reemplaza sus franjas y conserva los demás meses. Reportería usa una tabla independiente y no modifica esas importaciones.

## Desarrollo y validación

```powershell
docker compose up -d db
npm run dev
```

La conexión local predeterminada usa localhost:3307. `npm run build` comprueba producción y TypeScript. Pruebas de agregación y conciliación:

```powershell
node scripts/test-report.cjs 'C:\ruta\Reportería con Colorcitos - FCB.xlsx'
```

Con el archivo recibido se verificaron 22.235 registros, 350 valores diarios, 14 totales y cinco particiones de agrupación. También se comprueban denominadores vacíos, ceros reales, promedios ponderados, tiempos faltantes y rechazo de archivos inválidos.

Los componentes Bklit ya estaban instalados desde su registro oficial: https://bklit.com/docs/installation.
