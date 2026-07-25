// Platify POS — app independiente para la caja del restaurante.
// Comparte la Supabase (menú, recetas) con Análisis y guarda las ventas.
import { supabase } from "../js/supabase-init.js";
import * as store from "../js/store.js";
import { money } from "../js/store.js";

const app = document.getElementById("app");
const num = (x) => { const n = parseFloat(x); return isNaN(n) ? 0 : n; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let orden = [];          // [{producto, precio, cantidad}]
let tipo = null;         // 'llevar' | 'comedor' (se elige al abrir la orden)
let mesa = "", personas = 0;
let catActiva = "Todos";
let montado = false;

// ── Sesión ──
supabase.auth.getSession().then(({ data }) => sesion(data.session));
supabase.auth.onAuthStateChange((_e, s) => sesion(s));

function sesion(s) {
  if (s && s.user) {
    if (!montado) { montado = true; store.init(); store.subscribe(() => { if (montado) render(); }); }
    render();
  } else { montado = false; login(); }
}

// ── Login ──
function login() {
  app.innerHTML = `
    <div class="login"><form class="card" id="f">
      <div class="marca"><span class="tri">▲</span> Platify POS</div>
      <p style="color:rgba(255,237,184,.7);margin:6px 0 18px">Caja · inicia sesión</p>
      <input id="correo" type="email" placeholder="Correo" autocomplete="username" required />
      <input id="pass" type="password" placeholder="Contraseña" autocomplete="current-password" required />
      <div class="err" id="err"></div>
      <button class="btn g" style="width:100%" id="b" type="submit">Entrar</button>
    </form></div>`;
  app.querySelector("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = app.querySelector("#b"); b.disabled = true; b.textContent = "Entrando…";
    const { error } = await supabase.auth.signInWithPassword({ email: app.querySelector("#correo").value.trim(), password: app.querySelector("#pass").value });
    if (error) { app.querySelector("#err").textContent = "Correo o contraseña incorrectos."; b.disabled = false; b.textContent = "Entrar"; }
  });
}

// ── Menú (de productos_venta) ──
function menu() {
  const m = new Map();
  for (const p of store.state.productos || []) {
    const nom = (p.producto || "").trim(); if (!nom) continue;
    const cat = (p.categoria || "Otros").trim() || "Otros";
    if (!m.has(nom)) m.set(nom, { producto: nom, categoria: cat, venta: 0, cantidad: 0 });
    const o = m.get(nom); o.venta += num(p.venta); o.cantidad += num(p.cantidad);
  }
  return [...m.values()]
    .map((o) => ({ ...o, precio: o.cantidad > 0 ? Math.round((o.venta / o.cantidad) * 100) / 100 : 0 }))
    .filter((o) => o.precio > 0)
    .sort((a, b) => a.producto.localeCompare(b.producto, "es"));
}
function categorias() {
  const set = new Set(); for (const p of menu()) set.add(p.categoria);
  return ["Todos", ...[...set].sort((a, b) => a.localeCompare(b, "es"))];
}
const total = () => orden.reduce((a, l) => a + l.cantidad * l.precio, 0);
const nItems = () => orden.reduce((a, l) => a + l.cantidad, 0);

function agregar(p) { const l = orden.find((x) => x.producto === p.producto); if (l) l.cantidad++; else orden.push({ producto: p.producto, precio: p.precio, cantidad: 1 }); render(); }
function cambiar(prod, d) { const i = orden.findIndex((x) => x.producto === prod); if (i < 0) return; orden[i].cantidad += d; if (orden[i].cantidad <= 0) orden.splice(i, 1); render(); }

