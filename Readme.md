# HSK Máster — vocabulario chino mandarín HSK 1-6

PWA instalable en Android. Funciona sin conexión y guarda todo el progreso en el
propio dispositivo (IndexedDB). Sin cuentas, sin servidor, sin red.

5.400 palabras del HSK 3.0 (syllabus CLEC 2025) embebidas en la app:
HSK1 300 · HSK2 200 · HSK3 500 · HSK4 1000 · HSK5 1600 · HSK6 1800.
Definiciones en español e inglés (inglés de SayMei; español traducido a partir de él). El idioma se elige en Ajustes → Idioma.

## Instalar en el móvil

La app necesita servirse por **HTTP(S)** — abriéndola con doble clic (`file://`)
no funcionan ni IndexedDB ni el modo offline.

**Prueba rápida desde el PC:**

```bash
cd hsk-flash
python3 -m http.server 8099
# en el móvil, misma wifi: http://IP-DEL-PC:8099
```

Chrome exige origen seguro para el service worker: `localhost` vale, una IP de
la LAN **no**. Para instalarla de verdad, publícala con HTTPS (tu nginx + Let's
Encrypt, igual que cualquier otro sitio estático) y entra desde Chrome Android:

```
⋮ → Añadir a pantalla de inicio / Instalar aplicación
```

Queda como app independiente, con icono propio y sin barra del navegador.

**nginx mínimo:**

```nginx
server {
    listen 443 ssl;
    server_name hsk.tudominio.net;
    root /var/www/hsk-flash;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location = /sw.js { add_header Cache-Control "no-cache"; }
}
```

## Cómo cuenta el progreso

| Qué | Cómo |
|---|---|
| Contador global | +1 por acierto, −1 por fallo (configurable), nunca baja de 0 |
| Por dirección | **reconocimiento** (hanzi → significado) y **producción** (significado/pinyin → hanzi) por separado |
| Aprendida (automático) | 20 aciertos globales **y** 5 en cada dirección (ambos ajustables) |
| Aprendida (manual) | botón en la ficha de la palabra; también se puede desmarcar |
| Difícil | marca manual: sale antes y más a menudo |
| Programación | SM-2 simplificado: 1 día → 3 días → ×factor de facilidad. Un fallo la devuelve a los 10 min y baja el factor |

Una palabra aprendida sale de la cola normal y solo vuelve en **Repasar
aprendidas**. Si ahí falla y el contador cae por debajo del umbral, vuelve
automáticamente a la cola de no aprendidas.

Dentro de una sesión, cada fallo reencola la palabra una vez al final (repesca).

## Modalidades

- **Clásica** — hanzi → mostrar → "lo sé / no lo sé" (reconocimiento)
- **Test 4 opciones** — hanzi → significado (reconocimiento)
- **Inversa** — significado → hanzi (producción)
- **Escribir pinyin** — teclado; acepta `nǐhǎo`, `ni3hao3` y, si no exiges tonos, `nihao`.
  Botón "era correcta" para corregir un falso negativo
- **Emparejar 6×6** — seis hanzi con sus seis significados (reconocimiento)

Si eliges varias, se alternan al azar dentro de la sesión.

## Filtros de sesión

Niveles · qué palabras (sin aprender / falladas / aprendidas / todas) · orden
(repaso programado, aleatorio, más falladas primero, orden de lista) · tamaño ·
modalidades · categoría gramatical (15 categorías).

## Copia de seguridad

Ajustes → Exportar JSON. Al importar puedes **reemplazar** o **fusionar** (suma
aciertos y fallos y se queda con el mayor progreso de cada palabra). Hazlo de vez
en cuando: si borras los datos del navegador o desinstalas, el progreso se pierde.

## Estructura

```
index.html              arranque
manifest.webmanifest    metadatos de instalación
sw.js                   service worker (offline + aviso diario)
css/app.css             estilos, temas claro/oscuro
js/vocab.js             las 5.400 palabras (generado del CSV)
js/store.js             IndexedDB, ajustes, export/import
js/srs.js               puntuación y programación
js/session.js           filtros, orden y construcción de la cola
js/modes.js             las 5 modalidades
js/stats.js             estadísticas y gráficos SVG
js/pinyin.js            tonos, silabificación y comparación de respuestas
js/wordsheet.js         ficha de palabra
js/vocab-es.js          definiciones en español (alineadas con vocab.js)
js/lang.js              idioma de las definiciones
js/version.js           número de versión (se ve en Ajustes → Acerca de)
js/app.js               navegación y pantallas
```

Sin dependencias ni build: es JavaScript con módulos ES. Para cambiar algo,
edita y recarga. Si tocas un archivo, sube la versión de `CACHE` en `sw.js` y
`VERSION` en `js/version.js` para que el service worker sirva la nueva. En
Ajustes → Acerca de se ve la versión y la caché activas.

## Límites conocidos

- **Aviso diario**: mientras la app está abierta es fiable; cerrada depende de
  `periodicSync`, que Android concede solo a apps instaladas y según uso. No es
  una alarma garantizada.
- **Sin audio**, por decisión de diseño.
- Las definiciones en español son una traducción de las inglesas: pueden tener
  matices mejorables. El inglés se conserva tal cual viene en la fuente.
- No hay escritura de hanzi a mano: la fuente no trae datos de trazos.
