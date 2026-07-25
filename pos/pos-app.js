// Platify POS — app independiente para la caja del restaurante.
// Pantalla principal = mapa de mesas (tu layout) con el estado y total de cada una.
// Cada mesa guarda su cuenta abierta hasta cobrarse. Comparte Supabase con Análisis.
import { supabase } from "../js/supabase-init.js";
import * as store from "../js/store.js";
import { money } from "../js/store.js";

const app = document.getElementById("app");
const num = (x) => { const n = parseFloat(x); return isNaN(n) ? 0 : n; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let vista = "mesas";     // mesas | orden | config
let ordenActual = null;  // { id?, mesa, tipo, personas, items:[{producto,cantidad,precio}] }
let catActiva = "Todos";
let montado = false;
let persistTimer = null;

// ── Sesión ──
supabase.auth.getSession().then(({ data }) => sesion(data.session));
supabase.auth.onAuthStateChange((_e, s) => sesion(s));
function sesion(s) {
  if (s && s.user) {
    if (!montado) { montado = true; store.init(); store.subscribe(() => { if (montado) render(); }); }
    render();
  } else { montado = false; login(); }
}

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
const categorias = () => { const s = new Set(); for (const p of menu()) s.add(p.categoria); return ["Todos", ...[...s].sort((a, b) => a.localeCompare(b, "es"))]; };
const itemsTotal = (items) => (items || []).reduce((a, l) => a + l.cantidad * l.precio, 0);

function render() {
  if (!montado) return;
  if (vista === "orden" && ordenActual) return renderOrden();
  if (vista === "config") return renderConfig();
  return renderMesas();
}

// ════════ PANTALLA PRINCIPAL: MAPA DE MESAS ════════
function renderMesas() {
  const t = store.state.posTurno;
  const ordenes = store.state.posOrdenes || [];
  const mesas = store.state.posMesas || [];
  const llevar = ordenes.filter((o) => o.tipo === "llevar");
  const ocupadas = ordenes.filter((o) => o.tipo === "comedor").length;
  const totalAbierto = ordenes.reduce((a, o) => a + num(o.total), 0);
  const ventasTurno = (store.state.posVentas || []).reduce((a, v) => a + num(v.total), 0);

  const zonas = {};
  for (const m of mesas) { const z = (m.zona || "Salón").trim() || "Salón"; (zonas[z] = zonas[z] || []).push(m); }

  const mesaCard = (m) => {
    const o = store.ordenDeMesa(m.nombre);
    return `<button class="mesa ${o ? "occ" : ""}" data-mesa="${esc(m.nombre)}">
      <b>${esc(m.nombre)}</b>
      ${o ? `<span class="mt">${money(o.total)}</span><span class="mp">${o.personas || "-"}p · ${(o.items || []).length} art</span>` : `<span class="ml">Libre</span>`}
    </button>`;
  };

  app.innerHTML = `
    <header class="top">
      <span class="marca"><span class="tri" style="color:var(--orange)">▲</span> Platify <small style="font-weight:400;opacity:.8">POS</small></span>
      <button class="btn sec" id="turno" style="padding:7px 12px;font-size:13px">${t ? "Corte de caja" : "Abrir turno"}</button>
    </header>
    <div style="padding:12px">
      <div class="resumen">
        <div class="rcard"><div class="n">${ocupadas}</div><div class="l">Mesas ocupadas</div></div>
        <div class="rcard"><div class="n">${money(totalAbierto)}</div><div class="l">Cuentas abiertas</div></div>
        <div class="rcard"><div class="n">${money(ventasTurno)}</div><div class="l">${t ? "Ventas del turno" : "Ventas de hoy"}</div></div>
      </div>
      ${!mesas.length ? `<div class="vacio">Aún no tienes mesas. Toca <b>⚙️ Configurar mesas</b> para poner tu layout.</div>`
        : Object.entries(zonas).map(([z, ms]) => `<div class="zona"><div class="zt">${esc(z)}</div><div class="mesas">${ms.map(mesaCard).join("")}</div></div>`).join("")}
      <div class="zona"><div class="zt">Para llevar / mostrador</div>
        <div class="mesas">
          ${llevar.map((o) => `<button class="mesa llev" data-llevar="${o.id}"><b>🥡</b><span class="mt">${money(o.total)}</span><span class="mp">${(o.items || []).length} art</span></button>`).join("")}
          <button class="mesa nueva" id="nuevallevar">🥡<br>Nueva</button>
        </div>
      </div>
      <button class="btn sec" id="config" style="width:100%;margin-top:6px">⚙️ Configurar mesas</button>
    </div>`;

  app.querySelector("#turno").addEventListener("click", t ? modalCorte : modalTurno);
  app.querySelector("#config").addEventListener("click", () => { vista = "config"; render(); });
  app.querySelector("#nuevallevar").addEventListener("click", () => { ordenActual = { mesa: "", tipo: "llevar", personas: 0, items: [] }; catActiva = "Todos"; vista = "orden"; render(); });
  app.querySelectorAll("[data-llevar]").forEach((b) => b.addEventListener("click", () => {
    const o = (store.state.posOrdenes || []).find((x) => x.id === b.dataset.llevar);
    if (o) { ordenActual = { ...o, items: (o.items || []).map((x) => ({ ...x })) }; catActiva = "Todos"; vista = "orden"; render(); }
  }));
  app.querySelectorAll("[data-mesa]").forEach((b) => b.addEventListener("click", () => abrirMesa(b.dataset.mesa)));
}

function abrirMesa(nombre) {
  const o = store.ordenDeMesa(nombre);
  if (o) { ordenActual = { ...o, items: (o.items || []).map((x) => ({ ...x })) }; catActiva = "Todos"; vista = "orden"; render(); return; }
  // mesa libre → pedir personas
  let p = 2;
  const bg = modal(`
    <h2 style="margin:0 0 8px;color:var(--green)">Mesa ${esc(nombre)}</h2>
    <label style="font-size:13px;color:var(--muted)">¿Cuántas personas?</label>
    <div style="display:flex;align-items:center;gap:16px;justify-content:center;margin:8px 0 16px">
      <button class="qbtn" id="pm" style="width:44px;height:44px;font-size:24px">−</button>
      <b id="pn" style="font-size:26px;min-width:40px;text-align:center">${p}</b>
      <button class="qbtn" id="pp" style="width:44px;height:44px;font-size:24px">+</button>
    </div>
    <button class="btn" id="ok" style="width:100%">Abrir mesa</button>
    <button class="btn sec" id="cancel" style="width:100%;margin-top:8px">Cancelar</button>`);
  const pn = bg.querySelector("#pn");
  bg.querySelector("#pm").addEventListener("click", () => { p = Math.max(1, p - 1); pn.textContent = p; });
  bg.querySelector("#pp").addEventListener("click", () => { p++; pn.textContent = p; });
  bg.querySelector("#cancel").addEventListener("click", () => bg.remove());
  bg.querySelector("#ok").addEventListener("click", () => { ordenActual = { mesa: nombre, tipo: "comedor", personas: p, items: [] }; catActiva = "Todos"; bg.remove(); vista = "orden"; render(); });
}

// ════════ ORDEN (menú + cuenta de una mesa/llevar) ════════
function persistir() {
  if (!ordenActual) return;
  ordenActual.total = itemsTotal(ordenActual.items);
  clearTimeout(persistTimer);
  const snap = ordenActual;
  persistTimer = setTimeout(async () => {
    try {
      if (!snap.items.length) { if (snap.id) { const id = snap.id; snap.id = null; await store.borrarOrden(id); } return; }
      const id = await store.guardarOrden(snap); snap.id = id;
    } catch (e) { console.warn("guardar orden:", e); }
  }, 350);
}
function addItem(p) {
  const l = ordenActual.items.find((x) => x.producto === p.producto);
  if (l) l.cantidad++; else ordenActual.items.push({ producto: p.producto, precio: p.precio, cantidad: 1 });
  render(); persistir();
}
function chgItem(prod, d) {
  const i = ordenActual.items.findIndex((x) => x.producto === prod); if (i < 0) return;
  ordenActual.items[i].cantidad += d; if (ordenActual.items[i].cantidad <= 0) ordenActual.items.splice(i, 1);
  render(); persistir();
}

function renderOrden() {
  const prods = menu();
  const items = catActiva === "Todos" ? prods : prods.filter((p) => p.categoria === catActiva);
  const o = ordenActual;
  const totalN = itemsTotal(o.items);
  const nItems = (o.items || []).reduce((a, l) => a + l.cantidad, 0);

  app.innerHTML = `
    <header class="top">
      <button class="btn sec" id="volver" style="padding:7px 12px;font-size:14px">‹ Mesas</button>
      <span style="font-weight:800">${o.tipo === "comedor" ? `🍽️ Mesa ${esc(o.mesa)} · ${o.personas}p` : "🥡 Para llevar"}</span>
      <span style="width:70px"></span>
    </header>
    <div class="pos">
      <div class="menu">
        <div class="chips">${categorias().map((c) => `<button class="chip ${c === catActiva ? "act" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        ${!store.state.listo ? `<div class="vacio">Cargando menú…</div>`
          : !items.length ? `<div class="vacio">No hay productos con precio aquí.</div>`
          : `<div class="grid">${items.map((p) => `<button class="prod" data-p="${esc(p.producto)}"><b>${esc(p.producto)}</b><span class="p">${money(p.precio)}</span></button>`).join("")}</div>`}
      </div>
      <div class="cuenta">
        <h2>Cuenta${nItems ? ` · ${nItems}` : ""}</h2>
        <div class="items">${o.items.length ? o.items.map((l) => `
          <div class="li">
            <span class="n">${esc(l.producto)}<br><span style="color:var(--muted);font-size:12px">${money(l.precio)} c/u</span></span>
            <button class="qbtn" data-m="${esc(l.producto)}">−</button>
            <b style="min-width:20px;text-align:center">${l.cantidad}</b>
            <button class="qbtn" data-a="${esc(l.producto)}">+</button>
            <b style="width:64px;text-align:right">${money(l.cantidad * l.precio)}</b>
          </div>`).join("") : `<div class="vacio">Toca productos para agregarlos.</div>`}
        </div>
        <div class="foot">
          <div class="tot"><span>Total</span><span>${money(totalN)}</span></div>
          <button class="btn" id="cobrar" style="width:100%" ${o.items.length ? "" : "disabled"}>Cobrar ${o.items.length ? money(totalN) : ""}</button>
          ${o.id || o.items.length ? `<button class="btn sec" id="borrar" style="width:100%;margin-top:8px;color:var(--rojo)">Cancelar cuenta</button>` : ""}
        </div>
      </div>
    </div>`;

  app.querySelector("#volver").addEventListener("click", () => { vista = "mesas"; ordenActual = null; render(); });
  app.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { catActiva = b.dataset.c; render(); }));
  app.querySelectorAll(".prod").forEach((b) => b.addEventListener("click", () => { const p = prods.find((x) => x.producto === b.dataset.p); if (p) addItem(p); }));
  app.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => chgItem(b.dataset.a, 1)));
  app.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => chgItem(b.dataset.m, -1)));
  const cb = app.querySelector("#cobrar"); if (cb) cb.addEventListener("click", modalCobro);
  const bo = app.querySelector("#borrar"); if (bo) bo.addEventListener("click", async () => {
    if (!confirm("¿Cancelar esta cuenta? Se pierde lo agregado.")) return;
    if (o.id) await store.borrarOrden(o.id);
    vista = "mesas"; ordenActual = null; render();
  });
}

// ════════ CONFIGURAR MESAS ════════
function renderConfig() {
  const mesas = store.state.posMesas || [];
  app.innerHTML = `
    <header class="top"><button class="btn sec" id="volver" style="padding:7px 12px;font-size:14px">‹ Mesas</button><span style="font-weight:800">Configurar mesas</span><span style="width:60px"></span></header>
    <div style="padding:14px;max-width:640px;margin:0 auto">
      <div style="background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px">
        <div style="font-weight:800;color:var(--green);margin-bottom:8px">Agregar mesa</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="mn" placeholder="Nombre/número (ej. 5, Terraza 2)" style="flex:2;min-width:140px;padding:12px;border-radius:10px;border:1px solid var(--line)" />
          <input id="mz" placeholder="Zona (opcional)" style="flex:1;min-width:110px;padding:12px;border-radius:10px;border:1px solid var(--line)" />
          <button class="btn" id="add">Agregar</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="rango" type="number" min="1" max="60" placeholder="# de mesas" style="width:120px;padding:10px;border-radius:10px;border:1px solid var(--line)" />
          <button class="btn sec" id="addrango">＋ Crear 1…N de golpe</button>
        </div>
      </div>
      <div style="font-weight:800;color:var(--green);margin:0 2px 8px">Mis mesas (${mesas.length})</div>
      <div id="lista">${mesas.length ? mesas.map((m) => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:8px">
          <span><b style="color:var(--green)">${esc(m.nombre)}</b>${m.zona ? ` <span style="color:var(--muted);font-size:13px">· ${esc(m.zona)}</span>` : ""}</span>
          <button data-del="${m.id}" style="background:none;border:none;color:var(--rojo);font-size:16px;cursor:pointer">✕ Quitar</button>
        </div>`).join("") : `<div class="vacio">Aún no hay mesas.</div>`}</div>
    </div>`;

  app.querySelector("#volver").addEventListener("click", () => { vista = "mesas"; render(); });
  const addUna = async () => {
    const nombre = app.querySelector("#mn").value.trim(); if (!nombre) return;
    try { await store.guardarMesa(nombre, app.querySelector("#mz").value.trim()); render(); } catch (e) { alert("Error: " + ((e && e.message) || e)); }
  };
  app.querySelector("#add").addEventListener("click", addUna);
  app.querySelector("#addrango").addEventListener("click", async () => {
    const n = Math.min(60, Math.max(0, parseInt(app.querySelector("#rango").value, 10) || 0));
    if (!n) return; const zona = app.querySelector("#mz").value.trim();
    const btn = app.querySelector("#addrango"); btn.disabled = true; btn.textContent = "Creando…";
    try { for (let i = 1; i <= n; i++) await store.guardarMesa(String(i), zona); render(); } catch (e) { alert("Error: " + ((e && e.message) || e)); }
  });
  app.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => { if (confirm("¿Quitar esta mesa?")) { await store.borrarMesa(b.dataset.del); render(); } }));
}

