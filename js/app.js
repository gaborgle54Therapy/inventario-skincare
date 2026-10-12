import { SUPABASE_URL, SUPABASE_ANON_KEY, CATEGORIAS } from './config.js';
import { crearApiSupabase } from './api-supabase.js';
import { crearApiDemo } from './api-demo.js';

// ===================================================================== utilidades
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const moneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dinero = (n) => moneda.format(Number(n) || 0);
const r2 = (n) => Math.round(n * 100) / 100;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Acepta "350", "350.50", "350,50", "$1,200.50"
function aNumero(texto) {
  let t = String(texto ?? '').replace(/[$\s]/g, '');
  if (t.includes(',') && t.includes('.')) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  return t === '' || !/^-?\d*\.?\d+$/.test(t) ? NaN : Number(t);
}
const aEntero = (texto) => (/^\s*\d+\s*$/.test(String(texto ?? '')) ? parseInt(texto, 10) : NaN);

const hoy0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
function rangoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return [new Date(a, m - 1, 1), new Date(a, m, 1)];
}
const TODO = [new Date(2000, 0, 1), new Date(2100, 0, 1)];
const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fechaLarga = (f) => mayuscula(new Date(f).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));
const hora = (f) => new Date(f).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const fechaCorta = (f) => new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const nombreMes = (mes) => { const [a, m] = mes.split('-').map(Number); return new Date(a, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }); };

let temporizadorToast;
function toast(msg, esError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', esError);
  t.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.classList.remove('visible'), esError ? 5000 : 2500);
}

// Ejecuta una acción con el botón deshabilitado y muestra el error si falla.
async function intentar(boton, accion) {
  if (boton) boton.disabled = true;
  try { return await accion(); } catch (e) { toast(e.message || 'Algo salió mal', true); return undefined; } finally { if (boton) boton.disabled = false; }
}

// ===================================================================== estado
const api = SUPABASE_URL ? crearApiSupabase(SUPABASE_URL, SUPABASE_ANON_KEY) : crearApiDemo();
const estado = {
  usuario: null,
  productos: [],
  carrito: [], // { producto_id, cantidad, precio }
  vista: 'vender',
  buscarVender: '',
  inv: { texto: '', categoria: '', bajo: false },
  mesVentas: mesActual(),
  mesEntradas: mesActual(),
  periodo: 'mes',
  mesFinanzas: mesActual(),
};
const TITULOS = { vender: 'Vender', inventario: 'Inventario', entradas: 'Entradas', ventas: 'Ventas', finanzas: 'Finanzas' };
const V = () => $('#vista');
const producto = (id) => estado.productos.find((p) => p.id === id);
const esBajo = (p) => p.stock <= p.stock_minimo;
const normalizar = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const coincide = (p, texto) => !texto || normalizar(`${p.nombre} ${p.categoria}`).includes(normalizar(texto));

async function cargarProductos() {
  const filas = await api.productos();
  estado.productos = filas.map((p) => ({ ...p, precio_compra: Number(p.precio_compra), precio_venta: Number(p.precio_venta) }));
  // Quita del carrito lo que ya no existe o se quedó sin stock suficiente
  estado.carrito = estado.carrito.filter((c) => producto(c.producto_id))
    .map((c) => ({ ...c, cantidad: Math.min(c.cantidad, producto(c.producto_id).stock) }))
    .filter((c) => c.cantidad > 0);
}

// ===================================================================== navegación
async function mostrar(vista) {
  if (!TITULOS[vista]) vista = 'vender';
  estado.vista = vista;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('activo', a.dataset.vista === vista));
  $('#titulo-vista').textContent = TITULOS[vista];
  await VISTAS[vista]();
}
window.addEventListener('hashchange', () => mostrar(location.hash.slice(1)));

