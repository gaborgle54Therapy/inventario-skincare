"""Genera supabase/migracion.sql con los productos y ventas del programa de escritorio.

Uso:
    python herramientas/migrar.py "C:\\Users\\gabor\\InventarioSkincare\\inventario.db"

La base de datos se abre en modo solo lectura; no se modifica nada.
El archivo generado contiene tus datos reales: no lo subas a GitHub (.gitignore ya lo excluye).
"""
import os
import sqlite3
import sys

ZONA_HORARIA = "America/Mexico_City"
STOCK_MINIMO = 2
SALIDA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "supabase", "migracion.sql")


def lit(valor):
    if valor is None:
        return "null"
    if isinstance(valor, (int, float)):
        return repr(round(valor, 2)) if isinstance(valor, float) else str(valor)
    return "'" + str(valor).replace("'", "''") + "'"


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    origen = os.path.abspath(sys.argv[1])
    conn = sqlite3.connect(f"file:{origen}?mode=ro", uri=True)

    productos = conn.execute(
        "SELECT id, nombre, categoria, precio_compra, precio_venta, stock FROM productos ORDER BY id"
    ).fetchall()
    ids_productos = {p[0] for p in productos}
    ventas = conn.execute(
        "SELECT id, producto_id, nombre, categoria, cantidad, precio_compra_u, precio_venta_u, total, ganancia, fecha "
        "FROM ventas ORDER BY id"
    ).fetchall()

    lineas = [
        "-- Migración desde el programa de escritorio (generado por herramientas/migrar.py)",
        "-- Pégalo en Supabase → SQL Editor DESPUÉS de esquema.sql, con las tablas vacías.",
        "begin;",
        "",
    ]
    for (pid, nombre, categoria, compra, venta, stock) in productos:
        lineas.append(
            "insert into public.productos (id, nombre, categoria, precio_compra, precio_venta, stock, stock_minimo) values "
            f"({pid}, {lit(nombre)}, {lit(categoria)}, {lit(compra)}, {lit(venta)}, {stock}, {STOCK_MINIMO});"
        )
    lineas.append("")
    for (vid, pid, nombre, categoria, cantidad, compra_u, venta_u, total, ganancia, fecha) in ventas:
        fecha_sql = f"({lit(fecha)}::timestamp at time zone {lit(ZONA_HORARIA)})"
        lineas.append(
            "insert into public.ventas (id, fecha, total, ganancia, vendedor) values "
            f"({vid}, {fecha_sql}, {lit(total)}, {lit(ganancia)}, 'Programa anterior');"
        )
        producto_id = pid if pid in ids_productos else None
        lineas.append(
            "insert into public.venta_items (venta_id, producto_id, nombre, categoria, cantidad, precio_compra_u, precio_venta_u) values "
            f"({vid}, {lit(producto_id)}, {lit(nombre)}, {lit(categoria)}, {cantidad}, {lit(compra_u)}, {lit(venta_u)});"
        )
    lineas += [
        "",
        "-- Que los nuevos registros sigan después de los migrados",
        "select setval(pg_get_serial_sequence('public.productos', 'id'), coalesce((select max(id) from public.productos), 1));",
        "select setval(pg_get_serial_sequence('public.ventas', 'id'), coalesce((select max(id) from public.ventas), 1));",
        "",
        "commit;",
        "",
    ]

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as f:
        f.write("\n".join(lineas))
    print(f"{len(productos)} productos y {len(ventas)} ventas -> {SALIDA}")


if __name__ == "__main__":
    main()
