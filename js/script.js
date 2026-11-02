document.addEventListener("DOMContentLoaded", () => {

  /* =========================================================
     NAVEGACIÓN ENTRE PANTALLAS
     ========================================================= */
  const screens = Array.from(document.querySelectorAll(".screen"));
  const tabs = Array.from(document.querySelectorAll(".tab"));
  const dots = Array.from(document.querySelectorAll(".dot"));
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const whatsappFab = document.querySelector(".whatsapp-fab");

  let current = 0;

  function setStaggerDelays(panelIndex) {
    const els = screens[panelIndex].querySelectorAll(".reveal");
    els.forEach((el, i) => el.style.setProperty("--d", Math.min(i, 12)));
  }

  function goTo(index) {
    if (index < 0 || index >= screens.length || index === current) return;

    screens[current].classList.remove("is-active");
    tabs[current].classList.remove("is-active");
    tabs[current].setAttribute("aria-selected", "false");
    dots[current].classList.remove("is-active");

    current = index;
    setStaggerDelays(current);

    screens[current].classList.add("is-active");
    tabs[current].classList.add("is-active");
    tabs[current].setAttribute("aria-selected", "true");
    dots[current].classList.add("is-active");

    window.scrollTo({ top: 0, behavior: "instant" });
    whatsappFab?.classList.toggle("is-hidden", current === 2);
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-goto]");
    if (!el) return;
    e.preventDefault();
    if (el.hasAttribute("data-close-cart")) cerrarCarrito();
    goTo(parseInt(el.getAttribute("data-goto"), 10));
  });

  prevBtn.addEventListener("click", () => goTo(current - 1));
  nextBtn.addEventListener("click", () => goTo(current + 1));

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, select")) return;
    if (carritoAbierto()) { if (e.key === "Escape") cerrarCarrito(); return; }
    if (e.key === "ArrowRight") goTo(current + 1);
    if (e.key === "ArrowLeft") goTo(current - 1);
  });

  setStaggerDelays(0);

  /* =========================================================
     UTILIDADES
     ========================================================= */
  const CFG = window.NAVORA_CONFIG || {};
  const hayBase = Boolean(CFG.url && CFG.key);
  const VISTA_PREVIA = new URLSearchParams(location.search).has("vista-previa");

  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const cargar = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } };
  const lleno = (v) => typeof v === "string" && v.trim() !== "";

  const fmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
  const plata = (n) => "$ " + fmt.format(Math.round(n));

  function waNumero(txt) {
    let d = String(txt || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("549")) return d;
    if (d.startsWith("54")) return "549" + d.slice(2);
    if (d.startsWith("0")) d = d.slice(1);
    if (d.startsWith("15") && d.length === 10) d = "11" + d.slice(2);
    return "549" + d;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // solo dejamos pasar fotos propias (assets/...) o del storage de la base
  function fotoSegura(url) {
    if (!lleno(url)) return "";
    if (/^assets\/[\w\-./]+$/.test(url)) return url;
    try {
      const u = new URL(url);
      if (u.protocol === "https:") return u.href;
    } catch (_) {}
    return "";
  }

  async function api(ruta, opciones = {}) {
    const r = await fetch(`${CFG.url}/rest/v1/${ruta}`, {
      ...opciones,
      headers: {
        apikey: CFG.key,
        Authorization: `Bearer ${CFG.key}`,
        "Content-Type": "application/json",
        ...(opciones.headers || {})
      }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.status === 204 || r.status === 201 ? null : r.json();
  }

  /* =========================================================
     CONTENIDO EDITABLE (textos, contacto)
     ========================================================= */
  let contenido = {};

  function aplicarContenido(d) {
    contenido = d || {};

    document.querySelectorAll("[data-c]").forEach((el) => {
      if (!("orig" in el.dataset)) el.dataset.orig = el.textContent;
      const v = contenido[el.dataset.c];
      el.textContent = lleno(v) ? v.trim() : el.dataset.orig;
    });

    document.querySelectorAll("[data-wa]").forEach((el) => {
      const clave = el.dataset.wa;
      const v = lleno(contenido[clave]) ? contenido[clave] : null;
      if (!("orig" in el.dataset)) el.dataset.orig = el.getAttribute("href");
      el.setAttribute("href", v ? `https://wa.me/${waNumero(v)}` : el.dataset.orig);
      if (el.hasAttribute("data-wa-texto") && v) el.textContent = v.trim();
    });
    const li2 = document.getElementById("li-wa2");
    if (li2 && "wa2" in contenido) li2.hidden = !lleno(contenido.wa2);

    document.querySelectorAll("[data-ig]").forEach((el) => {
      const ig = lleno(contenido.instagram) ? contenido.instagram.trim().replace(/^@/, "") : "navora.gummies";
      el.href = `https://www.instagram.com/${encodeURIComponent(ig)}/`;
      el.textContent = "@" + ig;
    });

    if (lleno(contenido.marquee)) {
      const frases = contenido.marquee.split("\n").map((t) => t.trim()).filter(Boolean);
      const vuelta = frases.map((f) => `<span>${esc(f)}</span><span>★</span>`).join("");
      document.getElementById("marquee").innerHTML = vuelta + vuelta;
    }
  }

  /* =========================================================
     CATÁLOGO
     ========================================================= */
  const grid = document.getElementById("catalogo");
  const filtros = document.getElementById("filtros");
  const ROTS = [-4, 3, -2, 2.5, -3, 4];
  let productos = [];
  let filtro = "";

  function precioTexto(p) {
    if (p.precio == null || p.precio === "") return "Precio a consultar";
    return plata(Number(p.precio)) + (lleno(p.unidad) ? ` <small>${esc(p.unidad)}</small>` : "");
  }

  function controlHTML(p) {
    if (p.agotado) return `<span class="soldout">SIN STOCK</span>`;
    const item = carrito[p.id];
    if (!item) {
      return `<button class="add-btn" type="button" data-add="${esc(p.id)}">AGREGAR <span aria-hidden="true">+</span></button>`;
    }
    return `<div class="stepper" role="group" aria-label="Cantidad de ${esc(p.nombre)}">
      <button type="button" data-menos="${esc(p.id)}" aria-label="Uno menos">−</button>
      <output aria-live="polite">${item.cant}</output>
      <button type="button" data-mas="${esc(p.id)}" aria-label="Uno más">+</button>
    </div>`;
  }

  function cardHTML(p, i) {
    const foto = fotoSegura(p.foto_url);
    const rot = ROTS[i % ROTS.length];
    return `<article class="sticker-card reveal${p.agotado ? " is-soldout" : ""}" style="--rot:${rot}deg" data-id="${esc(p.id)}">
      ${lleno(p.etiqueta) ? `<span class="sticker-card__tag">${esc(p.etiqueta)}</span>` : ""}
      <div class="sticker-card__tape"></div>
      <div class="sticker-card__photo${foto ? "" : " is-fallback"}">
        ${foto ? `<img src="${esc(foto)}" alt="${esc(p.nombre)}" loading="lazy" onerror="this.remove(); this.parentElement && this.parentElement.classList.add('is-fallback')">` : ""}
      </div>
      <h3>${esc(p.nombre)}</h3>
      ${lleno(p.descripcion) ? `<p>${esc(p.descripcion)}</p>` : ""}
      <div class="sticker-card__foot">
        <span class="price">${precioTexto(p)}${p.minimo > 1 ? `<em>mín. ${p.minimo}</em>` : ""}</span>
        <span class="ctrl" data-ctrl="${esc(p.id)}">${controlHTML(p)}</span>
      </div>
    </article>`;
  }

  function renderFiltros() {
    const cats = [...new Set(productos.map((p) => (p.categoria || "").trim()).filter(Boolean))];
    if (cats.length < 2) { filtros.hidden = true; filtro = ""; return; }
    if (filtro && !cats.includes(filtro)) filtro = "";
    filtros.hidden = false;
    filtros.innerHTML = ["", ...cats].map((c) =>
      `<button type="button" class="chip${c === filtro ? " is-on" : ""}" data-filtro="${esc(c)}" aria-pressed="${c === filtro}">${c ? esc(c) : "Todo"}</button>`
    ).join("");
  }

  function renderCatalogo() {
    const lista = productos.filter((p) => !filtro || (p.categoria || "").trim() === filtro);
    grid.innerHTML = lista.length
      ? lista.map(cardHTML).join("")
      : `<p class="catalog-empty">Pronto vamos a sumar productos acá. Mientras, escribinos por WhatsApp 💗</p>`;
    grid.classList.toggle("is-few", lista.length > 0 && lista.length < 3);
    if (current === 1) setStaggerDelays(1);
    activarTilt();
  }

  function pintarControl(id) {
    const p = productos.find((x) => x.id === id);
    const cont = grid.querySelector(`[data-ctrl="${CSS.escape(id)}"]`);
    if (p && cont) cont.innerHTML = controlHTML(p);
  }

  function setProductos(lista) {
    productos = (lista || []).filter((p) => p && p.visible !== false)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    // actualizamos datos del carrito (precio/nombre) y sacamos lo que ya no está
    for (const id of Object.keys(carrito)) {
      const p = productos.find((x) => x.id === id);
      if (!p || p.agotado) delete carrito[id];
      else Object.assign(carrito[id], { nombre: p.nombre, precio: p.precio, unidad: p.unidad, minimo: p.minimo || 1 });
    }
    renderFiltros();
    renderCatalogo();
    renderCarrito();
  }

  filtros.addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtro]");
    if (!b) return;
    filtro = b.dataset.filtro;
    renderFiltros();
    renderCatalogo();
  });

  // ---- tilt interactivo en los stickers ----
  function activarTilt() {
    if (!matchMedia("(hover: hover)").matches) return;
    grid.querySelectorAll(".sticker-card").forEach((card) => {
      const baseRot = card.style.getPropertyValue("--rot") || "0deg";
      card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const rx = ((e.clientY - r.top - r.height / 2) / (r.height / 2)) * -8;
        const ry = ((e.clientX - r.left - r.width / 2) / (r.width / 2)) * 8;
        card.style.transform = `translateY(-8px) perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      });
      card.addEventListener("mouseleave", () => { card.style.transform = `rotate(${baseRot})`; });
    });
  }

  /* =========================================================
     CARRITO
     ========================================================= */
  const CART_KEY = "navora-carrito";
  let carrito = (VISTA_PREVIA ? null : cargar(CART_KEY)) || {};

  const cartEl = document.getElementById("cart");
  const scrim = document.getElementById("cartScrim");
  const cartBtn = document.getElementById("cartBtn");
  const cartCount = document.getElementById("cartCount");
  const cartItems = document.getElementById("cartItems");
  const cartEmpty = document.getElementById("cartEmpty");
  const cartForm = document.getElementById("cartForm");
  const cartTotal = document.getElementById("cartTotal");
  const cartConsultar = document.getElementById("cartConsultar");
  const cartError = document.getElementById("cartError");
  const toast = document.getElementById("toast");

  function persistir() { if (!VISTA_PREVIA) guardar(CART_KEY, carrito); }

  function resumen() {
    const items = Object.values(carrito);
    let total = 0, consultar = false, unidades = 0;
    for (const it of items) {
      unidades += it.cant;
      if (it.precio == null || it.precio === "") consultar = true;
      else total += Number(it.precio) * it.cant;
    }
    return { items, total, consultar, unidades };
  }

  function renderCarrito() {
    const { items, total, consultar } = resumen();
    cartCount.hidden = items.length === 0;
    cartCount.textContent = items.length;
    cartEmpty.hidden = items.length > 0;
    cartForm.hidden = items.length === 0;
    cartTotal.textContent = plata(total);
    cartConsultar.hidden = !consultar;
    cartConsultar.textContent = total > 0 ? "+ productos con precio a consultar" : "Los precios te los pasamos por WhatsApp";

    cartItems.innerHTML = items.map((it) => {
      const p = productos.find((x) => x.id === it.id);
      const foto = fotoSegura(p?.foto_url);
      const sub = it.precio == null || it.precio === "" ? "a consultar" : plata(Number(it.precio) * it.cant);
      return `<li class="cart-item">
        <span class="cart-item__img${foto ? "" : " is-fallback"}">${foto ? `<img src="${esc(foto)}" alt="">` : ""}</span>
        <span class="cart-item__info">
          <strong>${esc(it.nombre)}</strong>
          <small>${sub}</small>
        </span>
        <span class="stepper stepper--sm" role="group" aria-label="Cantidad de ${esc(it.nombre)}">
          <button type="button" data-menos="${esc(it.id)}" aria-label="Uno menos">−</button>
          <output>${it.cant}</output>
          <button type="button" data-mas="${esc(it.id)}" aria-label="Uno más">+</button>
        </span>
      </li>`;
    }).join("");
  }

  function popBadge() {
    cartBtn.classList.remove("is-pop");
    void cartBtn.offsetWidth;
    cartBtn.classList.add("is-pop");
  }

  let toastT;
  function avisar(txt) {
    toast.textContent = txt;
    toast.classList.add("is-on");
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove("is-on"), 1800);
  }

  function agregar(id) {
    const p = productos.find((x) => x.id === id);
    if (!p || p.agotado) return;
    const min = Math.max(1, p.minimo || 1);
    carrito[id] = { id, nombre: p.nombre, precio: p.precio, unidad: p.unidad, minimo: min, cant: min };
    persistir(); pintarControl(id); renderCarrito(); popBadge();
    avisar(`${p.nombre} · agregado a tu pedido`);
  }

  function cambiar(id, delta) {
    const it = carrito[id];
    if (!it) return;
    const n = it.cant + delta;
    if (n < (it.minimo || 1)) delete carrito[id];
    else it.cant = Math.min(n, 999);
    persistir(); pintarControl(id); renderCarrito();
    if (delta > 0) popBadge();
  }

  document.addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) { agregar(add.dataset.add); return; }
    const mas = e.target.closest("[data-mas]");
    if (mas) { cambiar(mas.dataset.mas, +1); return; }
    const menos = e.target.closest("[data-menos]");
    if (menos) { cambiar(menos.dataset.menos, -1); }
  });

  // ---- abrir / cerrar ----
  let ultimoFoco = null;
  const carritoAbierto = () => cartEl.classList.contains("is-open");

  function abrirCarrito() {
    ultimoFoco = document.activeElement;
    scrim.hidden = false;
    cartEl.inert = false;
    cartEl.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => { cartEl.classList.add("is-open"); scrim.classList.add("is-on"); });
    document.body.classList.add("no-scroll");
    if (!VISTA_PREVIA) setTimeout(() => document.getElementById("cartClose").focus(), 60);
  }
  function cerrarCarrito() {
    if (!carritoAbierto()) return;
    cartEl.classList.remove("is-open");
    scrim.classList.remove("is-on");
    cartEl.inert = true;
    cartEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
    setTimeout(() => { scrim.hidden = true; }, 250);
    if (!VISTA_PREVIA) ultimoFoco?.focus?.();
  }
  cartBtn.addEventListener("click", abrirCarrito);
  document.getElementById("cartClose").addEventListener("click", cerrarCarrito);
  scrim.addEventListener("click", cerrarCarrito);

  // ---- mandar pedido ----
  const hoy = new Date();
  document.getElementById("pFecha").min =
    `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  cartForm.addEventListener("submit", (e) => {
    e.preventDefault();
    cartError.textContent = "";
    const { items, total, consultar } = resumen();
    if (!items.length) return;

    const nombre = cartForm.nombre.value.trim();
    if (!nombre) {
      cartError.textContent = "Poné tu nombre así sabemos quién hace el pedido.";
      cartForm.nombre.focus();
      return;
    }
    const tel = cartForm.tel.value.trim();
    const fecha = cartForm.fecha.value;
    const entrega = cartForm.entrega.value;
    const nota = cartForm.nota.value.trim();

    const lineas = items.map((it) => {
      const sub = it.precio == null || it.precio === "" ? "a consultar" : plata(Number(it.precio) * it.cant);
      return `• ${it.cant} × ${it.nombre} — ${sub}`;
    });
    const fechaTxt = fecha ? fecha.split("-").reverse().join("/") : "";
    const msg = [
      "¡Hola Návora! Quiero hacer este pedido 🍬",
      "",
      ...lineas,
      "",
      total > 0 ? `Total estimado: ${plata(total)}${consultar ? " (+ productos a consultar)" : ""}` : "Precios: a consultar",
      `Nombre: ${nombre}`,
      fechaTxt ? `Para el: ${fechaTxt}` : null,
      `Entrega: ${entrega === "envio" ? "Envío" : "Retiro"}`,
      tel ? `Teléfono: ${tel}` : null,
      nota ? `Nota: ${nota}` : null
    ].filter((l) => l !== null).join("\n");

    // queda registrado para el panel (si falla, el WhatsApp sale igual)
    if (hayBase && !VISTA_PREVIA) {
      api("pedidos", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        keepalive: true,
        body: JSON.stringify({
          nombre, telefono: tel, entrega, fecha: fecha || null, nota,
          items: items.map((it) => ({ id: it.id, nombre: it.nombre, cant: it.cant, precio: it.precio ?? null })),
          total, a_consultar: consultar
        })
      }).catch(() => {});
    }

    const numero = waNumero(contenido.wa1) || "5491171004613";
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");

    if (!VISTA_PREVIA) {
      carrito = {};
      persistir();
      cartForm.reset();
      renderCarrito();
      renderCatalogo();
      cerrarCarrito();
      avisar("¡Listo! Terminá de mandar el mensaje en WhatsApp 💗");
    }
  });

  /* =========================================================
     DATOS: caché → base (o vista previa desde el panel)
     ========================================================= */
  // productos de respaldo = lo que ya está escrito en el HTML
  const respaldo = Array.from(grid.querySelectorAll(".sticker-card")).map((c, i) => ({
    id: "local-" + i,
    nombre: c.querySelector("h3")?.textContent.trim() || "",
    descripcion: c.querySelector("p")?.textContent.replace(/\s+/g, " ").trim() || "",
    etiqueta: c.querySelector(".sticker-card__tag")?.textContent.trim() || "",
    foto_url: c.querySelector("img")?.getAttribute("src") || "",
    precio: null, unidad: "", minimo: 1, categoria: "", visible: true, agotado: false, orden: i
  }));

  if (VISTA_PREVIA) {
    document.documentElement.classList.add("is-preview");
    setProductos(respaldo);
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || !e.data || typeof e.data !== "object") return;
      const { tipo } = e.data;
      if (tipo === "contenido") aplicarContenido(e.data.datos);
      if (tipo === "productos") setProductos(e.data.lista);
      if (tipo === "ir" && Number.isInteger(e.data.panel)) goTo(e.data.panel);
      if (tipo === "enfocar") {
        const card = grid.querySelector(`[data-id="${CSS.escape(String(e.data.id))}"]`);
        if (card) {
          card.scrollIntoView({ block: "center" });
          card.classList.add("is-editing");
        }
      }
      if (tipo === "carrito") {
        if (e.data.abrir) {
          // para mostrar el formulario hace falta algo en el pedido: ponemos un ejemplo
          const ej = productos.find((p) => !p.agotado);
          if (!Object.keys(carrito).length && ej) {
            carrito[ej.id] = { id: ej.id, nombre: ej.nombre, precio: ej.precio, unidad: ej.unidad, minimo: ej.minimo || 1, cant: ej.minimo || 1 };
            renderCarrito(); pintarControl(ej.id);
          }
          if (!carritoAbierto()) abrirCarrito();
        } else cerrarCarrito();
      }
    });
    window.parent?.postMessage({ tipo: "lista" }, location.origin);
    return;
  }

  const cache = cargar("navora-datos");
  aplicarContenido(cache?.contenido || {});
  setProductos(cache?.productos?.length ? cache.productos : respaldo);

  if (hayBase) {
    Promise.all([
      api("contenido?select=datos&id=eq.1"),
      api("productos?select=id,nombre,descripcion,categoria,etiqueta,precio,unidad,minimo,foto_url,visible,agotado,orden&visible=eq.true&order=orden.asc")
    ]).then(([c, p]) => {
      const datos = c?.[0]?.datos || {};
      aplicarContenido(datos);
      setProductos(p);
      guardar("navora-datos", { contenido: datos, productos: p });
    }).catch(() => { /* sin conexión: queda lo de caché o lo del HTML */ });
  }

  // ---- confetti al tocar el botón principal ----
  const bits = ["🍬", "✨", "💗", "🍭", "🎀"];
  function confetti(btn) {
    const rect = btn.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      const bit = document.createElement("span");
      bit.className = "confetti-bit";
      bit.textContent = bits[Math.floor(Math.random() * bits.length)];
      bit.style.left = `${rect.left + rect.width / 2}px`;
      bit.style.top = `${rect.top + rect.height / 2}px`;
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 70;
      bit.style.setProperty("--pop-end",
        `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist - 40}px) rotate(${Math.random() * 360}deg) scale(0.6)`);
      document.body.appendChild(bit);
      setTimeout(() => bit.remove(), 950);
    }
  }
  document.getElementById("ctaBtn")?.addEventListener("click", (e) => confetti(e.currentTarget));
});
