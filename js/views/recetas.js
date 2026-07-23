// Pantalla: Recetas — el "cerebro". Cada platillo → insumos + cantidad.
//   costo   = Σ (cantidad × precio de compra del insumo)   ← automático
//   margen  = precio de venta − costo
// Soporta PREPARACIONES base (salsas, masas) que se reusan en varios platillos.
// Al guardar, escribe el costo en costos_platillo → el Margen se actualiza solo.
import * as store from "../store.js";
import { money } from "../store.js";
import { parsearCSV, descargarCSV } from "../csv.js";

const num = (x) => { const n = parseFloat(x); return isNaN(n) ? 0 : n; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const colorMargen = (pct) => pct == null ? "var(--sub)" : pct >= 65 ? "var(--verde)" : pct >= 45 ? "#c9740a" : "var(--rojo)";

// Platillos (de productos_venta), agregados por nombre, con su precio de venta.
function platillos() {
  const m = new Map();
  for (const p of store.state.productos || []) {
    const nom = (p.producto || "").trim();
    if (!nom) continue;
    if (!m.has(nom)) m.set(nom, { producto: nom, categoria: p.categoria || "", venta: 0, cantidad: 0 });
    const o = m.get(nom); o.venta += num(p.venta); o.cantidad += num(p.cantidad);
  }
  return [...m.values()].map((o) => ({ ...o, precio: o.cantidad > 0 ? o.venta / o.cantidad : 0 }))
    .sort((a, b) => b.venta - a.venta);
}

// Preparaciones base existentes (recetas con es_preparacion).
function preparaciones() {
  const set = new Set();
  for (const r of store.state.recetas || []) if (r.es_preparacion) set.add(r.producto);
  return [...set].sort();
}

// Agrupa las filas de un CSV en recetas. Una fila por ingrediente; se agrupan por 'platillo'.
function gruposDesdeCSV(objs) {
  const n2 = (x) => { const n = parseFloat(String(x).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
  const esSi = (v) => /^(s[ií]|1|true|x|yes)$/i.test(String(v || "").trim());
  const map = new Map();
  for (const o of objs) {
    const prod = (o.platillo || o.receta || o.producto || "").trim();
    const insumo = (o.insumo || o.ingrediente || "").trim();
    if (!prod || !insumo) continue;
    if (!map.has(prod)) map.set(prod, { producto: prod, es_preparacion: false, rendimiento: 1, rinde_unidad: "", items: [] });
    const g = map.get(prod);
    if (esSi(o.es_preparacion || o.preparacion || o.subreceta)) g.es_preparacion = true;
    if (o.rendimiento) g.rendimiento = n2(o.rendimiento) || 1;
    const ru = (o.rinde_unidad || o.unidad_rinde || o.unidad_preparacion || "").trim();
    if (ru) g.rinde_unidad = ru;
    g.items.push({ insumo, cantidad: n2(o.cantidad), unidad: (o.unidad || "").trim() });
  }
  return [...map.values()];
}

// Descarga un CSV con el formato correcto y ejemplos, para armar las recetas ahí.
function descargarPlantilla() {
  descargarCSV("plantilla-recetas-platify",
    ["platillo", "insumo", "cantidad", "unidad", "es_preparacion", "rendimiento", "rinde_unidad"],
    [
      ["Chilaquiles Verdes", "Tortilla", "0.15", "kg", "", "", ""],
      ["Chilaquiles Verdes", "Salsa verde", "0.12", "L", "", "", ""],
      ["Chilaquiles Verdes", "Queso fresco", "0.05", "kg", "", "", ""],
      ["Chilaquiles Verdes", "Crema", "0.03", "L", "", "", ""],
      ["Salsa verde", "Tomate verde", "1", "kg", "si", "2", "L"],
      ["Salsa verde", "Chile serrano", "0.1", "kg", "si", "2", "L"],
      ["Salsa verde", "Cebolla", "0.15", "kg", "si", "2", "L"],
    ]
  );
}

export function render(el) {
  let sub = "platillos";   // platillos | preparaciones
  let editando = null;     // { nombre, esPrep }

  function shell() {
    el.innerHTML = `
      <div class="segmented" style="font-size:13px">
        <button data-s="platillos">Platillos</button>
        <button data-s="preparaciones">Preparaciones</button>
      </div>
      <div id="rsub"></div>`;
    el.querySelectorAll(".segmented button").forEach((b) => {
      b.classList.toggle("act", b.dataset.s === sub);
      b.addEventListener("click", () => { sub = b.dataset.s; editando = null; shell(); });
    });
    pintar();
  }

  function pintar() {
    const cont = el.querySelector("#rsub");
    if (editando) return editor(cont, editando.nombre, editando.esPrep);
    if (sub === "platillos") return listaPlatillos(cont);
    return listaPreparaciones(cont);
  }

  // ── Lista de platillos ──
  function listaPlatillos(cont) {
    const st = { q: "" };
    function draw() {
      const costos = store.mapaCostos();
      const q = st.q.trim().toLowerCase();
      const arr = platillos().filter((p) => !q || p.producto.toLowerCase().includes(q));
      const conReceta = arr.filter((p) => store.recetasDe(p.producto).length).length;
      cont.innerHTML = `
        <div class="card">
          <h2 style="margin-bottom:2px">Recetas por platillo</h2>
          <p class="sub" style="margin-top:0">Con receta: <b>${conReceta}</b> de ${arr.length}. Captura la receta y el costo/margen salen solos de tus compras.</p>
          <div class="fila" style="gap:8px;margin:8px 0 4px">
            <button class="btn sec chico" id="impcsv" style="flex:1">⬆ Importar CSV</button>
            <button class="btn sec chico" id="plantilla" style="flex:1">⬇ Descargar formato</button>
          </div>
          <input type="file" id="fcsv" accept=".csv,text/csv" style="display:none" />
          <input id="bq" placeholder="Buscar platillo…" style="margin:6px 0 12px" value="${esc(st.q)}" />
          <div id="lista"></div>
        </div>`;
      const lista = cont.querySelector("#lista");
      if (!arr.length) { lista.innerHTML = `<div class="vacio">No hay platillos. Importa tus ventas (productos_venta) primero.</div>`; }
      else lista.innerHTML = arr.map((p) => {
        const tiene = store.recetasDe(p.producto).length > 0;
        const costo = costos.has(p.producto) ? costos.get(p.producto) : null;
        const margPct = tiene && costo != null && p.precio > 0 ? (p.precio - costo) / p.precio * 100 : null;
        return `
          <button class="fila-item" data-p="${esc(p.producto)}" style="width:100%;text-align:left;background:none;border:none;border-bottom:1px solid var(--linea);padding:12px 2px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px">
            <span style="min-width:0">
              <b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.producto)}</b>
              <span class="sub" style="font-size:12px">${esc(p.categoria || "")}${p.precio ? " · vende " + money(p.precio) : ""}</span>
            </span>
            <span style="text-align:right;white-space:nowrap">
              ${tiene && costo != null
                ? `<span class="monto" style="font-size:14px">${money(costo)}</span><br><span class="sub" style="font-size:11.5px;color:${colorMargen(margPct)};font-weight:700">${margPct != null ? "margen " + margPct.toFixed(0) + "%" : ""}</span>`
                : `<span class="sub" style="font-size:12px;color:var(--rojo)">Sin receta →</span>`}
            </span>
          </button>`;
      }).join("");
      const bq = cont.querySelector("#bq");
      bq.addEventListener("input", () => { st.q = bq.value; const s = bq.selectionStart; draw(); const nb = cont.querySelector("#bq"); nb.focus(); nb.setSelectionRange(s, s); });
      cont.querySelector("#plantilla").addEventListener("click", descargarPlantilla);
      const fcsv = cont.querySelector("#fcsv");
      cont.querySelector("#impcsv").addEventListener("click", () => fcsv.click());
      fcsv.addEventListener("change", async () => {
        const file = fcsv.files[0]; if (!file) return;
        const btn = cont.querySelector("#impcsv"); if (btn) btn.textContent = "Importando…";
        try {
          const grupos = gruposDesdeCSV(parsearCSV(await file.text()));
          if (!grupos.length) alert("No encontré recetas en el CSV. Debe tener columnas 'platillo' e 'insumo'. Usa 'Descargar formato'.");
          else { const n = await store.importarRecetas(grupos); alert(`Listo: ${n} recetas/subrecetas importadas.`); draw(); }
        } catch (e) { alert("Error al importar: " + (e.message || e)); }
        fcsv.value = ""; const b2 = cont.querySelector("#impcsv"); if (b2) b2.textContent = "⬆ Importar CSV";
      });
      cont.querySelectorAll(".fila-item").forEach((b) => b.addEventListener("click", () => { editando = { nombre: b.dataset.p, esPrep: false }; pintar(); }));
    }
    draw();
  }

  // ── Lista de preparaciones ──
  function listaPreparaciones(cont) {
    const preps = preparaciones();
    cont.innerHTML = `
      <div class="card">
        <h2 style="margin-bottom:2px">Preparaciones base</h2>
        <p class="sub" style="margin-top:0">Salsas, masas, aderezos… que usas en varios platillos. Se costean una vez y se reutilizan como un insumo más.</p>
        <button class="btn" id="nueva" style="margin:8px 0 12px">＋ Nueva preparación</button>
        <div id="lp"></div>
      </div>`;
    const lp = cont.querySelector("#lp");
    if (!preps.length) lp.innerHTML = `<div class="vacio">Aún no hay preparaciones. Crea una si tienes recetas base (ej. "Salsa verde").</div>`;
    else lp.innerHTML = preps.map((nom) => {
      const rend = (store.state.recetas.find((r) => r.producto === nom && r.es_preparacion) || {}).rendimiento || 1;
      const unidad = (store.recetasDe(nom)[0] || {}).unidad || "";
      const costoUnit = store.costoInsumo(nom);
      return `
        <button class="fila-item" data-p="${esc(nom)}" style="width:100%;text-align:left;background:none;border:none;border-bottom:1px solid var(--linea);padding:12px 2px;cursor:pointer;display:flex;justify-content:space-between;align-items:center">
          <span><b>${esc(nom)}</b><br><span class="sub" style="font-size:12px">rinde ${esc(String(rend))} ${esc(unidad)}</span></span>
          <span class="monto" style="font-size:14px">${money(costoUnit)}${unidad ? `<span class="sub" style="font-weight:400">/${esc(unidad)}</span>` : ""}</span>
        </button>`;
    }).join("");
    cont.querySelector("#nueva").addEventListener("click", () => { editando = { nombre: "", esPrep: true }; pintar(); });
    cont.querySelectorAll(".fila-item").forEach((b) => b.addEventListener("click", () => { editando = { nombre: b.dataset.p, esPrep: true }; pintar(); }));
  }

  // ── Editor de receta ──
  function editor(cont, nombre, esPrep) {
    const existentes = nombre ? store.recetasDe(nombre) : [];
    const filaPrep = esPrep && nombre ? store.state.recetas.find((r) => r.producto === nombre && r.es_preparacion) : null;
    let items = existentes.map((r) => ({ insumo: r.insumo, cantidad: r.cantidad, unidad: r.unidad || "", modo: store.esPreparacion(r.insumo) ? "subreceta" : "insumo" }));
    if (!items.length) items = [{ insumo: "", cantidad: "", unidad: "", modo: "insumo" }];
    let nom = nombre || "";
    let rendimiento = filaPrep ? filaPrep.rendimiento : 1;
    let unidadRinde = esPrep && nombre ? store.unidadPreparacion(nombre) : "";

    const insumosLista = store.preciosPorInsumo();
    const datalist = `<datalist id="dl-insumos">${insumosLista.map((i) => `<option value="${esc(i.nombre)}">`).join("")}${preparaciones().filter((p) => p !== nom).map((p) => `<option value="${esc(p)}">`).join("")}</datalist>`;

    const plat = !esPrep ? platillos().find((p) => p.producto === nombre) : null;
    const precioVenta = plat ? plat.precio : 0;

    const prepsDisp = () => preparaciones().filter((p) => p !== nom);
    function unidadDe(insumo) {
      if (store.esPreparacion(insumo)) return store.unidadPreparacion(insumo);
      const hit = insumosLista.find((i) => i.nombre.toLowerCase() === String(insumo).trim().toLowerCase());
      return hit ? (hit.unidad || "") : "";
    }

    function draw() {
      const costoTotal = items.reduce((a, it) => a + num(it.cantidad) * store.costoInsumo(it.insumo), 0);
      const costoUnit = esPrep && num(rendimiento) > 0 ? costoTotal / num(rendimiento) : costoTotal;
      const margen = precioVenta - costoTotal;
      const margPct = precioVenta > 0 ? margen / precioVenta * 100 : null;

      cont.innerHTML = `
        ${datalist}
        <div class="card">
          <button class="btn sec chico" id="volver" style="margin-bottom:10px">← Volver</button>
          ${esPrep
            ? `<label class="sub">Nombre de la preparación</label>
               <input id="nom" placeholder="Ej. Salsa verde" value="${esc(nom)}" style="margin:4px 0 10px" />
               <div class="fila">
                 <div style="flex:1"><label class="sub">Rinde (cantidad)</label><input id="rend" type="number" inputmode="decimal" min="0" step="any" value="${esc(String(rendimiento))}" /></div>
                 <div style="flex:1"><label class="sub">Unidad que rinde</label><input id="urinde" placeholder="L, kg, pza" value="${esc(unidadRinde)}" /></div>
               </div>`
            : `<h2 style="margin:0 0 2px">${esc(nombre)}</h2>
               <p class="sub" style="margin-top:0">${plat && plat.categoria ? esc(plat.categoria) + " · " : ""}${precioVenta ? "se vende en " + money(precioVenta) : "sin precio de venta"}</p>`}

          <div style="margin-top:12px;font-weight:700;font-size:13px">Ingredientes</div>
          <div id="rows"></div>
          <div class="fila" style="gap:8px;margin-top:8px">
            <button class="btn sec chico" id="add" style="flex:1">＋ Ingrediente</button>
            <button class="btn sec chico" id="addprep" style="flex:1"${prepsDisp().length ? "" : " disabled"}>＋ Subreceta</button>
          </div>

          <div style="margin-top:16px;border-top:1px solid var(--linea);padding-top:12px">
            <div class="fila" style="justify-content:space-between"><span class="sub">Costo de la receta</span><b>${money(costoTotal)}</b></div>
            ${esPrep
              ? `<div class="fila" style="justify-content:space-between"><span class="sub">Costo por ${esc(unidadRinde || "unidad")}</span><b>${money(costoUnit)}</b></div>`
              : `<div class="fila" style="justify-content:space-between"><span class="sub">Precio de venta</span><b>${money(precioVenta)}</b></div>
                 <div class="fila" style="justify-content:space-between"><span class="sub">Margen</span><b style="color:${colorMargen(margPct)}">${money(margen)}${margPct != null ? " · " + margPct.toFixed(0) + "%" : ""}</b></div>`}
          </div>

          <button class="btn" id="guardar" style="margin-top:14px">Guardar receta</button>
          ${(existentes.length) ? `<button class="btn sec chico" id="borrar" style="margin-top:6px;color:var(--rojo)">Borrar receta</button>` : ""}
          <div id="msg" class="sub" style="text-align:center;margin-top:8px;min-height:1em"></div>
        </div>`;

      const rows = cont.querySelector("#rows");
      rows.innerHTML = items.map((it, i) => {
        const linea = num(it.cantidad) * store.costoInsumo(it.insumo);
        const campo = it.modo === "subreceta"
          ? `<select class="rin" style="flex:2;min-width:0"><option value="">— elige subreceta —</option>${prepsDisp().map((p) => `<option value="${esc(p)}"${p === it.insumo ? " selected" : ""}>${esc(p)}</option>`).join("")}</select>`
          : `<input class="rin" list="dl-insumos" placeholder="Insumo" value="${esc(it.insumo)}" style="flex:2;min-width:0" />`;
        return `
          <div class="fila" style="gap:6px;align-items:center;margin-top:8px" data-i="${i}">
            ${campo}
            <input class="rc" type="number" inputmode="decimal" min="0" step="any" placeholder="Cant." value="${esc(String(it.cantidad))}" style="flex:1;min-width:0" />
            <span class="sub" style="width:38px;font-size:11px">${esc(it.unidad || unidadDe(it.insumo))}${it.modo === "subreceta" ? " 🧪" : ""}</span>
            <span class="sub" style="width:64px;text-align:right;font-size:12px">${linea ? money(linea) : ""}</span>
            <button class="rx" title="Quitar" style="background:none;border:none;color:var(--rojo);cursor:pointer;font-size:18px;width:24px">×</button>
          </div>`;
      }).join("");

      // eventos de filas
      rows.querySelectorAll("[data-i]").forEach((fila) => {
        const i = +fila.dataset.i;
        const rin = fila.querySelector(".rin"), rc = fila.querySelector(".rc");
        rin.addEventListener("change", () => { items[i].insumo = rin.value; items[i].unidad = unidadDe(rin.value); draw(); });
        rin.addEventListener("blur", () => { if (items[i].insumo !== rin.value) { items[i].insumo = rin.value; items[i].unidad = unidadDe(rin.value); draw(); } });
        rc.addEventListener("input", () => { items[i].cantidad = rc.value; });
        rc.addEventListener("blur", draw);
        fila.querySelector(".rx").addEventListener("click", () => { items.splice(i, 1); if (!items.length) items.push({ insumo: "", cantidad: "", unidad: "" }); draw(); });
      });

      cont.querySelector("#volver").addEventListener("click", () => { editando = null; pintar(); });
      cont.querySelector("#add").addEventListener("click", () => { items.push({ insumo: "", cantidad: "", unidad: "", modo: "insumo" }); draw(); });
      const ap = cont.querySelector("#addprep");
      if (ap) ap.addEventListener("click", () => { items.push({ insumo: "", cantidad: "", unidad: "", modo: "subreceta" }); draw(); });
      if (esPrep) {
        cont.querySelector("#nom").addEventListener("input", (e) => { nom = e.target.value; });
        cont.querySelector("#rend").addEventListener("input", (e) => { rendimiento = e.target.value; });
        cont.querySelector("#urinde").addEventListener("input", (e) => { unidadRinde = e.target.value; });
      }
      cont.querySelector("#guardar").addEventListener("click", guardar);
      const bb = cont.querySelector("#borrar");
      if (bb) bb.addEventListener("click", borrar);
    }

    async function guardar() {
      const destino = esPrep ? nom.trim() : nombre;
      const msg = cont.querySelector("#msg");
      if (esPrep && !destino) { msg.textContent = "Ponle nombre a la preparación."; return; }
      const limpios = items.filter((it) => it.insumo.trim() && num(it.cantidad) > 0);
      if (!limpios.length) { msg.textContent = "Agrega al menos un ingrediente con cantidad."; return; }
      msg.textContent = "Guardando…";
      try {
        await store.guardarReceta(destino, limpios.map((it) => ({ insumo: it.insumo.trim(), cantidad: num(it.cantidad), unidad: it.unidad || unidadDe(it.insumo) })),
          esPrep ? { es_preparacion: true, rendimiento: num(rendimiento) || 1, rinde_unidad: unidadRinde } : {});
        editando = null; shell();
      } catch (e) { msg.textContent = "Error: " + (e.message || e); }
    }
    async function borrar() {
      if (!confirm("¿Borrar la receta de " + (nombre || nom) + "?")) return;
      try { await store.borrarReceta(nombre || nom); if (!esPrep) await store.borrarCostoPlatillo(nombre); editando = null; shell(); }
      catch (e) { cont.querySelector("#msg").textContent = "Error: " + (e.message || e); }
    }

    draw();
  }

  shell();
  return () => {};
}