// ===================================================================== VENDER
function vistaVender() {
  V().innerHTML = `
    <div class="vender">
      <section>
        <div class="herramientas"><input id="buscar-v" type="search" placeholder="Buscar producto o categoría…" value="${esc(estado.buscarVender)}"></div>
        <div id="lista-v" class="lista"></div>
      </section>
      <aside id="carrito" class="carrito tarjeta"></aside>
    </div>`;
  $('#buscar-v').addEventListener('input', (e) => { estado.buscarVender = e.target.value; pintarListaVender(); });
  $('#lista-v').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) agregarAlCarrito(Number(b.dataset.id));
  });
  const carrito = $('#carrito');
  carrito.addEventListener('click', clicCarrito);
  carrito.addEventListener('change', (e) => {
    if (!e.target.matches('.precio-u')) return;
    const item = estado.carrito.find((c) => c.producto_id === Number(e.target.dataset.id));
    const n = aNumero(e.target.value);
    if (item && n >= 0) item.precio = r2(n);
    else toast('Precio inválido', true);
    pintarCarrito();
  });
  pintarListaVender();
  pintarCarrito();
}

const enCarrito = (id) => estado.carrito.find((c) => c.producto_id === id)?.cantidad || 0;

function pintarListaVender() {
  const lista = estado.productos.filter((p) => coincide(p, estado.buscarVender));
  $('#lista-v').innerHTML = lista.length ? lista.map((p) => {
    const disponible = p.stock - enCarrito(p.id);
    const clase = p.stock === 0 ? 'cero' : esBajo(p) ? 'bajo' : '';
    return `<button class="fila" data-id="${p.id}" ${disponible <= 0 ? 'disabled' : ''}>
      <span class="t">${esc(p.nombre)}</span><span class="d num"><b>${dinero(p.precio_venta)}</b></span>
      <span class="s">${esc(p.categoria)}</span><span class="d"><span class="badge ${clase}">${p.stock === 0 ? 'Agotado' : `${p.stock} en stock`}</span></span>
    </button>`;
  }).join('') : '<p class="vacio">No hay productos que coincidan.</p>';
}

function agregarAlCarrito(id) {
  const p = producto(id);
  const item = estado.carrito.find((c) => c.producto_id === id);
  if (enCarrito(id) >= p.stock) return toast(`Solo hay ${p.stock} de ${p.nombre}`, true);
  if (item) item.cantidad++;
  else estado.carrito.push({ producto_id: id, cantidad: 1, precio: p.precio_venta });
  pintarListaVender();
  pintarCarrito();
}

function totalesCarrito() {
  let total = 0; let ganancia = 0; let piezas = 0;
  for (const c of estado.carrito) {
    const p = producto(c.producto_id);
    total += c.precio * c.cantidad;
    ganancia += (c.precio - p.precio_compra) * c.cantidad;
    piezas += c.cantidad;
  }
  return { total: r2(total), ganancia: r2(ganancia), piezas };
}