// ════════ MODALES ════════
function modal(html) {
  const bg = document.createElement("div"); bg.className = "bg";
  bg.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(bg);
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  return bg;
}

function modalCobro() {
  const o = ordenActual; if (!o || !o.items.length) return;
  const tot = itemsTotal(o.items);
  let metodo = "efectivo", recibido = "";
  const bg = document.createElement("div"); bg.className = "bg"; document.body.appendChild(bg);
  bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  function dib() {
    const cambio = Math.max(0, num(recibido) - tot);
    bg.innerHTML = `<div class="modal">
      <div class="tot"><span>Total a cobrar</span><span>${money(tot)}</span></div>
      <div class="metodos">${["efectivo", "tarjeta", "transferencia"].map((mm) => `<button data-mm="${mm}" class="${mm === metodo ? "act" : ""}">${mm === "efectivo" ? "💵 Efectivo" : mm === "tarjeta" ? "💳 Tarjeta" : "↔ Transfer."}</button>`).join("")}</div>
      ${metodo === "efectivo" ? `<label style="font-size:13px;color:var(--muted)">Recibido</label>
        <input id="rec" type="number" inputmode="decimal" placeholder="0" value="${esc(String(recibido))}" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--line);margin:4px 0 8px" />
        <div class="tot" style="font-size:18px"><span>Cambio</span><span style="color:var(--orange)">${money(cambio)}</span></div>` : `<p style="color:var(--muted);font-size:14px;margin:8px 0">Se registra el pago con ${metodo}.</p>`}
      <button class="btn" id="ok" style="width:100%;margin-top:8px">✅ Confirmar cobro</button>
      <button class="btn sec" id="cancel" style="width:100%;margin-top:8px">Cancelar</button>
      <div class="err" id="msg" style="text-align:center;color:var(--rojo)"></div>`;
    bg.querySelectorAll("[data-mm]").forEach((b) => b.addEventListener("click", () => { metodo = b.dataset.mm; dib(); }));
    const rec = bg.querySelector("#rec"); if (rec) rec.addEventListener("input", (e) => {
      recibido = e.target.value;
      const cam = bg.querySelector(".tot:last-of-type span:last-child");
      if (cam) cam.textContent = money(Math.max(0, num(recibido) - tot));
    });
    bg.querySelector("#cancel").addEventListener("click", () => bg.remove());
    bg.querySelector("#ok").addEventListener("click", async () => {
      if (metodo === "efectivo" && num(recibido) < tot) { bg.querySelector("#msg").textContent = "El efectivo recibido es menor al total."; return; }
      const b = bg.querySelector("#ok"); b.disabled = true; b.textContent = "Guardando…";
      try {
        await store.cobrarOrden({ ...o, total: tot }, { metodo, recibido: metodo === "efectivo" ? num(recibido) : tot, cambio: metodo === "efectivo" ? Math.max(0, num(recibido) - tot) : 0 });
        bg.remove(); ordenActual = null; vista = "mesas"; render();
      } catch (e) { b.disabled = false; b.textContent = "✅ Confirmar cobro"; bg.querySelector("#msg").textContent = "Error: " + ((e && e.message) || e); }
    });
  }
  dib();
}

