// Modo demo: mismos métodos que api-supabase.js pero guardando en este navegador.
// Sirve para probar la app sin cuenta de Supabase. Los datos de ejemplo son inventados.
const CLAVE = 'skincare-demo-v1';
const r2 = (n) => Math.round(n * 100) / 100;

function semilla() {
  const p = (id, nombre, categoria, precio_compra, precio_venta, stock) =>
    ({ id, nombre, categoria, precio_compra, precio_venta, stock, stock_minimo: 2 });
  return {
    sig: { productos: 9, ventas: 1, items: 1, entradas: 1 },
    productos: [
      p(1, 'Limpiador en espuma de arroz', 'Limpiador', 180, 320, 6),
      p(2, 'Tónico de centella', 'Tónico', 210, 380, 4),
      p(3, 'Esencia de caracol 96%', 'Esencia', 260, 450, 2),
      p(4, 'Serum de niacinamida', 'Serum', 230, 420, 5),
      p(5, 'Crema hidratante de ceramidas', 'Crema', 300, 520, 1),
      p(6, 'Protector solar de arroz SPF50', 'Protector solar', 240, 430, 0),
      p(7, 'Mascarilla de hoja (pieza)', 'Mascarilla', 25, 50, 20),
      p(8, 'Bálsamo labial de miel', 'Labial/Bálsamo', 90, 180, 3),
    ],
    ventas: [],
    entradas: [],
  };
}

export function crearApiDemo() {
  let db;
  try { db = JSON.parse(localStorage.getItem(CLAVE)); } catch { db = null; }
  if (!db) db = semilla();
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch { /* sin almacenamiento */ } };
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const enRango = (f, desde, hasta) => { const t = new Date(f).getTime(); return t >= desde.getTime() && t < hasta.getTime(); };
  const buscar = (id) => db.productos.find((p) => p.id === id);
  const usuario = { email: 'demo@ejemplo.com', nombre: 'Demo' };
  let conectado = true;

  return {
    demo: true,
    async sesion() { return conectado ? usuario : null; },
    async entrar() { conectado = true; return usuario; },
    async salir() { conectado = false; },

    async productos() { return copia(db.productos).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')); },
    async guardarProducto(p) {
      if (p.id) Object.assign(buscar(p.id), p);
      else db.productos.push({ ...p, id: db.sig.productos++ });
      guardar();
    },
    async eliminarProducto(id) {
      db.productos = db.productos.filter((p) => p.id !== id);
      db.ventas.forEach((v) => v.venta_items.forEach((i) => { if (i.producto_id === id) i.producto_id = null; }));
      guardar();
    },

    async registrarVenta(items) {
      if (!items.length) throw new Error('La venta no tiene productos');
      const pedido = new Map();
      for (const it of items) pedido.set(it.producto_id, (pedido.get(it.producto_id) || 0) + it.cantidad);
      for (const [id, cant] of pedido) {
        const p = buscar(id);
        if (!p) throw new Error('Uno de los productos ya no existe');
        if (p.stock < cant) throw new Error(`Stock insuficiente de "${p.nombre}": solo hay ${p.stock}`);
      }
      const venta = { id: db.sig.ventas++, fecha: new Date().toISOString(), total: 0, ganancia: 0, vendedor: usuario.nombre, venta_items: [] };
      for (const it of items) {
        const p = buscar(it.producto_id);
        const precio = it.precio_venta_u ?? p.precio_venta;
        p.stock -= it.cantidad;
        venta.venta_items.push({ id: db.sig.items++, venta_id: venta.id, producto_id: p.id, nombre: p.nombre, categoria: p.categoria,
          cantidad: it.cantidad, precio_compra_u: p.precio_compra, precio_venta_u: precio });
        venta.total = r2(venta.total + precio * it.cantidad);
        venta.ganancia = r2(venta.ganancia + (precio - p.precio_compra) * it.cantidad);
      }
      db.ventas.push(venta);
      guardar();
      return venta.id;
    },
    async ventas(desde, hasta) {
      return copia(db.ventas.filter((v) => enRango(v.fecha, desde, hasta))).sort((a, b) => b.fecha.localeCompare(a.fecha));
    },
    async eliminarVenta(id) {
      const v = db.ventas.find((x) => x.id === id);
      if (!v) return;
      v.venta_items.forEach((i) => { const p = buscar(i.producto_id); if (p) p.stock += i.cantidad; });
      db.ventas = db.ventas.filter((x) => x.id !== id);
      guardar();
    },

    async entradas(desde, hasta) {
      return copia(db.entradas.filter((e) => enRango(e.fecha, desde, hasta))).sort((a, b) => b.fecha.localeCompare(a.fecha));
    },
    async registrarEntrada(productoId, cantidad, costo, nota) {
      const p = buscar(productoId);
      if (!p) throw new Error('El producto ya no existe');
      p.stock += cantidad;
      p.precio_compra = costo;
      db.entradas.push({ id: db.sig.entradas++, fecha: new Date().toISOString(), producto_id: p.id, nombre: p.nombre,
        cantidad, costo_u: costo, nota: nota || null, registrado_por: usuario.nombre });
      guardar();
    },
    async eliminarEntrada(id) {
      const e = db.entradas.find((x) => x.id === id);
      if (!e) return;
      const p = buscar(e.producto_id);
      if (p) {
        if (p.stock < e.cantidad) throw new Error(`No se puede deshacer: de "${e.nombre}" ya se vendieron piezas de esa entrada (stock actual ${p.stock})`);
        p.stock -= e.cantidad;
      }
      db.entradas = db.entradas.filter((x) => x.id !== id);
      guardar();
    },
  };
}
