// Acceso a datos en Supabase. Todas las funciones lanzan Error con un mensaje en español.
export function crearApiSupabase(url, llave) {
  const sb = window.supabase.createClient(url, llave);

  const MENSAJES = [
    [/Invalid login credentials/i, 'Correo o contraseña incorrectos.'],
    [/Failed to fetch|NetworkError|Load failed/i, 'Sin conexión a internet. Intenta de nuevo.'],
    [/JWT expired/i, 'Tu sesión expiró. Vuelve a entrar.'],
  ];
  function traducir(error) {
    const msg = error?.message || String(error);
    const hallado = MENSAJES.find(([re]) => re.test(msg));
    return new Error(hallado ? hallado[1] : msg);
  }
  async function q(peticion) {
    let r;
    try { r = await peticion; } catch (e) { throw traducir(e); }
    if (r.error) throw traducir(r.error);
    return r.data;
  }

  return {
    demo: false,

    async sesion() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const nombre = await q(sb.rpc('mi_nombre'));
      if (!nombre) {
        await sb.auth.signOut();
        throw new Error('Tu usuario existe pero no está dado de alta como socio (tabla miembros).');
      }
      return { email: data.session.user.email, nombre };
    },
    async entrar(email, password) {
      await q(sb.auth.signInWithPassword({ email, password }));
      return this.sesion();
    },
    async salir() { await sb.auth.signOut(); },

    productos: () => q(sb.from('productos').select('*').order('nombre')),
    async guardarProducto(p) {
      const { id, ...datos } = p;
      if (id) await q(sb.from('productos').update(datos).eq('id', id));
      else await q(sb.from('productos').insert(datos));
    },
    eliminarProducto: (id) => q(sb.from('productos').delete().eq('id', id)),

    registrarVenta: (items) => q(sb.rpc('registrar_venta', { items })),
    ventas: (desde, hasta) => q(sb.from('ventas').select('*, venta_items(*)')
      .gte('fecha', desde.toISOString()).lt('fecha', hasta.toISOString())
      .order('fecha', { ascending: false })),
    eliminarVenta: (id) => q(sb.rpc('eliminar_venta', { p_id: id })),

    entradas: (desde, hasta) => q(sb.from('entradas').select('*')
      .gte('fecha', desde.toISOString()).lt('fecha', hasta.toISOString())
      .order('fecha', { ascending: false })),
    registrarEntrada: (productoId, cantidad, costo, nota) => q(sb.rpc('registrar_entrada', {
      p_producto_id: productoId, p_cantidad: cantidad, p_costo_u: costo, p_nota: nota,
    })),
    eliminarEntrada: (id) => q(sb.rpc('eliminar_entrada', { p_id: id })),
  };
}