function modalTurno() {
  const bg = modal(`
    <h2 style="margin:0 0 8px;color:var(--green)">Abrir turno</h2>
    <p style="color:var(--muted);font-size:14px;margin:0 0 10px">Con qué efectivo empiezas la caja (fondo).</p>
    <input id="fondo" type="number" inputmode="decimal" placeholder="Fondo inicial (ej. 500)" style="width:100%;padding:14px;border-radius:12px;border:1px solid var(--line);margin-bottom:10px" />
    <button class="btn" id="ok" style="width:100%">Abrir turno</button>
    <button class="btn sec" id="cancel" style="width:100%;margin-top:8px">Cancelar</button>`);
  bg.querySelector("#cancel").addEventListener("click", () => bg.remove());
  bg.querySelector("#ok").addEventListener("click", async () => {
    const b = bg.querySelector("#ok"); b.disabled = true; b.textContent = "…";
    try { await store.abrirTurno(num(bg.querySelector("#fondo").value)); bg.remove(); render(); }
    catch (e) { b.disabled = false; b.textContent = "Abrir turno"; alert("Error: " + ((e && e.message) || e)); }
  });
}

function modalCorte() {
  const t = store.state.posTurno; if (!t) return;
  const ventas = store.state.posVentas || [];
  const pm = (m) => ventas.filter((v) => v.metodo === m).reduce((a, v) => a + num(v.total), 0);
  const efe = pm("efectivo"), tar = pm("tarjeta"), tra = pm("transferencia");
  const totalV = efe + tar + tra, esperado = num(t.fondo_inicial) + efe;
  const abiertas = (store.state.posOrdenes || []).length;
  const bg = modal(`
    <h2 style="margin:0 0 8px;color:var(--green)">Corte de caja</h2>
    <div style="font-size:14px;line-height:1.9">
      <div style="display:flex;justify-content:space-between"><span>Ventas del turno</span><b>${money(totalV)} · ${ventas.length}</b></div>
      <div style="display:flex;justify-content:space-between;color:var(--muted)"><span>💵 Efectivo</span><span>${money(efe)}</span></div>
      <div style="display:flex;justify-content:space-between;color:var(--muted)"><span>💳 Tarjeta</span><span>${money(tar)}</span></div>
      <div style="display:flex;justify-content:space-between;color:var(--muted)"><span>↔ Transferencia</span><span>${money(tra)}</span></div>
      <div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:6px;margin-top:6px"><span>Fondo inicial</span><span>${money(t.fondo_inicial)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;color:var(--green)"><span>Efectivo esperado</span><span>${money(esperado)}</span></div>
    </div>
    ${abiertas ? `<div style="background:#fff6df;border:1px solid #efd799;border-radius:10px;padding:8px 10px;font-size:13px;margin-top:10px">⚠️ Hay ${abiertas} cuenta(s) abierta(s) sin cobrar.</div>` : ""}
    <label style="font-size:13px;color:var(--muted);margin-top:10px;display:block">Efectivo contado (opcional)</label>
    <input id="contado" type="number" inputmode="decimal" placeholder="0" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);margin:4px 0 6px" />
    <div id="dif" style="text-align:right;font-size:13px;color:var(--muted);min-height:1.1em"></div>
    <button class="btn g" id="cerrar" style="width:100%;margin-top:6px">Cerrar turno</button>
    <button class="btn sec" id="cancel" style="width:100%;margin-top:8px">Seguir</button>
    <div class="err" id="msg" style="text-align:center;color:var(--rojo)"></div>`);
  bg.querySelector("#cancel").addEventListener("click", () => bg.remove());
  const cont = bg.querySelector("#contado");
  cont.addEventListener("input", () => { const d = num(cont.value) - esperado; bg.querySelector("#dif").textContent = cont.value === "" ? "" : (d === 0 ? "Cuadra ✓" : (d > 0 ? "Sobran " : "Faltan ") + money(Math.abs(d))); });
  bg.querySelector("#cerrar").addEventListener("click", async () => {
    if (!confirm("¿Cerrar el turno?")) return;
    const b = bg.querySelector("#cerrar"); b.disabled = true; b.textContent = "…";
    try { await store.cerrarTurno(num(cont.value), ""); bg.remove(); render(); }
    catch (e) { b.disabled = false; b.textContent = "Cerrar turno"; bg.querySelector("#msg").textContent = "Error: " + ((e && e.message) || e); }
  });
}
