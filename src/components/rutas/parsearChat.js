function normalizar(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizarFechaWA(str) {
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = (parseInt(y) < 50 ? '20' : '19') + y;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function detectarChapa(texto) {
  const conPrefijo = texto.match(
    /(?:chapa|placa|matr[ií]cula|unidad|veh[ií]culo)[:\s]*([a-zA-Z]\d{4,7})/i
  );
  if (conPrefijo) return conPrefijo[1].toUpperCase();
  const libre = texto.match(/\b([a-zA-Z]\d{4,7})\b/);
  if (libre) return libre[1].toUpperCase();
  return null;
}

export function extraerKmTotal(texto) {
  const patrones = [
    /km\s*tot(?:al(?:es?)?)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i,
    /tot(?:al(?:es?)?)?\s*km\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i,
    /tot(?:al(?:es?)?)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*km/i,
    /(\d+(?:[.,]\d+)?)\s*km\s+(?:en\s+)?total/i,
    /recorr(?:ido|idos?)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*km/i,
    /acumul(?:ado)?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*km/i,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) return parseFloat(m[1].replace(',', '.'));
  }
  return null;
}

export function extraerLitros(texto) {
  const patrones = [
    /litros?\s*estimados?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i,
    /estimados?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*[lL](?:itros?)?/i,
    /consumo\s*[:\-]?\s*(\d+(?:[.,]\d+)?)\s*[lL]/i,
    /litros?\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/i,
    /(\d+(?:[.,]\d+)?)\s*litros?/i,
    /(\d+(?:[.,]\d+)?)\s*[lL](?:\b|\.)/,
  ];
  for (const p of patrones) {
    const m = texto.match(p);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (val > 0 && val < 10000) return val;
    }
  }
  return null;
}

export function matchRutaCatalogo(textoRuta, rutasCatalogo) {
  const palabrasTexto = new Set(
    normalizar(textoRuta).split(' ').filter(w => w.length > 2)
  );
  if (palabrasTexto.size === 0) return null;

  let mejorScore = 0;
  let mejorRuta = null;

  for (const r of rutasCatalogo) {
    const palabrasRuta = normalizar(r.nombre).split(' ').filter(w => w.length > 2);
    if (palabrasRuta.length === 0) continue;
    const coincidencias = palabrasRuta.filter(w => palabrasTexto.has(w)).length;
    const score = coincidencias / palabrasRuta.length;
    if (score > mejorScore && score >= 0.5) {
      mejorScore = score;
      mejorRuta = r;
    }
  }
  return mejorRuta;
}

export function extraerRutasKm(textoCuerpo, rutasCatalogo) {
  const lineas = textoCuerpo.split('\n');
  const resultados = [];

  for (const linea of lineas) {
    const l = linea.trim();
    if (!l) continue;
    if (/tot(?:al)?/i.test(l) && /km/i.test(l)) continue;
    if (/litros?/i.test(l)) continue;
    if (/(?:chapa|placa|matr[ií]cula)/i.test(l)) continue;
    if (/buen(?:os|as)\s+d[ií]as/i.test(l)) continue;

    const m = l.match(/^(.+?)[\s:]+(\d+(?:[.,]\d+)?)\s*km/i);
    if (m) {
      let textoRuta = m[1]
        .replace(/^(?:ruta|recorrido|destino|viaje)[:\s]*/i, '')
        .trim();
      const km = parseFloat(m[2].replace(',', '.'));
      if (km > 0 && km < 3000 && textoRuta.length > 1) {
        const rutaMatch = matchRutaCatalogo(textoRuta, rutasCatalogo);
        resultados.push({
          texto_original: textoRuta,
          km,
          ruta_id:     rutaMatch?.id    || null,
          ruta_nombre: rutaMatch?.nombre || textoRuta,
          matched:     !!rutaMatch,
        });
      }
    }
  }

  return resultados;
}

export function parsearChatWhatsApp(textoCrudo, rutasCatalogo = [], vehiculos = []) {
  const registros = [];
  // Soporta: "DD/MM/YYYY, HH:MM a. m. - Nombre: texto"
  //          "DD/MM/YYYY, HH:MM - Nombre: texto"
  //          "DD/MM/YYYY, HH:MM:SS - Nombre: texto"
  const reHeader = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s*m\.?\s*)?-\s*([^:]+):\s*(.*)/;

  const lineas = textoCrudo.replace(/\r\n/g, '\n').split('\n');
  let actual = null;

  const flush = () => {
    if (!actual) return;
    const chapa = detectarChapa(actual.cuerpo);
    if (!chapa) return;

    const km_total = extraerKmTotal(actual.cuerpo);
    const litros   = extraerLitros(actual.cuerpo);
    const rutas    = extraerRutasKm(actual.cuerpo, rutasCatalogo);

    const veh = vehiculos.find(v =>
      v.codigo_interno?.toUpperCase() === chapa ||
      normalizar(v.nombre).includes(normalizar(chapa))
    );

    const km_calc = km_total ?? (rutas.length > 0 ? rutas.reduce((s, r) => s + r.km, 0) : null);

    registros.push({
      fecha:             actual.fecha,
      chapa,
      conductor_texto:   actual.remitente,
      rutas,
      km_total:          km_calc,
      litros,
      consumidor_id:     veh?.id     || null,
      consumidor_nombre: veh?.nombre || chapa,
      texto_mensaje:     actual.cuerpo.trim(),
    });
  };

  for (const linea of lineas) {
    const m = linea.match(reHeader);
    if (m) {
      flush();
      const [, fechaRaw, remitente, primerLinea] = m;
      actual = {
        fecha:     normalizarFechaWA(fechaRaw) ?? fechaRaw,
        remitente: remitente.trim(),
        cuerpo:    primerLinea,
      };
    } else if (actual) {
      actual.cuerpo += '\n' + linea;
    }
  }
  flush();

  return registros;
}
