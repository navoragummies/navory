/* =====================================================================
   PANEL DE ADMIN — Návora Gummies
   Pedidos · Productos · Textos · Contacto, con vista previa en vivo.
   ===================================================================== */
(() => {
  "use strict";

  const CFG = window.NAVORA_CONFIG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lleno = (v) => typeof v === "string" && v.trim() !== "";
  const fmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  const plata = (n) => "$ " + fmt.format(Math.round(Number(n) || 0));

  function waNumero(txt) {
    let d = String(txt || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("549")) return d;
    if (d.startsWith("54")) return "549" + d.slice(2);
    if (d.startsWith("0")) d = d.slice(1);
    if (d.startsWith("15") && d.length === 10) d = "11" + d.slice(2);
    return "549" + d;
  }

  function fotoSegura(url) {
    if (!lleno(url)) return "";
    if (/^assets\/[\w\-./]+$/.test(url)) return url;
    try { const u = new URL(url); if (u.protocol === "https:") return u.href; } catch (_) {}
    return "";
  }

  function hace(fecha) {
    const s = (Date.now() - new Date(fecha).getTime()) / 1000;
    if (s < 60) return "recién";
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
    return new Date(fecha).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  }
  const fechaCorta = (iso) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }) : "";

  /* ---------- avisos ---------- */
  const toastEl = $("#toast");
  let toastT;
  function toast(txt, tipo = "ok") {
    toastEl.textContent = txt;
    toastEl.dataset.tipo = tipo;
    toastEl.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("is-on"), 2600);
  }

  const dlgOk = $("#dlg-ok");
  function confirmar(texto, si = "Sí, borrar") {
    return new Promise((res) => {
      $("#ok-t").textContent = texto;
      $("#ok-si").textContent = si;
      const fin = (v) => { dlgOk.close(); $("#ok-si").onclick = $("#ok-no").onclick = null; res(v); };
      $("#ok-si").onclick = () => fin(true);
      $("#ok-no").onclick = () => fin(false);
      dlgOk.oncancel = (e) => { e.preventDefault(); fin(false); };
      dlgOk.showModal();
    });
  }

  function confeti(el) {
    const r = el.getBoundingClientRect();
    const bits = ["🍬", "✨", "💗", "🍭", "🎀"];
    for (let i = 0; i < 12; i++) {
      const b = document.createElement("span");
      b.className = "confetti-bit";
      b.textContent = bits[i % bits.length];
      b.style.left = `${r.left + r.width / 2}px`;
      b.style.top = `${r.top + r.height / 2}px`;
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 80;
      b.style.setProperty("--fin", `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d - 50}px) rotate(${Math.random() * 360}deg) scale(.5)`);
      document.body.appendChild(b);
      setTimeout(() => b.remove(), 950);
    }
  }

  /* =====================================================================
     SESIÓN
     ===================================================================== */
  const vistas = { boot: $("#v-boot"), login: $("#v-login"), app: $("#v-app") };
  function mostrar(cual) {
    for (const [k, el] of Object.entries(vistas)) el.hidden = k !== cual;
  }

  if (!window.supabase || !CFG.url || !CFG.key) {
    mostrar("login");
    $("#l-msg").textContent = "No se pudo conectar con la base. Revisá tu conexión y recargá.";
    return;
  }

  const sb = window.supabase.createClient(CFG.url, CFG.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  let arrancado = false;
  let modoReset = false;

  async function entrarConSesion(session) {
    if (modoReset) return;
    if (!session) { arrancado = false; mostrar("login"); setTimeout(() => $("#l-mail").focus(), 50); return; }
    const { data, error } = await sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
    if (error || !data) {
      await sb.auth.signOut();
      mostrar("login");
      $("#l-msg").textContent = "Esta cuenta no tiene permiso para entrar al panel.";
      return;
    }
    if (arrancado) return;
    arrancado = true;
    mostrar("app");
    iniciarPanel();
  }

  sb.auth.onAuthStateChange((evento, session) => {
    if (evento === "PASSWORD_RECOVERY") {
      modoReset = true;
      mostrar("login");
      $("#f-login").hidden = true;
      $("#f-reset").hidden = false;
      setTimeout(() => $("#r-pass").focus(), 50);
      return;
    }
    if (evento === "SIGNED_OUT") { arrancado = false; mostrar("login"); }
    if (evento === "INITIAL_SESSION" || evento === "SIGNED_IN") setTimeout(() => entrarConSesion(session), 0);
  });

  $("#f-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#l-msg");
    const btn = e.submitter || $("#f-login button[type=submit]");
    msg.textContent = "";
    btn.disabled = true;
    btn.classList.add("is-busy");
    const { error } = await sb.auth.signInWithPassword({ email: $("#l-mail").value.trim(), password: $("#l-pass").value });
    btn.disabled = false;
    btn.classList.remove("is-busy");
    if (error) {
      msg.textContent = /invalid/i.test(error.message) ? "Mail o contraseña incorrectos." : "No se pudo entrar. Probá de nuevo en un rato.";
      $("#f-login").classList.remove("shake"); void $("#f-login").offsetWidth; $("#f-login").classList.add("shake");
    }
  });

  $("#b-olvide").addEventListener("click", async () => {
    const mail = $("#l-mail").value.trim();
    const msg = $("#l-msg");
    if (!mail) { msg.textContent = "Escribí tu mail arriba y tocá de nuevo acá."; $("#l-mail").focus(); return; }
    const redirectTo = location.href.split("#")[0].split("?")[0];
    const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo });
    msg.textContent = error ? "No se pudo mandar el mail. Probá en un rato." : "Listo: te mandamos un mail para crear una contraseña nueva.";
  });

  $("#f-reset").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = $("#r-pass").value;
    const msg = $("#r-msg");
    if (pass.length < 8) { msg.textContent = "Tiene que tener al menos 8 caracteres."; return; }
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) { msg.textContent = "No se pudo guardar. Pedí otro mail de recuperación."; return; }
    modoReset = false;
    $("#f-reset").hidden = true;
    $("#f-login").hidden = false;
    history.replaceState(null, "", location.pathname);
    const { data } = await sb.auth.getSession();
    entrarConSesion(data.session);
    toast("Contraseña nueva guardada ✓");
  });

  $("#b-salir").addEventListener("click", async () => {
    if (hayCambios() && !(await confirmar("Tenés cambios sin guardar. ¿Salir igual?", "Salir igual"))) return;
    descartar();
    await sb.auth.signOut();
  });

  /* =====================================================================
     ESTADO
     ===================================================================== */
  let vista = "pedidos";
  let productos = [];
  let pedidos = [];
  let contenidoGuardado = {};
  let contenido = {};
  let filtroPedidos = "activos";
  let prodBorrador = null; // producto que se está editando (para la vista previa)

  const hayCambios = () => JSON.stringify(contenido) !== JSON.stringify(contenidoGuardado);

  async function cargarTodo() {
    const [c, p, o] = await Promise.all([
      sb.from("contenido").select("datos").eq("id", 1).maybeSingle(),
      sb.from("productos").select("*").order("orden", { ascending: true }),
      sb.from("pedidos").select("*").order("created_at", { ascending: false }).limit(300)
    ]);
    if (c.error || p.error || o.error) throw c.error || p.error || o.error;
    contenidoGuardado = c.data?.datos || {};
    contenido = structuredClone(contenidoGuardado);
    productos = p.data || [];
    pedidos = o.data || [];
  }

  async function recargarPedidos(silencioso) {
    const { data, error } = await sb.from("pedidos").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) { if (!silencioso) toast("No se pudieron traer los pedidos", "error"); return; }
    const antes = new Set(pedidos.map((x) => x.id));
    const nuevos = data.filter((x) => !antes.has(x.id));
    pedidos = data;
    pintarBadge();
    if (nuevos.length && silencioso) toast(`🎉 ${nuevos.length === 1 ? "Entró un pedido nuevo" : `Entraron ${nuevos.length} pedidos nuevos`}`);
    if (vista === "pedidos") render();
  }

  function pintarBadge() {
    const n = pedidos.filter((x) => x.estado === "nuevo").length;
    const b = $("#badge-nuevos");
    b.hidden = n === 0;
    b.textContent = n;
    document.title = (n ? `(${n}) ` : "") + "Panel · Návora Gummies";
  }

  /* =====================================================================
     ARRANQUE
     ===================================================================== */
  let panelListo = false;
  async function iniciarPanel() {
    $("#main").innerHTML = `<div class="loading"><span></span><span></span><span></span></div>`;
    try {
      await cargarTodo();
    } catch (err) {
      $("#main").innerHTML = `<div class="empty"><span>😵</span><p>No se pudieron cargar los datos.</p><button class="btn" type="button" onclick="location.reload()">Reintentar</button></div>`;
      return;
    }
    pintarBadge();
    if (!panelListo) {
      panelListo = true;
      $$(".tab").forEach((t) => t.addEventListener("click", () => irA(t.dataset.vista)));
      setInterval(() => { if (!document.hidden) recargarPedidos(true); }, 60000);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) recargarPedidos(true); });
    }
    const pedida = (location.hash || "").slice(1);
    irA(["pedidos", "productos", "textos", "contacto"].includes(pedida) ? pedida : "pedidos", true);
  }

  async function irA(v, forzar) {
    if (v === vista && !forzar) return;
    vista = v;
    history.replaceState(null, "", "#" + v);
    $$(".tab").forEach((t) => {
      const on = t.dataset.vista === v;
      t.classList.toggle("is-on", on);
      t.setAttribute("aria-current", on ? "page" : "false");
    });
    $("#layout").classList.toggle("sin-preview", v === "pedidos");
    $("#b-prev-abrir").hidden = v === "pedidos";
    render();
    const panel = { productos: 1, textos: 0, contacto: 2 }[v];
    if (panel !== undefined) prev({ tipo: "ir", panel });
  }

  function render() {
    const main = $("#main");
    main.classList.remove("entra"); void main.offsetWidth; main.classList.add("entra");
    if (vista === "pedidos") renderPedidos();
    if (vista === "productos") renderProductos();
    if (vista === "textos") renderForm(CAMPOS_TEXTOS, "Textos de la web", "Lo que se lee en Inicio y en Productos.");
    if (vista === "contacto") renderForm(CAMPOS_CONTACTO, "Contacto", "Datos de contacto. Los pedidos de la web llegan al primer WhatsApp.");
  }

  /* =====================================================================
     PEDIDOS
     ===================================================================== */
  const ESTADOS = {
    nuevo:      { t: "Nuevo",      e: "🆕" },
    confirmado: { t: "Confirmado", e: "👍" },
    entregado:  { t: "Entregado",  e: "✅" },
    cancelado:  { t: "Cancelado",  e: "✖️" }
  };

  function statsPedidos() {
    const ahora = new Date();
    const mes = pedidos.filter((x) => {
      const d = new Date(x.created_at);
      return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear() && x.estado !== "cancelado";
    });
    const vendido = mes.filter((x) => x.estado === "confirmado" || x.estado === "entregado").reduce((s, x) => s + Number(x.total || 0), 0);
    return {
      nuevos: pedidos.filter((x) => x.estado === "nuevo").length,
      porEntregar: pedidos.filter((x) => x.estado === "confirmado").length,
      mes: mes.length,
      vendido
    };
  }

  function topProductos() {
    const cont = {};
    for (const p of pedidos) {
      if (p.estado === "cancelado") continue;
      for (const it of p.items || []) cont[it.nombre] = (cont[it.nombre] || 0) + Number(it.cant || 0);
    }
    return Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }

  function renderPedidos() {
    const st = statsPedidos();
    const top = topProductos();
    const lista = pedidos.filter((x) =>
      filtroPedidos === "todos" ? true :
      filtroPedidos === "activos" ? (x.estado === "nuevo" || x.estado === "confirmado") :
      x.estado === filtroPedidos);

    const filtros = [["activos", "Pendientes"], ["nuevo", "Nuevos"], ["confirmado", "Confirmados"], ["entregado", "Entregados"], ["cancelado", "Cancelados"], ["todos", "Todos"]];

    $("#main").innerHTML = `
      <div class="head">
        <div>
          <p class="eyebrow">VENTAS</p>
          <h1>Pedidos</h1>
        </div>
        <button class="btn btn--sm" type="button" id="b-refrescar">↻ Actualizar</button>
      </div>

      <div class="stats">
        <div class="stat stat--pink"><span>Nuevos</span><strong data-cuenta="${st.nuevos}">0</strong><small>para contestar</small></div>
        <div class="stat stat--yellow"><span>Por entregar</span><strong data-cuenta="${st.porEntregar}">0</strong><small>confirmados</small></div>
        <div class="stat stat--mint"><span>Este mes</span><strong data-cuenta="${st.mes}">0</strong><small>pedidos</small></div>
        <div class="stat stat--purple"><span>Vendido este mes</span><strong data-cuenta="${st.vendido}" data-plata>$ 0</strong><small>confirmados + entregados</small></div>
      </div>

      ${top.length ? `<p class="top-line">🏆 Lo más pedido: ${top.map(([n, c]) => `<b>${esc(n)}</b> (${c})`).join(" · ")}</p>` : ""}

      <div class="pills" role="group" aria-label="Filtrar pedidos">
        ${filtros.map(([k, t]) => `<button type="button" class="pill${k === filtroPedidos ? " is-on" : ""}" data-fp="${k}" aria-pressed="${k === filtroPedidos}">${t}</button>`).join("")}
      </div>

      <div class="orders">
        ${lista.length ? lista.map(pedidoHTML).join("") : `
          <div class="empty">
            <span>🧾</span>
            <p>${pedidos.length ? "No hay pedidos en esta lista." : "Todavía no entró ningún pedido desde la web."}</p>
            <small>Cuando alguien arme su pedido y lo mande por WhatsApp, aparece acá.</small>
          </div>`}
      </div>`;

    animarNumeros();
    $("#b-refrescar").addEventListener("click", async (e) => {
      e.currentTarget.classList.add("spin");
      await recargarPedidos(false);
      toast("Pedidos al día ✓");
    });
    $$("[data-fp]").forEach((b) => b.addEventListener("click", () => { filtroPedidos = b.dataset.fp; renderPedidos(); }));
    $$(".order").forEach(engancharPedido);
  }

  function pedidoHTML(p, i) {
    const items = (p.items || []).map((it) =>
      `<li><span class="q">${Number(it.cant) || 0}×</span> ${esc(it.nombre)} <em>${it.precio == null ? "a consultar" : plata(Number(it.precio) * Number(it.cant))}</em></li>`).join("");
    const tel = waNumero(p.telefono);
    const saludo = encodeURIComponent(`¡Hola ${p.nombre}! Te escribimos de Návora Gummies por tu pedido 🍬`);
    return `
      <article class="order order--${esc(p.estado)}" data-id="${Number(p.id)}" style="--i:${Math.min(i, 10)}">
        <header class="order__head">
          <div>
            <span class="order__num">#${Number(p.id)}</span>
            <h3>${esc(p.nombre)}</h3>
            <small>${hace(p.created_at)}${p.telefono ? ` · ${esc(p.telefono)}` : ""}</small>
          </div>
          <div class="estado" role="group" aria-label="Estado del pedido">
            ${Object.entries(ESTADOS).map(([k, v]) => `<button type="button" data-estado="${k}" class="${p.estado === k ? "is-on" : ""}" aria-pressed="${p.estado === k}" title="${v.t}"><span aria-hidden="true">${v.e}</span> ${v.t}</button>`).join("")}
          </div>
        </header>
        <div class="order__meta">
          ${p.fecha ? `<span class="tag tag--yellow">📅 Para el ${esc(fechaCorta(p.fecha))}</span>` : ""}
          <span class="tag">${p.entrega === "envio" ? "🛵 Envío" : "🏠 Retiro"}</span>
          ${p.a_consultar ? `<span class="tag tag--pink">Hay precios a consultar</span>` : ""}
        </div>
        <ul class="order__items">${items}</ul>
        ${p.nota ? `<p class="order__nota">“${esc(p.nota)}”</p>` : ""}
        <footer class="order__foot">
          <strong class="order__total">${plata(p.total)}${p.a_consultar ? " <small>+ a consultar</small>" : ""}</strong>
          <div class="order__acts">
            ${tel ? `<a class="btn btn--sm btn--wa" href="https://wa.me/${tel}?text=${saludo}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
            <button class="btn btn--sm btn--ghost" type="button" data-nota>📝 Nota</button>
            <button class="icon-btn" type="button" data-borrar aria-label="Borrar pedido">🗑</button>
          </div>
        </footer>
        <label class="order__interna" ${p.nota_admin ? "" : "hidden"}>
          <span>Nota interna (solo la ves vos)</span>
          <textarea rows="2" maxlength="600" placeholder="Ej: seña pagada, retira a las 18 hs…">${esc(p.nota_admin)}</textarea>
        </label>
      </article>`;
  }

  function engancharPedido(card) {
    const id = Number(card.dataset.id);
    const ped = () => pedidos.find((x) => x.id === id);

    card.querySelectorAll("[data-estado]").forEach((b) => b.addEventListener("click", async () => {
      const nuevo = b.dataset.estado;
      const p = ped();
      if (!p || p.estado === nuevo) return;
      const viejo = p.estado;
      p.estado = nuevo;
      card.className = `order order--${nuevo} is-flash`;
      card.querySelectorAll("[data-estado]").forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b); });
      const { error } = await sb.from("pedidos").update({ estado: nuevo }).eq("id", id);
      if (error) { p.estado = viejo; toast("No se pudo cambiar el estado", "error"); renderPedidos(); return; }
      pintarBadge();
      if (nuevo === "entregado") confeti(b);
      toast(`Pedido #${id}: ${ESTADOS[nuevo].t.toLowerCase()}`);
      setTimeout(() => { if (vista === "pedidos") renderPedidos(); }, 700);
    }));

    const notaBox = card.querySelector(".order__interna");
    const ta = notaBox.querySelector("textarea");
    card.querySelector("[data-nota]").addEventListener("click", () => {
      notaBox.hidden = !notaBox.hidden;
      if (!notaBox.hidden) ta.focus();
    });
    ta.addEventListener("change", async () => {
      const { error } = await sb.from("pedidos").update({ nota_admin: ta.value.trim() }).eq("id", id);
      if (error) { toast("No se pudo guardar la nota", "error"); return; }
      ped().nota_admin = ta.value.trim();
      toast("Nota guardada ✓");
    });

    card.querySelector("[data-borrar]").addEventListener("click", async () => {
      if (!(await confirmar(`¿Borrar el pedido #${id} de ${ped()?.nombre || ""}? No se puede deshacer.`))) return;
      const { error } = await sb.from("pedidos").delete().eq("id", id);
      if (error) { toast("No se pudo borrar", "error"); return; }
      card.classList.add("is-out");
      pedidos = pedidos.filter((x) => x.id !== id);
      pintarBadge();
      setTimeout(renderPedidos, 300);
    });
  }

  function animarNumeros() {
    $$("[data-cuenta]").forEach((el) => {
      const fin = Number(el.dataset.cuenta) || 0;
      const esPlata = el.hasAttribute("data-plata");
      const t0 = performance.now(), dur = 700;
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const v = fin * (1 - Math.pow(1 - k, 3));
        el.textContent = esPlata ? plata(v) : Math.round(v);
        if (k < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });
  }

  /* =====================================================================
     PRODUCTOS
     ===================================================================== */
  function renderProductos() {
    const visibles = productos.filter((p) => p.visible).length;
    $("#main").innerHTML = `
      <div class="head">
        <div>
          <p class="eyebrow">CATÁLOGO · ${productos.length} ${productos.length === 1 ? "producto" : "productos"} · ${visibles} en la web</p>
          <h1>Productos</h1>
        </div>
        <button class="btn btn--pink" type="button" id="b-nuevo">+ Agregar producto</button>
      </div>
      <p class="hint">Tocá un producto para editarlo. Con las flechas cambiás el orden en que aparecen en la web.</p>
      <div class="prods" id="prods">
        ${productos.length ? productos.map(prodHTML).join("") : `
          <div class="empty">
            <span>🍬</span>
            <p>Todavía no hay productos.</p>
            <button class="btn btn--pink" type="button" data-nuevo>+ Agregar el primero</button>
          </div>`}
      </div>`;

    $("#b-nuevo").addEventListener("click", () => abrirEditor(null));
    $("[data-nuevo]")?.addEventListener("click", () => abrirEditor(null));
    $$(".prod").forEach(engancharProd);
    prevProductos();
  }

  function prodHTML(p, i) {
    const foto = fotoSegura(p.foto_url);
    return `
      <article class="prod${p.visible ? "" : " is-oculto"}${p.agotado ? " is-agotado" : ""}" data-id="${esc(p.id)}" style="--i:${Math.min(i, 12)}">
        <button class="prod__main" type="button" data-editar aria-label="Editar ${esc(p.nombre)}">
          <span class="prod__img${foto ? "" : " is-fallback"}">${foto ? `<img src="${esc(foto)}" alt="" loading="lazy">` : ""}
            ${p.etiqueta ? `<i class="prod__tag">${esc(p.etiqueta)}</i>` : ""}</span>
          <span class="prod__txt">
            <strong>${esc(p.nombre)}</strong>
            <span class="prod__price">${p.precio == null ? "A consultar" : plata(p.precio)}${p.unidad ? ` <small>${esc(p.unidad)}</small>` : ""}</span>
            <span class="prod__meta">${p.categoria ? esc(p.categoria) : "Sin categoría"}${p.minimo > 1 ? ` · mín. ${p.minimo}` : ""}</span>
          </span>
        </button>
        <div class="prod__bar">
          <label class="mini-switch" title="Mostrar en la web"><input type="checkbox" data-campo="visible" ${p.visible ? "checked" : ""}><span></span>${p.visible ? "En la web" : "Oculto"}</label>
          <label class="mini-switch mini-switch--warn" title="Sin stock"><input type="checkbox" data-campo="agotado" ${p.agotado ? "checked" : ""}><span></span>Sin stock</label>
          <span class="prod__order">
            <button class="icon-btn" type="button" data-mover="-1" aria-label="Subir" ${i === 0 ? "disabled" : ""}>↑</button>
            <button class="icon-btn" type="button" data-mover="1" aria-label="Bajar" ${i === productos.length - 1 ? "disabled" : ""}>↓</button>
            <button class="icon-btn icon-btn--danger" type="button" data-borrar aria-label="Borrar">🗑</button>
          </span>
        </div>
      </article>`;
  }

  function engancharProd(card) {
    const id = card.dataset.id;
    const prod = () => productos.find((x) => x.id === id);

    card.querySelector("[data-editar]").addEventListener("click", () => abrirEditor(prod()));
    card.addEventListener("mouseenter", () => prev({ tipo: "ir", panel: 1 }));

    card.querySelectorAll("[data-campo]").forEach((inp) => inp.addEventListener("change", async () => {
      const campo = inp.dataset.campo;
      const p = prod();
      const valor = inp.checked;
      p[campo] = valor;
      renderProductos();
      const { error } = await sb.from("productos").update({ [campo]: valor }).eq("id", id);
      if (error) { p[campo] = !valor; renderProductos(); toast("No se pudo guardar", "error"); return; }
      toast(campo === "visible" ? (valor ? "Ahora se ve en la web ✓" : "Oculto de la web") : (valor ? "Marcado sin stock" : "Hay stock otra vez ✓"));
    }));

    card.querySelectorAll("[data-mover]").forEach((b) => b.addEventListener("click", async () => {
      const i = productos.findIndex((x) => x.id === id);
      const j = i + Number(b.dataset.mover);
      if (j < 0 || j >= productos.length) return;
      [productos[i], productos[j]] = [productos[j], productos[i]];
      productos.forEach((x, k) => (x.orden = k + 1));
      renderProductos();
      $(`.prod[data-id="${CSS.escape(id)}"]`)?.classList.add("is-moved");
      const cambios = [productos[i], productos[j]];
      const res = await Promise.all(cambios.map((x) => sb.from("productos").update({ orden: x.orden }).eq("id", x.id)));
      if (res.some((r) => r.error)) toast("No se pudo guardar el orden", "error");
    }));

    card.querySelector("[data-borrar]").addEventListener("click", async () => {
      const p = prod();
      if (!(await confirmar(`¿Borrar “${p.nombre}”? Si solo querés sacarlo un tiempo, mejor ocultalo.`))) return;
      const { error } = await sb.from("productos").delete().eq("id", id);
      if (error) { toast("No se pudo borrar", "error"); return; }
      borrarFotoSiEsNuestra(p.foto_url);
      card.classList.add("is-out");
      productos = productos.filter((x) => x.id !== id);
      setTimeout(renderProductos, 280);
      toast("Producto borrado");
    });
  }

  /* ---------- editor de producto ---------- */
  const dlg = $("#dlg-prod");
  const fp = $("#f-prod");
  let editando = null;   // producto original (o null si es nuevo)
  let fotoActual = "";
  let fotoSubidaEnEsta = ""; // foto subida en esta edición (para limpiar si se cancela)

  function abrirEditor(p) {
    editando = p || null;
    fotoSubidaEnEsta = "";
    $("#dp-title").textContent = p ? "Editar producto" : "Nuevo producto";
    $("#dp-msg").textContent = "";
    fp.nombre.value = p?.nombre || "";
    fp.descripcion.value = p?.descripcion || "";
    fp.precio.value = p?.precio == null ? "" : String(Number(p.precio)).replace(".", ",");
    fp.unidad.value = p?.unidad || "";
    fp.categoria.value = p?.categoria || "";
    fp.minimo.value = p?.minimo || 1;
    fp.etiqueta.value = p?.etiqueta || "";
    fp.visible.checked = p ? p.visible : true;
    fp.agotado.checked = p ? p.agotado : false;
    setFoto(p?.foto_url || "");
    const cats = [...new Set(productos.map((x) => x.categoria).filter(Boolean))];
    $("#dl-cats").innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join("");
    pintarSugerencias();
    dlg.showModal();
    setTimeout(() => fp.nombre.focus(), 80);
    borradorAPreview();
  }

  function setFoto(url) {
    fotoActual = url || "";
    const f = fotoSegura(fotoActual);
    $("#dp-img").hidden = !f;
    if (f) $("#dp-img").src = f; else $("#dp-img").removeAttribute("src");
    $("#dp-empty").hidden = Boolean(f);
    $("#dp-quitar").hidden = !f;
    $("#dp-cambiar").hidden = !f;
  }

  function leerPrecio() {
    const t = fp.precio.value.trim().replace(/\$/g, "").replace(/\s/g, "");
    if (!t) return { ok: true, valor: null };
    // acepta 1500 · 1.500 · 1500,50 · 1.500,50
    const norm = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : (/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t);
    const n = Number(norm);
    if (!Number.isFinite(n) || n < 0) return { ok: false };
    return { ok: true, valor: Math.round(n * 100) / 100 };
  }

  function datosForm() {
    const pr = leerPrecio();
    return {
      nombre: fp.nombre.value.trim(),
      descripcion: fp.descripcion.value.trim(),
      precio: pr.ok ? pr.valor : null,
      unidad: fp.unidad.value.trim(),
      categoria: fp.categoria.value.trim(),
      minimo: Math.min(1000, Math.max(1, parseInt(fp.minimo.value, 10) || 1)),
      etiqueta: fp.etiqueta.value.trim(),
      visible: fp.visible.checked,
      agotado: fp.agotado.checked,
      foto_url: fotoActual
    };
  }

  function borradorAPreview() {
    const d = datosForm();
    prodBorrador = { ...(editando || { id: "borrador", orden: 9999 }), ...d, nombre: d.nombre || "Producto nuevo", visible: true };
    prevProductos();
    prev({ tipo: "ir", panel: 1 });
    prev({ tipo: "enfocar", id: prodBorrador.id });
  }

  fp.addEventListener("input", borradorAPreview);
  fp.addEventListener("change", borradorAPreview);

  function pintarSugerencias() {
    $$("#sug-etiquetas button").forEach((b) => b.classList.toggle("is-on", b.dataset.et === fp.etiqueta.value.trim()));
  }
  $("#sug-etiquetas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-et]");
    if (!b) return;
    fp.etiqueta.value = b.dataset.et;
    pintarSugerencias();
    borradorAPreview();
  });
  fp.etiqueta.addEventListener("input", pintarSugerencias);

  async function cerrarEditor(guardado) {
    if (!guardado && fotoSubidaEnEsta) borrarFotoSiEsNuestra(fotoSubidaEnEsta);
    prodBorrador = null;
    dlg.close();
    prevProductos();
  }
  $$("[data-cerrar]", dlg).forEach((b) => b.addEventListener("click", () => cerrarEditor(false)));
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); cerrarEditor(false); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) cerrarEditor(false); });

  fp.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#dp-msg");
    msg.textContent = "";
    if (!fp.nombre.value.trim()) { msg.textContent = "Ponele un nombre al producto."; fp.nombre.focus(); return; }
    if (!leerPrecio().ok) { msg.textContent = "El precio tiene que ser un número (ej: 1500). Dejalo vacío si es a consultar."; fp.precio.focus(); return; }
    if (!$("#dp-busy").hidden) { msg.textContent = "Esperá a que termine de subir la foto."; return; }

    const d = datosForm();
    const btn = $("#dp-guardar");
    btn.disabled = true; btn.classList.add("is-busy");

    let res;
    if (editando) {
      res = await sb.from("productos").update(d).eq("id", editando.id).select().single();
    } else {
      d.orden = productos.reduce((m, x) => Math.max(m, x.orden || 0), 0) + 1;
      res = await sb.from("productos").insert(d).select().single();
    }
    btn.disabled = false; btn.classList.remove("is-busy");

    if (res.error) { msg.textContent = "No se pudo guardar. Revisá la conexión y probá de nuevo."; return; }

    const fotoVieja = editando?.foto_url;
    if (editando) {
      Object.assign(editando, res.data);
      if (fotoVieja && fotoVieja !== res.data.foto_url) borrarFotoSiEsNuestra(fotoVieja);
    } else {
      productos.push(res.data);
    }
    const eraNuevo = !editando;
    fotoSubidaEnEsta = "";
    await cerrarEditor(true);
    renderProductos();
    const card = $(`.prod[data-id="${CSS.escape(res.data.id)}"]`);
    if (card) { card.classList.add("is-new"); card.scrollIntoView({ block: "nearest", behavior: "smooth" }); confeti(card); }
    toast(eraNuevo ? "¡Producto agregado! Ya está en la web 🎉" : "Cambios guardados ✓");
  });

  /* ---------- fotos ---------- */
  const fileIn = $("#dp-file");
  $("#dp-cambiar").addEventListener("click", () => fileIn.click());
  $("#dp-quitar").addEventListener("click", () => {
    if (fotoSubidaEnEsta) { borrarFotoSiEsNuestra(fotoSubidaEnEsta); fotoSubidaEnEsta = ""; }
    setFoto("");
    borradorAPreview();
  });
  fileIn.addEventListener("change", () => { if (fileIn.files[0]) subirFoto(fileIn.files[0]); fileIn.value = ""; });

  const drop = $("#photo-drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-drag"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-drag"); }));
  drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files?.[0]; if (f) subirFoto(f); });

  async function achicar(file) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) throw new Error("formato");
    const max = 1200;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.82));
    if (blob && blob.type === "image/webp") return { blob, ext: "webp", type: "image/webp" };
    const jpg = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return { blob: jpg, ext: "jpg", type: "image/jpeg" };
  }

  async function subirFoto(file) {
    const msg = $("#dp-msg");
    msg.textContent = "";
    if (!file.type.startsWith("image/")) { msg.textContent = "Eso no es una foto."; return; }
    $("#dp-busy").hidden = false;
    try {
      const { blob, ext, type } = await achicar(file);
      const ruta = `productos/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("fotos").upload(ruta, blob, { contentType: type, cacheControl: "31536000" });
      if (error) throw error;
      const { data } = sb.storage.from("fotos").getPublicUrl(ruta);
      if (fotoSubidaEnEsta) borrarFotoSiEsNuestra(fotoSubidaEnEsta);
      fotoSubidaEnEsta = data.publicUrl;
      setFoto(data.publicUrl);
      drop.classList.add("is-done");
      setTimeout(() => drop.classList.remove("is-done"), 700);
      borradorAPreview();
    } catch (err) {
      msg.textContent = err?.message === "formato"
        ? "No se pudo leer esa foto. Probá con una JPG o PNG."
        : "No se pudo subir la foto. Probá de nuevo.";
    } finally {
      $("#dp-busy").hidden = true;
    }
  }

  function borrarFotoSiEsNuestra(url) {
    const marca = "/storage/v1/object/public/fotos/";
    if (!url || !url.startsWith(CFG.url) || !url.includes(marca)) return;
    const ruta = decodeURIComponent(url.split(marca)[1] || "");
    if (ruta && !productos.some((p) => p.foto_url === url)) sb.storage.from("fotos").remove([ruta]).catch(() => {});
  }

  /* =====================================================================
     TEXTOS Y CONTACTO
     ===================================================================== */
  const CAMPOS_TEXTOS = [
    { grupo: "Cinta de arriba", panel: 0 },
    { k: "marquee", l: "Frases de la cinta", t: "area", ayuda: "Una frase por renglón. Pasan en loop arriba de todo.", max: 400, panel: 0 },
    { grupo: "Inicio", panel: 0 },
    { k: "hero_eyebrow", l: "Frase chiquita de arriba", max: 80, panel: 0 },
    { k: "hero_l1", l: "Título · línea 1 (contorno)", max: 30, panel: 0 },
    { k: "hero_l2", l: "Título · línea 2 (resaltada en rosa)", max: 20, panel: 0 },
    { k: "hero_l3", l: "Título · línea 3", max: 30, panel: 0 },
    { k: "hero_sub", l: "Bajada", t: "area", max: 200, panel: 0 },
    { grupo: "Productos", panel: 1 },
    { k: "serv_eyebrow", l: "Frase debajo del título", max: 80, panel: 1 },
    { grupo: "Contacto", panel: 2 },
    { k: "story_titulo", l: "Título", max: 80, panel: 2 },
    { k: "story_texto", l: "Texto", t: "area", max: 500, panel: 2 },
    { k: "cta_linea", l: "Frase arriba del botón de WhatsApp", max: 60, panel: 2 }
  ];
  const CAMPOS_CONTACTO = [
    { grupo: "WhatsApp", panel: 2 },
    { k: "wa1", l: "WhatsApp principal", ayuda: "A este número llegan los pedidos de la web.", tipo: "tel", max: 30, panel: 2, wa: true },
    { k: "wa2", l: "WhatsApp secundario", ayuda: "Opcional. Si lo dejás vacío, no aparece.", tipo: "tel", max: 30, panel: 2, wa: true },
    { grupo: "Redes y zona", panel: 2 },
    { k: "instagram", l: "Usuario de Instagram", ayuda: "Sin la @.", max: 40, panel: 2 },
    { k: "zona", l: "Zona", max: 40, panel: 2 },
    { k: "horario", l: "Horario de atención", max: 40, panel: 2 },
    { grupo: "Pedidos", panel: 1 },
    { k: "envios", l: "Aclaración de entregas", ayuda: "Aparece abajo del formulario de pedido.", t: "area", max: 200, panel: 1, carrito: true }
  ];

  function renderForm(campos, titulo, bajada) {
    $("#main").innerHTML = `
      <div class="head">
        <div>
          <p class="eyebrow">LA WEB</p>
          <h1>${esc(titulo)}</h1>
        </div>
      </div>
      <p class="hint">${esc(bajada)} Mirá la vista previa mientras escribís.</p>
      <form class="cform" id="cform" autocomplete="off">
        ${campos.map((c, i) => c.grupo
          ? `<h2 class="cform__group" style="--i:${i}">${esc(c.grupo)}</h2>`
          : `<label class="field cform__f" style="--i:${i}" data-panel="${c.panel}" ${c.carrito ? "data-carrito" : ""}>
              <span class="field__top">${esc(c.l)} <span class="count" data-count="${c.k}"></span></span>
              ${c.t === "area"
                ? `<textarea name="${c.k}" rows="${c.k === "story_texto" ? 4 : 3}" maxlength="${c.max}"></textarea>`
                : `<input name="${c.k}" maxlength="${c.max}" placeholder="Vacío = queda el texto de siempre" ${c.tipo ? `type="${c.tipo}" inputmode="tel"` : ""}>`}
              ${c.ayuda ? `<small>${esc(c.ayuda)}</small>` : ""}
              ${c.wa ? `<a class="wa-test" data-wa-test="${c.k}" target="_blank" rel="noopener" hidden>Probar este número ↗</a>` : ""}
            </label>`).join("")}
      </form>`;

    const f = $("#cform");
    for (const c of campos) {
      if (!c.k) continue;
      f[c.k].value = contenido[c.k] ?? "";
      contar(c.k, c.max);
      probarWa(c);
    }
    f.addEventListener("input", (e) => {
      const n = e.target.name;
      if (!n) return;
      contenido[n] = e.target.value;
      const c = campos.find((x) => x.k === n);
      contar(n, c.max);
      probarWa(c);
      e.target.closest(".field")?.classList.toggle("is-changed", (contenido[n] ?? "") !== (contenidoGuardado[n] ?? ""));
      actualizarSavebar();
      prev({ tipo: "contenido", datos: contenido });
    });
    f.addEventListener("focusin", (e) => {
      const lab = e.target.closest("[data-panel]");
      if (!lab) return;
      prev({ tipo: "ir", panel: Number(lab.dataset.panel) });
      prev({ tipo: "carrito", abrir: lab.hasAttribute("data-carrito") });
      $$(".cform__f").forEach((x) => x.classList.toggle("is-focus", x === lab));
    });
    $$(".cform__f").forEach((lab) => {
      const n = lab.querySelector("[name]").name;
      lab.classList.toggle("is-changed", (contenido[n] ?? "") !== (contenidoGuardado[n] ?? ""));
    });
  }

  function contar(k, max) {
    const el = $(`[data-count="${k}"]`);
    if (!el) return;
    const n = (contenido[k] || "").length;
    el.textContent = `${n}/${max}`;
    el.classList.toggle("is-near", n > max * 0.85);
  }
  function probarWa(c) {
    if (!c?.wa) return;
    const a = $(`[data-wa-test="${c.k}"]`);
    const n = waNumero(contenido[c.k]);
    a.hidden = !n;
    if (n) a.href = `https://wa.me/${n}`;
  }

  /* ---------- barra de guardar ---------- */
  const savebar = $("#savebar");
  function actualizarSavebar() {
    const sucio = hayCambios();
    document.body.classList.toggle("con-savebar", sucio);
    if (sucio && savebar.hidden) { savebar.hidden = false; requestAnimationFrame(() => savebar.classList.add("is-on")); }
    if (!sucio && !savebar.hidden) { savebar.classList.remove("is-on"); setTimeout(() => { if (!hayCambios()) savebar.hidden = true; }, 250); }
  }

  function descartar() {
    contenido = structuredClone(contenidoGuardado);
    actualizarSavebar();
    prev({ tipo: "contenido", datos: contenido });
    if (vista === "textos" || vista === "contacto") render();
  }
  $("#b-descartar").addEventListener("click", descartar);

  $("#b-guardar").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const limpio = {};
    for (const [k, v] of Object.entries(contenido)) limpio[k] = typeof v === "string" ? v.trim() : v;
    btn.disabled = true; btn.classList.add("is-busy");
    const { error } = await sb.from("contenido").update({ datos: limpio }).eq("id", 1);
    btn.disabled = false; btn.classList.remove("is-busy");
    if (error) { toast("No se pudo guardar. Probá de nuevo.", "error"); return; }
    contenidoGuardado = structuredClone(limpio);
    contenido = structuredClone(limpio);
    confeti(btn);
    actualizarSavebar();
    $$(".cform__f.is-changed").forEach((x) => x.classList.remove("is-changed"));
    toast("¡Guardado! Ya se ve en la web 🎉");
  });

  window.addEventListener("beforeunload", (e) => { if (hayCambios()) { e.preventDefault(); e.returnValue = ""; } });

  /* =====================================================================
     VISTA PREVIA
     ===================================================================== */
  const iframe = $("#prev");
  let prevLista = false;

  function prev(msg) {
    if (!prevLista) return; // cuando la vista previa termine de cargar, le mandamos todo junto
    iframe.contentWindow?.postMessage(msg, location.origin);
  }
  function prevProductos() {
    let lista = productos.filter((p) => p.visible);
    if (prodBorrador) {
      const i = lista.findIndex((p) => p.id === prodBorrador.id);
      if (i >= 0) lista[i] = prodBorrador; else lista = [...lista, prodBorrador];
    }
    prev({ tipo: "productos", lista });
  }

  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.source !== iframe.contentWindow) return;
    if (e.data?.tipo === "lista") {
      prevLista = true;
      iframe.contentWindow.postMessage({ tipo: "contenido", datos: contenido }, location.origin);
      prevProductos();
      const panel = { productos: 1, textos: 0, contacto: 2 }[vista];
      if (panel !== undefined) iframe.contentWindow.postMessage({ tipo: "ir", panel }, location.origin);
      const enfocado = $(".cform__f.is-focus");
      if (enfocado?.hasAttribute("data-carrito")) iframe.contentWindow.postMessage({ tipo: "carrito", abrir: true }, location.origin);
    }
  });
  // si el iframe se recarga, vuelve a avisar con "lista" y le mandamos todo de nuevo

  // tamaño móvil / compu
  const frame = $("#prev-frame");
  const stage = $("#prev-stage");
  function escalar() {
    const compu = frame.classList.contains("is-compu");
    const w = compu ? 1280 : 390, h = compu ? 800 : 780;
    const k = Math.min(1, (stage.clientWidth - 8) / w, (stage.clientHeight - 8) / h);
    frame.style.width = w + "px";
    frame.style.height = h + "px";
    frame.style.transform = `scale(${k})`;
    frame.style.marginBottom = `${(k - 1) * h}px`;
    frame.style.marginRight = `${(k - 1) * w}px`;
  }
  $$("[data-size]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-size]").forEach((x) => { x.classList.toggle("is-on", x === b); x.setAttribute("aria-pressed", x === b); });
    frame.classList.toggle("is-compu", b.dataset.size === "compu");
    escalar();
  }));
  new ResizeObserver(escalar).observe(stage);

  // en celular la vista previa se abre aparte
  $("#b-prev-abrir").addEventListener("click", () => { $("#preview").classList.add("is-open"); document.body.classList.add("no-scroll"); setTimeout(escalar, 50); });
  $("#b-prev-cerrar").addEventListener("click", () => { $("#preview").classList.remove("is-open"); document.body.classList.remove("no-scroll"); });

})();