// ── Render principal ──
function render() {
  if (!montado) return;
  const cargando = !store.state.listo;
  const prods = menu();
  const items = catActiva === "Todos" ? prods : prods.filter((p) => p.categoria === catActiva);
  const t = store.state.posTurno;
  const ventasTurno = (store.state.posVentas || []).reduce((a, v) => a + num(v.total), 0);

  app.innerHTML = `
    <header class="top">
      <span class="marca"><span class="tri" style="color:var(--orange)">▲</span> Platify <small style="font-weight:400;opacity:.8">POS</small></span>
      <span style="display:flex;gap:8px;align-items:center;font-size:13px">
        <span style="background:rgba(255,237,184,.14);padding:5px 10px;border-radius:999px">${t ? "Turno abierto · " + money(ventasTurno) : "Sin turno"}</span>
        <button class="btn sec" id="turno" style="padding:7px 12px;font-size:13px">${t ? "Corte" : "Abrir turno"}</button>
      </span>
    </header>
    <div class="pos">
      <div class="menu">
        <div class="chips">${categorias().map((c) => `<button class="chip ${c === catActiva ? "act" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        ${cargando ? `<div class="vacio">Cargando menú…</div>`
          : !items.length ? `<div class="vacio">No hay productos con precio en esta categoría.</div>`
          : `<div class="grid">${items.map((p) => `
              <button class="prod" data-p="${esc(p.producto)}"><b>${esc(p.producto)}</b><span class="p">${money(p.precio)}</span></button>`).join("")}</div>`}
      </div>
      <div class="cuenta">
        <h2 style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span>${tipo === "comedor" ? `🍽️ Mesa ${esc(mesa)} · ${personas}p` : tipo === "llevar" ? "🥡 Para llevar" : "Cuenta"}${nItems() ? ` · ${nItems()}` : ""}</span>
          <button id="nuevaorden" style="background:none;border:none;color:var(--teal);font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">${tipo ? "Cambiar" : ""}</button>
        </h2>
        <div class="items">${orden.length ? orden.map((l) => `
          <div class="li">
            <span class="n">${esc(l.producto)}<br><span style="color:var(--muted);font-size:12px">${money(l.precio)} c/u</span></span>
            <button class="qbtn" data-m="${esc(l.producto)}">−</button>
            <b style="min-width:20px;text-align:center">${l.cantidad}</b>
            <button class="qbtn" data-a="${esc(l.producto)}">+</button>
            <b style="width:64px;text-align:right">${money(l.cantidad * l.precio)}</b>
          </div>`).join("") : `<div class="vacio">Toca productos para agregarlos.</div>`}
        </div>
        <div class="foot">
          <div class="tot"><span>Total</span><span>${money(total())}</span></div>
          <button class="btn" id="cobrar" style="width:100%" ${orden.length ? "" : "disabled"}>Cobrar ${orden.length ? money(total()) : ""}</button>
        </div>
      </div>
    </div>`;

  app.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { catActiva = b.dataset.c; render(); }));
  app.querySelectorAll(".prod").forEach((b) => b.addEventListener("click", () => { const p = prods.find((x) => x.producto === b.dataset.p); if (p) agregar(p); }));
  app.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => cambiar(b.dataset.a, 1)));
  app.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => cambiar(b.dataset.m, -1)));
  const cb = app.querySelector("#cobrar"); if (cb) cb.addEventListener("click", modalCobro);
  app.querySelector("#turno").addEventListener("click", t ? modalCorte : modalTurno);
  const no = app.querySelector("#nuevaorden"); if (no) no.addEventListener("click", modalNuevaOrden);

  // Al abrir/empezar una orden hay que elegir tipo (para llevar / comedor + mesa).
  if (!tipo && !document.getElementById("nueva-orden")) modalNuevaOrden();
}

// ── Nueva orden: para llevar o comedor (mesa + personas) ──
function modalNuevaOrden() {
  let paso = "tipo", mMesa = mesa || "", mPers = personas || 2;
  const bg = document.createElement("div"); bg.className = "bg"; bg.id = "nueva-orden";
  function dib() {
    if (paso === "tipo") {
      bg.innerHTML = `<div class="modal">
        <h2 style="margin:0 0 4px;color:var(--green)">Nueva orden</h2>
        <p style="color:var(--muted);font-size:14px;margin:0 0 14px">¿Cómo es el pedido?</p>
        <div style="display:flex;gap:10px">
          <button class="btn sec" id="llevar" style="flex:1;padding:24px 12px;font-size:16px;line-height:1.4">🥡<br>Para llevar</button>
          <button class="btn" id="comedor" style="flex:1;padding:24px 12px;font-size:16px;line-height:1.4">🍽️<br>Comedor</button>
        </div></div>`;
      bg.querySelector("#llevar").addEventListener("click", () => { tipo = "llevar"; mesa = ""; personas = 0; bg.remove(); render(); });
      bg.querySelector("#comedor").addEventListener("click", () => { paso = "mesa"; dib(); });
    } else {
      bg.innerHTML = `<div class="modal">
        <h2 style="margin:0 0 8px;color:var(--green)">Comedor · elige mesa</h2>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px">
          ${Array.from({ length: 20 }, (_, i) => i + 1).map((n) => `<button class="mesabtn" data-n="${n}" style="padding:14px 0;border-radius:12px;border:2px solid ${mMesa == String(n) ? "var(--teal)" : "var(--line)"};background:${mMesa == String(n) ? "rgba(46,196,182,.12)" : "#fff"};font-weight:800;font-size:16px;color:var(--green)">${n}</button>`).join("")}
        </div>
        <label style="font-size:13px;color:var(--muted)">Personas en la mesa</label>
        <div style="display:flex;align-items:center;gap:16px;justify-content:center;margin:6px 0 16px">
          <button class="qbtn" id="pm" style="width:40px;height:40px;font-size:22px">−</button>
          <b style="font-size:24px;min-width:36px;text-align:center">${mPers}</b>
          <button class="qbtn" id="pp" style="width:40px;height:40px;font-size:22px">+</button>
        </div>
        <button class="btn" id="ok" style="width:100%" ${mMesa ? "" : "disabled"}>Continuar</button>
        <button class="btn sec" id="atras" style="width:100%;margin-top:8px">← Atrás</button>
      </div>`;
      bg.querySelectorAll(".mesabtn").forEach((b) => b.addEventListener("click", () => { mMesa = b.dataset.n; dib(); }));
      bg.querySelector("#pm").addEventListener("click", () => { mPers = Math.max(1, mPers - 1); dib(); });
      bg.querySelector("#pp").addEventListener("click", () => { mPers++; dib(); });
      bg.querySelector("#atras").addEventListener("click", () => { paso = "tipo"; dib(); });
      bg.querySelector("#ok").addEventListener("click", () => { if (!mMesa) return; tipo = "comedor"; mesa = mMesa; personas = mPers; bg.remove(); render(); });
    }
  }
  dib(); document.body.appendChild(bg);
  bg.addEventListener("click", (e) => { if (e.target === bg && tipo) bg.remove(); }); // solo se puede cerrar si ya hay tipo
}

// ── Cobro ──
function modalCobro() {
  if (!orden.length) return;
  let metodo = "efectivo", recibido = "";
  const bg = document.createElement("div"); bg.className = "bg";
  function dib() {
    const cambio = Math.max(0, num(recibido) - total());
    bg.innerHTML = `
      <div class="modal">
        <div class="tot"><span>Total a cobrar</span><span>${money(total())}</span></div>
        <div class="metodos">
          ${["efectivo", "tarjeta", "transferencia"].map((mm) => `<button data-mm="${mm}" class="${mm === metodo ? "act" : ""}">${mm === "efectivo" ? "💵 Efectivo" : mm === "tarjeta" ? "💳 Tarjeta" : "↔ Transfer."}</button>`).join("")}
        </div>
        ${metodo === "efectivo" ? `
          <label style="font-size:13px;color:var(--muted)">Recibido</label>
          <input id="rec" type="number" inputmode="decimal" placeholder="0" value="${esc(String(recibido))}" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--line);margin:4px 0 8px" />
          <div class="tot" style="font-size:18px"><span>Cambio</span><span style="color:var(--orange)">${money(cambio)}</span></div>` : `<p style="color:var(--muted);font-size:14px;margin:8px 0">Se registra el pago con ${metodo}.</p>`}
        <button class="btn" id="ok" style="width:100%;margin-top:8px">✅ Confirmar cobro</button>
        <button class="btn sec" id="cancel" style="width:100%;margin-top:8px">Cancelar</button>
        <div class="err" id="msg" style="text-align:center;color:var(--rojo)"></div>
      </div>`;
    bg.querySelectorAll("[data-mm]").forEach((b) => b.addEventListener("click", () => { metodo = b.dataset.mm; dib(); }));
    const rec = bg.querySelector("#rec"); if (rec) rec.addEventListener("input", (e) => { recibido = e.target.value; bg.querySelector(".modal .tot:last-of-type span:last-child").textContent = money(Math.max(0, num(recibido) - total())); });
    bg.querySelector("#cancel").addEventListener("click", () => bg.remove());
    bg.querySelector("#ok").addEventListener("click", async () => {
      if (metodo === "efectivo" && num(recibido) < total()) { bg.querySelector("#msg").textContent = "El efectivo recibido es menor al total."; return; }
      const b = bg.querySelector("#ok"); b.disabled = true; b.textContent = "Guardando…";
      try {
        await store.guardarVenta({
          items: orden.map((l) => ({ producto: l.producto, cantidad: l.cantidad, precio: l.precio, importe: l.cantidad * l.precio })),
          total: total(), metodo, recibido: metodo === "efectivo" ? num(recibido) : total(), cambio: metodo === "efectivo" ? Math.max(0, num(recibido) - total()) : 0,
          tipo: tipo || "llevar", mesa, personas,
        });
        orden = []; tipo = null; mesa = ""; personas = 0; bg.remove(); render();
      } catch (e) { b.disabled = false; b.textContent = "✅ Confirmar cobro"; bg.querySelector("#msg").textContent = "Error: " + ((e && e.message) || e); }
    });
  }
  dib(); document.body.appendChild(bg); bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
}

// ── Turno ──
function modalTurno() {
  const bg = document.createElement("div"); bg.className = "bg";
  bg.innerHTML = `
    <div class="modal">
      <h2 style="margin:0 0 8px;color:var(--green)">Abrir turno</h2>
      <p style="color:var(--muted);font-size:14px;margin:0 0 10px">Con qué efectivo empiezas la caja (fondo).</p>
      <input id="fondo" type="number" inputmode="decimal" placeholder="Fondo inicial (ej. 500)" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--line);margin-bottom:10px" />
      <button class="btn" id="ok" style="width:100%">Abrir turno</button>
      <button class="btn sec" id="cancel" style="width:100%;margin-top:8px">Cancelar</button>
    </div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  bg.querySelector("#cancel").addEventListener("click", () => bg.remove());
  bg.querySelector("#ok").addEventListener("click", async () => {
    const b = bg.querySelector("#ok"); b.disabled = true; b.textContent = "…";
    try { await store.abrirTurno(num(bg.querySelector("#fondo").value)); bg.remove(); render(); }
    catch (e) { b.disabled = false; b.textContent = "Abrir turno"; alert("Error: " + ((e && e.message) || e)); }
  });
}