function pintarCarrito() {
  const el = $('#carrito');
  if (!el) return;
  const { total, ganancia, piezas } = totalesCarrito();
  el.classList.toggle('vacio-carrito', piezas === 0);
  if (piezas === 0) el.classList.remove('abierto');
  const abierto = el.classList.contains('abierto');
  el.innerHTML = `
    <button type="button" class="carrito-resumen" data-accion="alternar">
      <span>🛒 ${piezas} ${piezas === 1 ? 'pieza' : 'piezas'} · <span class="num">${dinero(total)}</span></span>
      <span>${abierto ? 'Ocultar ▼' : 'Ver carrito ▲'}</span>
    </button>
    <div class="carrito-detalle">
      <h2>Carrito ${piezas ? '<button type="button" class="btn btn-gris btn-chico" data-accion="vaciar">Vaciar</button>' : ''}</h2>
      ${piezas === 0 ? '<p class="vacio">Toca un producto para agregarlo.</p>' : `
        <div class="carrito-items">
          ${estado.carrito.map((c) => {
            const p = producto(c.producto_id);
            const cambiado = c.precio !== p.precio_venta;
            return `<div class="item-carrito">
              <div class="t">${esc(p.nombre)}</div>
              <div class="item-controles">
                <span class="stepper">
                  <button type="button" data-accion="menos" data-id="${p.id}" aria-label="Quitar uno">−</button>
                  <span>${c.cantidad}</span>
                  <button type="button" data-accion="mas" data-id="${p.id}" aria-label="Agregar uno">+</button>
                </span>
                <span class="suave">×</span>
                <input class="precio-u" data-id="${p.id}" inputmode="decimal" value="${c.precio}" aria-label="Precio unitario">
                <span class="espacio"></span>
                <b class="num">${dinero(c.precio * c.cantidad)}</b>
                <button type="button" class="quitar" data-accion="quitar" data-id="${p.id}" aria-label="Quitar">✕</button>
              </div>
              ${cambiado ? `<div class="nota">Precio normal ${dinero(p.precio_venta)}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
        <div class="totales">
          <div class="total num">${dinero(total)}</div>
          <div class="suave">Ganancia de esta venta: <b class="${ganancia < 0 ? 'negativo' : 'positivo'}">${dinero(ganancia)}</b></div>
        </div>
        <button type="button" class="btn btn-dorado btn-bloque" data-accion="cobrar">Registrar venta</button>`}
    </div>`;
}

async function clicCarrito(e) {
  const b = e.target.closest('[data-accion]');
  if (!b) return;
  const id = Number(b.dataset.id);
  const item = estado.carrito.find((c) => c.producto_id === id);
  switch (b.dataset.accion) {
    case 'alternar': $('#carrito').classList.toggle('abierto'); break;
    case 'vaciar': estado.carrito = []; break;
    case 'quitar': estado.carrito = estado.carrito.filter((c) => c.producto_id !== id); break;
    case 'menos': item.cantidad--; if (item.cantidad <= 0) estado.carrito = estado.carrito.filter((c) => c !== item); break;
    case 'mas': return agregarAlCarrito(id);
    case 'cobrar': return cobrar(b);
  }
  pintarListaVender();
  pintarCarrito();
}

async function cobrar(boton) {
  const { total } = totalesCarrito();
  const items = estado.carrito.map((c) => ({ producto_id: c.producto_id, cantidad: c.cantidad, precio_venta_u: c.precio }));
  const ok = await intentar(boton, async () => { await api.registrarVenta(items); return true; });
  if (!ok) {
    await intentar(null, cargarProductos); // por si otro celular vendió primero
    pintarListaVender(); pintarCarrito();
    return;
  }
  estado.carrito = [];
  toast(`Venta registrada · ${dinero(total)}`);
  await intentar(null, cargarProductos);
  pintarListaVender();
  pintarCarrito();
}

// ===================================================================== INVENTARIO
function vistaInventario() {
  const f = estado.inv;
  V().innerHTML = `
    <div class="herramientas">
      <input id="buscar-i" type="search" placeholder="Buscar…" value="${esc(f.texto)}">
      <select id="cat-i"><option value="">Todas las categorías</option>${CATEGORIAS.map((c) => `<option ${c === f.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" id="bajo-i" ${f.bajo ? 'checked' : ''}> Solo stock bajo</label>
      <button type="button" class="btn btn-dorado" id="nuevo-i">+ Nuevo producto</button>
    </div>
    <p class="resumen" id="resumen-i"></p>
    <div id="lista-i" class="lista"></div>`;
  $('#buscar-i').addEventListener('input', (e) => { f.texto = e.target.value; pintarInventario(); });
  $('#cat-i').addEventListener('change', (e) => { f.categoria = e.target.value; pintarInventario(); });
  $('#bajo-i').addEventListener('change', (e) => { f.bajo = e.target.checked; pintarInventario(); });
  $('#nuevo-i').addEventListener('click', () => abrirProducto(null));
  $('#lista-i').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) abrirProducto(producto(Number(b.dataset.id)));
  });
  pintarInventario();
}

function pintarInventario() {
  const f = estado.inv;
  const lista = estado.productos.filter((p) => coincide(p, f.texto) && (!f.categoria || p.categoria === f.categoria) && (!f.bajo || esBajo(p)));
  const piezas = lista.reduce((s, p) => s + p.stock, 0);
  const costo = lista.reduce((s, p) => s + p.stock * p.precio_compra, 0);
  $('#resumen-i').textContent = `${plural(lista.length, 'producto', 'productos')} · ${plural(piezas, 'pieza', 'piezas')} · ${dinero(costo)} invertido`;
  $('#lista-i').innerHTML = lista.length ? lista.map((p) => {
    const margen = p.precio_venta > 0 ? Math.round(((p.precio_venta - p.precio_compra) / p.precio_venta) * 100) : 0;
    const clase = p.stock === 0 ? 'cero' : esBajo(p) ? 'bajo' : '';
    return `<button class="fila" data-id="${p.id}">
      <span class="t">${esc(p.nombre)}</span><span class="d"><span class="badge ${clase}">${p.stock} pzs</span></span>
      <span class="s">${esc(p.categoria)} · costo ${dinero(p.precio_compra)} · margen ${margen}%</span><span class="d num"><b>${dinero(p.precio_venta)}</b></span>
    </button>`;
  }).join('') : '<p class="vacio">No hay productos que coincidan.</p>';
}

function abrirProducto(p) {
  const dlg = $('#dlg-producto');
  const form = $('#form-producto');
  form.reset();
  $('#producto-error').hidden = true;
  form.categoria.innerHTML = CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join('');
  $('#dlg-producto-titulo').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('#btn-eliminar-producto').hidden = !p;
  form.id.value = p?.id ?? '';
  form.nombre.value = p?.nombre ?? '';
  if (p && !CATEGORIAS.includes(p.categoria)) form.categoria.insertAdjacentHTML('beforeend', `<option>${esc(p.categoria)}</option>`);
  form.categoria.value = p?.categoria ?? 'Serum';
  form.precio_compra.value = p?.precio_compra ?? '';
  form.precio_venta.value = p?.precio_venta ?? '';
  form.stock.value = p?.stock ?? 0;
  form.stock_minimo.value = p?.stock_minimo ?? 2;
  actualizarMargen();
  dlg.showModal();
}

function actualizarMargen() {
  const form = $('#form-producto');
  const c = aNumero(form.precio_compra.value); const v = aNumero(form.precio_venta.value);
  $('#producto-margen').textContent = c >= 0 && v > 0
    ? `Ganas ${dinero(v - c)} por pieza (${Math.round(((v - c) / v) * 100)}% del precio).` : '';
}

function leerFormularioProducto() {
  const form = $('#form-producto');
  const datos = {
    nombre: form.nombre.value.trim(),
    categoria: form.categoria.value,
    precio_compra: aNumero(form.precio_compra.value),
    precio_venta: aNumero(form.precio_venta.value),
    stock: aEntero(form.stock.value),
    stock_minimo: aEntero(form.stock_minimo.value),
  };
  if (!datos.nombre) return 'Escribe el nombre del producto.';
  if (!(datos.precio_compra >= 0) || !(datos.precio_venta >= 0)) return 'Los precios deben ser números positivos.';
  if (Number.isNaN(datos.stock) || Number.isNaN(datos.stock_minimo)) return 'El stock debe ser un número entero (0 o más).';
  datos.precio_compra = r2(datos.precio_compra);
  datos.precio_venta = r2(datos.precio_venta);
  if (form.id.value) datos.id = Number(form.id.value);
  return datos;
}

function iniciarDialogoProducto() {
  const form = $('#form-producto');
  form.precio_compra.addEventListener('input', actualizarMargen);
  form.precio_venta.addEventListener('input', actualizarMargen);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = leerFormularioProducto();
    const err = $('#producto-error');
    if (typeof datos === 'string') { err.textContent = datos; err.hidden = false; return; }
    const ok = await intentar(e.submitter, async () => { await api.guardarProducto(datos); await cargarProductos(); return true; });
    if (!ok) return;
    $('#dlg-producto').close();
    toast(datos.id ? 'Producto actualizado' : 'Producto agregado');
    mostrar(estado.vista);
  });
  $('#btn-eliminar-producto').addEventListener('click', async (e) => {
    const id = Number(form.id.value);
    const p = producto(id);
    if (!confirm(`¿Eliminar "${p.nombre}"?\n\nLas ventas pasadas se conservan con su nombre.`)) return;
    const ok = await intentar(e.currentTarget, async () => { await api.eliminarProducto(id); await cargarProductos(); return true; });
    if (!ok) return;
    $('#dlg-producto').close();
    toast('Producto eliminado');
    mostrar(estado.vista);
  });
}

// ===================================================================== ENTRADAS
async function vistaEntradas() {
  V().innerHTML = `
    <form id="form-entrada" class="tarjeta">
      <h2>Registrar mercancía que llegó</h2>
      <label>Producto<select name="producto" required>
        <option value="">Elige un producto…</option>
        ${estado.productos.map((p) => `<option value="${p.id}">${esc(p.nombre)} (hay ${p.stock})</option>`).join('')}
      </select></label>
      <div class="fila-2">
        <label>Piezas que llegaron<input name="cantidad" inputmode="numeric" required></label>
        <label>Costo por pieza<input name="costo" inputmode="decimal" required></label>
      </div>
      <label>Nota (opcional)<input name="nota" maxlength="200" placeholder="Ej. pedido de Corea, proveedor…"></label>
      <p class="nota">El costo del producto se actualiza con este costo.</p>
      <button type="submit" class="btn btn-dorado btn-bloque">Registrar entrada</button>
    </form>
    <h3 style="margin:22px 0 10px">Historial</h3>
    <div class="segmento"><input type="month" id="mes-e" value="${estado.mesEntradas}"></div>
    <div id="lista-e" class="lista"><p class="vacio">Cargando…</p></div>`;
  const form = $('#form-entrada');
  form.producto.addEventListener('change', () => {
    const p = producto(Number(form.producto.value));
    form.costo.value = p ? p.precio_compra : '';
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number(form.producto.value);
    const cantidad = aEntero(form.cantidad.value);
    const costo = aNumero(form.costo.value);
    if (!id) return toast('Elige un producto', true);
    if (!(cantidad > 0)) return toast('Las piezas deben ser un número entero mayor a 0', true);
    if (!(costo >= 0)) return toast('El costo debe ser un número', true);
    const ok = await intentar(e.submitter, async () => {
      await api.registrarEntrada(id, cantidad, r2(costo), form.nota.value.trim());
      await cargarProductos();
      return true;
    });
    if (!ok) return;
    toast(`+${cantidad} piezas de ${producto(id).nombre}`);
    estado.mesEntradas = mesActual();
    vistaEntradas();
  });
  $('#mes-e').addEventListener('change', (e) => { if (e.target.value) { estado.mesEntradas = e.target.value; pintarEntradas(); } });
  $('#lista-e').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-borrar]');
    if (!b || !confirm('¿Deshacer esta entrada? Las piezas se restan del stock.')) return;
    const ok = await intentar(b, async () => { await api.eliminarEntrada(Number(b.dataset.borrar)); await cargarProductos(); return true; });
    if (ok) { toast('Entrada deshecha'); vistaEntradas(); }
  });
  await pintarEntradas();
}

async function pintarEntradas() {
  const lista = await intentar(null, () => api.entradas(...rangoMes(estado.mesEntradas)));
  if (!lista) return;
  $('#lista-e').innerHTML = lista.length ? lista.map((e) => `
    <div class="fila" style="cursor:default">
      <span class="t">+${e.cantidad} · ${esc(e.nombre)}</span>
      <span class="d num">${dinero(e.cantidad * e.costo_u)}</span>
      <span class="s">${fechaCorta(e.fecha)} · ${dinero(e.costo_u)} c/u${e.registrado_por ? ` · ${esc(e.registrado_por)}` : ''}${e.nota ? ` · ${esc(e.nota)}` : ''}</span>
      <span class="d"><button type="button" class="btn btn-peligro btn-chico" data-borrar="${e.id}">Deshacer</button></span>
    </div>`).join('') : `<p class="vacio">Sin entradas en ${nombreMes(estado.mesEntradas)}.</p>`;
}

// ===================================================================== VENTAS
async function vistaVentas() {
  V().innerHTML = `
    <div class="segmento"><input type="month" id="mes-v" value="${estado.mesVentas}"></div>
    <p class="resumen" id="resumen-v"></p>
    <div id="lista-ventas"><p class="vacio">Cargando…</p></div>`;
  $('#mes-v').addEventListener('change', (e) => { if (e.target.value) { estado.mesVentas = e.target.value; pintarVentas(); } });
  $('#lista-ventas').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-borrar]');
    if (!b || !confirm('¿Eliminar esta venta? Las piezas regresan al inventario.')) return;
    const ok = await intentar(b, async () => { await api.eliminarVenta(Number(b.dataset.borrar)); await cargarProductos(); return true; });
    if (ok) { toast('Venta eliminada'); pintarVentas(); }
  });
  await pintarVentas();
}

async function pintarVentas() {
  const ventas = await intentar(null, () => api.ventas(...rangoMes(estado.mesVentas)));
  if (!ventas) return;
  const total = ventas.reduce((s, v) => s + Number(v.total), 0);
  const ganancia = ventas.reduce((s, v) => s + Number(v.ganancia), 0);
  $('#resumen-v').textContent = `${plural(ventas.length, 'venta', 'ventas')} en ${nombreMes(estado.mesVentas)} · ${dinero(total)} vendidos · ${dinero(ganancia)} de ganancia`;
  let diaPrevio = '';
  $('#lista-ventas').innerHTML = ventas.length ? ventas.map((v) => {
    const dia = fechaLarga(v.fecha);
    const cab = dia !== diaPrevio ? `<div class="dia">${dia}</div>` : '';
    diaPrevio = dia;
    return `${cab}<div class="venta">
      <div class="venta-cab"><span>${hora(v.fecha)}${v.vendedor ? ` · ${esc(v.vendedor)}` : ''}</span><span>#${v.id}</span></div>
      <ul class="venta-items">${v.venta_items.map((i) => `<li><span>${i.cantidad} × ${esc(i.nombre)}</span><span class="num">${dinero(i.cantidad * i.precio_venta_u)}</span></li>`).join('')}</ul>
      <div class="venta-pie">
        <span><b class="num">${dinero(v.total)}</b> <span class="suave">· ganancia ${dinero(v.ganancia)}</span></span>
        <button type="button" class="btn btn-peligro btn-chico" data-borrar="${v.id}">Eliminar</button>
      </div>
    </div>`;
  }).join('') : `<p class="vacio">Sin ventas en ${nombreMes(estado.mesVentas)}.</p>`;
}

// ===================================================================== FINANZAS
function rangoPeriodo() {
  const h = hoy0();
  switch (estado.periodo) {
    case 'hoy': return [h, sumarDias(h, 1), 'hoy'];
    case 'semana': { const lunes = sumarDias(h, -((h.getDay() + 6) % 7)); return [lunes, sumarDias(lunes, 7), 'esta semana']; }
    default: return [...rangoMes(estado.mesFinanzas), nombreMes(estado.mesFinanzas)];
  }
}

async function vistaFinanzas() {
  const botones = [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Mes']];
  V().innerHTML = `
    <div class="segmento" id="periodo">
      ${botones.map(([k, t]) => `<button type="button" data-p="${k}" class="${estado.periodo === k ? 'activo' : ''}">${t}</button>`).join('')}
      <input type="month" id="mes-f" value="${estado.mesFinanzas}" ${estado.periodo === 'mes' ? '' : 'hidden'}>
    </div>
    <div id="fin-ventas"><p class="vacio">Cargando…</p></div>
    <h3 style="margin:6px 0 10px">Inventario actual</h3>
    <div class="stats" id="fin-inv"></div>
    <div id="fin-alertas"></div>`;
  $('#periodo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    estado.periodo = b.dataset.p;
    if (b.dataset.p === 'mes') estado.mesFinanzas = mesActual();
    vistaFinanzas();
  });
  $('#mes-f').addEventListener('change', (e) => { if (e.target.value) { estado.mesFinanzas = e.target.value; pintarFinanzasVentas(); } });

  const ps = estado.productos;
  const costo = ps.reduce((s, p) => s + p.stock * p.precio_compra, 0);
  const venta = ps.reduce((s, p) => s + p.stock * p.precio_venta, 0);
  $('#fin-inv').innerHTML = [
    ['Invertido (a costo)', dinero(costo)],
    ['Valor a precio de venta', dinero(venta)],
    ['Ganancia si se vende todo', dinero(venta - costo), 'oro'],
    ['Piezas en tienda', ps.reduce((s, p) => s + p.stock, 0)],
  ].map(([k, v, c]) => `<div class="stat ${c || ''}"><div class="k">${k}</div><div class="v num">${v}</div></div>`).join('');

  const bajos = ps.filter(esBajo).sort((a, b) => a.stock - b.stock);
  $('#fin-alertas').innerHTML = `<div class="alertas">
    <b>⚠ Por resurtir (${bajos.length})</b>
    ${bajos.length ? `<ul>${bajos.map((p) => `<li>${esc(p.nombre)} — <b>${p.stock === 0 ? 'agotado' : `quedan ${p.stock}`}</b></li>`).join('')}</ul>` : '<p class="suave">Todo con buen stock.</p>'}
  </div>`;
  await pintarFinanzasVentas();
}

async function pintarFinanzasVentas() {
  const [desde, hasta, etiqueta] = rangoPeriodo();
  const ventas = await intentar(null, () => api.ventas(desde, hasta));
  if (!ventas) return;
  const ingresos = ventas.reduce((s, v) => s + Number(v.total), 0);
  const ganancia = ventas.reduce((s, v) => s + Number(v.ganancia), 0);
  const porProducto = new Map();
  let piezas = 0;
  for (const v of ventas) for (const i of v.venta_items) {
    piezas += i.cantidad;
    const x = porProducto.get(i.nombre) || { piezas: 0, total: 0 };
    x.piezas += i.cantidad; x.total += i.cantidad * i.precio_venta_u;
    porProducto.set(i.nombre, x);
  }
  const top = [...porProducto].sort((a, b) => b[1].piezas - a[1].piezas || b[1].total - a[1].total).slice(0, 5);
  const margen = ingresos > 0 ? Math.round((ganancia / ingresos) * 100) : 0;
  $('#fin-ventas').innerHTML = `
    <p class="resumen">Ventas de ${etiqueta}</p>
    <div class="stats">
      <div class="stat"><div class="k">Vendido</div><div class="v num">${dinero(ingresos)}</div></div>
      <div class="stat oro"><div class="k">Ganancia (${margen}%)</div><div class="v num">${dinero(ganancia)}</div></div>
      <div class="stat"><div class="k">Ventas</div><div class="v num">${ventas.length}</div></div>
      <div class="stat"><div class="k">Piezas vendidas</div><div class="v num">${piezas}</div></div>
    </div>
    ${top.length ? `<div class="tarjeta top" style="margin-bottom:18px"><b>Lo más vendido</b><ol>${top.map(([n, x]) => `<li>${esc(n)} — ${x.piezas} pzs · <span class="num">${dinero(x.total)}</span></li>`).join('')}</ol></div>` : ''}`;
}

const VISTAS = { vender: vistaVender, inventario: vistaInventario, entradas: vistaEntradas, ventas: vistaVentas, finanzas: vistaFinanzas };

// ===================================================================== CUENTA / RESPALDO
function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const celda = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (filas) => '﻿' + filas.map((f) => f.map(celda).join(',')).join('\r\n');
const sello = () => new Date().toISOString().slice(0, 10);

function iniciarCuenta() {
  const dlg = $('#dlg-cuenta');
  $('#btn-cuenta').addEventListener('click', () => {
    $('#cuenta-info').innerHTML = `Sesión de <b>${esc(estado.usuario.nombre)}</b><br><span class="suave">${esc(estado.usuario.email)}</span>`;
    dlg.showModal();
  });
  $('#btn-csv-productos').addEventListener('click', () => {
    descargar(`productos_${sello()}.csv`, csv([
      ['Nombre', 'Categoría', 'Costo', 'Precio venta', 'Stock', 'Avisar con'],
      ...estado.productos.map((p) => [p.nombre, p.categoria, p.precio_compra, p.precio_venta, p.stock, p.stock_minimo]),
    ]), 'text/csv;charset=utf-8');
  });
  $('#btn-csv-ventas').addEventListener('click', (e) => intentar(e.currentTarget, async () => {
    const ventas = await api.ventas(...TODO);
    const filas = [['Fecha', 'Venta', 'Vendió', 'Producto', 'Categoría', 'Cantidad', 'Precio unitario', 'Costo unitario', 'Total', 'Ganancia']];
    for (const v of [...ventas].reverse()) for (const i of v.venta_items) {
      filas.push([new Date(v.fecha).toLocaleString('es-MX'), v.id, v.vendedor, i.nombre, i.categoria, i.cantidad, i.precio_venta_u, i.precio_compra_u,
        r2(i.cantidad * i.precio_venta_u), r2(i.cantidad * (i.precio_venta_u - i.precio_compra_u))]);
    }
    descargar(`ventas_${sello()}.csv`, csv(filas), 'text/csv;charset=utf-8');
  }));
  $('#btn-json').addEventListener('click', (e) => intentar(e.currentTarget, async () => {
    const [ventas, entradas] = await Promise.all([api.ventas(...TODO), api.entradas(...TODO)]);
    const respaldo = { generado: new Date().toISOString(), productos: estado.productos, ventas, entradas };
    descargar(`respaldo_skincare_${sello()}.json`, JSON.stringify(respaldo, null, 2), 'application/json');
  }));
  $('#btn-salir').addEventListener('click', async () => {
    await api.salir();
    location.hash = '';
    location.reload();
  });
}

// ===================================================================== arranque
function mostrarLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

async function entrarApp(usuario) {
  estado.usuario = usuario;
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#btn-cuenta').textContent = `👤 ${usuario.nombre}`;
  $('#aviso-demo').hidden = !api.demo;
  await intentar(null, cargarProductos);
  await mostrar(location.hash.slice(1) || 'vender');
}

async function iniciar() {
  document.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  iniciarDialogoProducto();
  iniciarCuenta();

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const error = $('#login-error');
    error.hidden = true;
    const boton = e.submitter;
    boton.disabled = true;
    try {
      await entrarApp(await api.entrar(f.email.value.trim(), f.password.value));
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });

  // Al volver a la app (cambiar de pestaña o desbloquear el cel) trae lo que haya vendido la otra persona.
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !estado.usuario || document.querySelector('dialog[open]')) return;
    await intentar(null, cargarProductos);
    if (document.activeElement?.matches('input, select')) return;
    mostrar(estado.vista);
  });

  let usuario = null;
  try { usuario = await api.sesion(); } catch (e) { $('#login-error').textContent = e.message; $('#login-error').hidden = false; }
  if (usuario) await entrarApp(usuario);
  else mostrarLogin();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

iniciar();
