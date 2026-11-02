// Lector de Server-Sent Events sobre fetch.
//
// EventSource no sirve aquí: no permite enviar la cabecera Authorization, y el
// token no debe ir en la URL (acaba en registros y en el historial). Se lee el
// flujo de fetch y se interpreta a mano.

/**
 * Devuelve un objeto con `alimentar(texto)`: se le pasan los fragmentos tal como
 * llegan (pueden cortar una línea o un evento por la mitad) y llama a
 * `alEvento({ evento, datos })` por cada evento completo. Los comentarios
 * (`: ping`) y `retry:` se ignoran.
 *
 * @param {(e: { evento: string, datos: string }) => void} alEvento
 */
export function crearLectorSSE(alEvento) {
  let resto = '';
  let evento = 'message';
  let datos = [];

  function linea(l) {
    if (l === '') {
      if (datos.length) alEvento({ evento, datos: datos.join('\n') });
      evento = 'message';
      datos = [];
      return;
    }
    if (l.startsWith(':')) return;
    const i = l.indexOf(':');
    const campo = i === -1 ? l : l.slice(0, i);
    let valor = i === -1 ? '' : l.slice(i + 1);
    if (valor.startsWith(' ')) valor = valor.slice(1);
    if (campo === 'event') evento = valor;
    else if (campo === 'data') datos.push(valor);
  }

  return {
    alimentar(texto) {
      resto += texto;
      let corte;
      // Las líneas terminan en \n, \r\n o \r.
      while ((corte = resto.search(/\r\n|\n|\r/)) !== -1) {
        const fin = resto[corte] === '\r' && resto[corte + 1] === '\n' ? 2 : 1;
        // Un \r al final del fragmento puede ser medio \r\n: se espera al siguiente.
        if (resto[corte] === '\r' && corte + 1 === resto.length) return;
        linea(resto.slice(0, corte));
        resto = resto.slice(corte + fin);
      }
    },
  };
}