// ── Corte ──
function modalCorte() {
  const t = store.state.posTurno; if (!t) return;
  const ventas = store.state.posVentas || [];
  const porMetodo = (m) => ventas.filter((v) => v.metodo === m).reduce((a, v) => a + num(v.total), 0);
  const efectivo = porMetodo("efectivo"), tarjeta = porMetodo("tarjeta"), transfer = porMetodo("transferencia");
  const totalV = efectivo + tarjeta + transfer;
  const esperado = num(t.fondo_inicial) + efectivo;
  const bg = document.createElement("div"); bg.className = "bg";
  bg.innerHTML = `
    <div class="modal">
      <h2 style="margin:0 0 8px;color:var(--green)">Corte de caja</h2>
      <div style="font-size:14px;line-height:1.9">
        <div style="display:flex;justify-content:space-between"><span>Ventas del turno</span><b>${money(totalV)} · ${ventas.length}</b></div>
        <div style="display:flex;justify-content:space-between;color:var(--muted)"><span>💵 Efectivo</span><span>${money(efectivo)}</span></div>
        <div style="display:flex;justify-content:space-between;color:var(--muted)"><span>💳 Tarjeta</span><span>${money(tarjeta)}</span></div>
        <div style="display:flex;justify-content:space-between;color:var(--muted)"><span>↔ Transferencia</span><span>${money(transfer)}</span></div>
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:6px;margin-top:6px"><span>Fondo inicial</span><span>${money(t.fondo_inicial)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;color:var(--green)"><span>Efectivo esperado en caja</span><span>${money(esperado)}</span></div>
      </div>
      <label style="font-size:13px;color:var(--muted);margin-top:10px;display:block">Efectivo contado (opcional)</label>
      <input id="contado" type="number" inputmode="decimal" placeholder="0" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);margin:4px 0 6px" />
      <div id="dif" class="sub" style="text-align:right;font-size:13px;color:var(--muted);min-height:1.1em"></div>
      <button class="btn g" id="cerrar" style="width:100%;margin-top:6px">Cerrar turno</button>
      <button class="btn sec" id="cancel" style="width:100%;margin-top:8px">Seguir vendiendo</button>
      <div class="err" id="msg" style="text-align:center;color:var(--rojo)"></div>
    </div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  bg.querySelector("#cancel").addEventListener("click", () => bg.remove());
  const cont = bg.querySelector("#contado");
  cont.addEventListener("input", () => { const d = num(cont.value) - esperado; bg.querySelector("#dif").textContent = cont.value === "" ? "" : (d === 0 ? "Cuadra ✓" : (d > 0 ? "Sobran " : "Faltan ") + money(Math.abs(d))); });
  bg.querySelector("#cerrar").addEventListener("click", async () => {
    if (!confirm("¿Cerrar el turno? Ya no podrás agregarle ventas.")) return;
    const b = bg.querySelector("#cerrar"); b.disabled = true; b.textContent = "…";
    try { await store.cerrarTurno(num(cont.value), ""); bg.remove(); render(); }
    catch (e) { b.disabled = false; b.textContent = "Cerrar turno"; bg.querySelector("#msg").textContent = "Error: " + ((e && e.message) || e); }
  });
}
