# Skincare KR · Inventario (versión web)

App para vender, llevar inventario y ver finanzas desde la computadora o el celular.
Los datos viven en **Supabase** (gratis) y la página se publica en **GitHub Pages** (gratis).

## Qué hace

- **Vender:** carrito con varios productos, precio editable (descuentos) y el total al momento.
- **Inventario:** productos, categorías, margen y aviso de stock bajo (configurable por producto).
- **Entradas:** cuando llega mercancía, suma al stock y guarda cuándo, cuánto y a qué costo.
- **Ventas:** historial por mes, con quién vendió. Al eliminar una venta, las piezas regresan.
- **Finanzas:** hoy, esta semana o cualquier mes; lo más vendido; valor del inventario; qué resurtir.
- **Respaldo:** descarga productos y ventas en CSV (Excel) o un respaldo completo en JSON.

Si no hay datos de Supabase en `js/config.js`, la app abre en **modo demo** con productos inventados.

## Puesta en marcha (una sola vez)

### 1. Crear el proyecto en Supabase
1. Entra a <https://supabase.com>, crea tu cuenta y un **New project** (plan Free).
   Región sugerida: la más cercana a México (p. ej. *East US* o *West US*).
2. Ve a **SQL Editor → New query**, pega todo `supabase/esquema.sql` y presiona **Run**.

### 2. Dar de alta a los socios
1. **Authentication → Sign In / Providers** → apaga **Allow new users to sign up**
   (así nadie más puede crear cuenta).
2. **Authentication → Users → Add user → Create new user**: crea tu usuario y el de Dianelly
   con correo y contraseña, marcando **Auto Confirm User**.
3. En **SQL Editor**, cambia los correos y ejecuta:

   ```sql
   insert into public.miembros (user_id, nombre)
   select id, 'Gabriel' from auth.users where email = 'TU-CORREO@ejemplo.com';

   insert into public.miembros (user_id, nombre)
   select id, 'Dianelly' from auth.users where email = 'CORREO-DE-DIANELLY@ejemplo.com';
   ```

### 3. Pasar los datos del programa anterior
1. Genera el archivo (lee tu base en modo solo lectura):
   ```
   python herramientas/migrar.py "C:\Users\gabor\InventarioSkincare\inventario.db"
   ```
2. Pega el contenido de `supabase/migracion.sql` en **SQL Editor** y ejecútalo **una sola vez**.
   Este archivo trae tus datos reales y está excluido de Git.

### 4. Conectar la app
En Supabase: **Project Settings → API** copia la **Project URL** y la **anon public key**
y pégalas en `js/config.js`. La anon key está hecha para ir en la página: lo que protege los
datos son las reglas de `esquema.sql` (solo usuarios en `miembros` pueden ver o modificar).

### 5. Publicar
Sube la carpeta a un repositorio de GitHub y activa **Settings → Pages → Deploy from a branch → main / (root)**.
La app queda en `https://<usuario>.github.io/<repositorio>/`.

### 6. Instalar en el celular
Abre la liga en el celular:
- **Android (Chrome):** menú ⋮ → **Agregar a la pantalla principal / Instalar app**.
- **iPhone (Safari):** botón Compartir → **Agregar a inicio**.

Se inicia sesión una vez por celular y se queda guardada.

## Cosas a saber
- El plan gratis de Supabase **pausa el proyecto tras 7 días sin uso**. Se reactiva desde el panel
  de Supabase con un clic; no se pierden datos. Mientras la usen cada semana no pasa.
- Haz un respaldo de vez en cuando desde **👤 (tu nombre) → Respaldo**.

## Probar en tu computadora
```
python -m http.server 8090
```
y abre <http://localhost:8090>.
