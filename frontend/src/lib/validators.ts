/**
 * Validaciones personalizadas de documentos de identidad ecuatorianos (Cédula y RUC).
 */

export function validateEcuadorianDocument(doc: string, tipo: 'cedula' | 'ruc'): boolean {
  if (!doc || !/^\d+$/.test(doc)) {
    return false;
  }

  const len = doc.length;
  if (tipo === 'cedula' && len !== 10) {
    return false;
  }
  if (tipo === 'ruc' && len !== 13) {
    return false;
  }

  // Validar código de provincia (primeros dos dígitos entre 01 y 24, o 30)
  const provincia = parseInt(doc.substring(0, 2), 10);
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) {
    return false;
  }

  const tercerDigito = parseInt(doc.charAt(2), 10);

  if (tipo === 'cedula') {
    if (tercerDigito >= 6) {
      return false;
    }
    return validateModulo10(doc);
  } else {
    // RUC (13 dígitos)
    // El establecimiento (últimos tres dígitos) no puede ser 000
    if (doc.substring(10) === '000') {
      return false;
    }

    if (tercerDigito < 6) {
      // Persona natural: primeros 10 dígitos deben ser una cédula válida
      return validateModulo10(doc.substring(0, 10));
    } else if (tercerDigito === 9) {
      // Persona jurídica / Sociedad privada: módulo 11
      // Coeficientes: 4, 3, 2, 7, 6, 5, 4, 3, 2 (para los primeros 9 dígitos)
      const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
      let suma = 0;
      for (let i = 0; i < 9; i++) {
        suma += parseInt(doc.charAt(i), 10) * coeficientes[i];
      }
      const residuo = suma % 11;
      const verificador = parseInt(doc.charAt(9), 10);

      let digitoEsperado = residuo === 0 ? 0 : 11 - residuo;
      if (digitoEsperado === 10) {
        digitoEsperado = 0;
      }

      return digitoEsperado === verificador;
    } else if (tercerDigito === 6) {
      // Entidad pública: módulo 11
      // Coeficientes: 3, 2, 7, 6, 5, 4, 3, 2 (para los primeros 8 dígitos)
      if (doc.substring(9) === '0000') {
        return false;
      }
      const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2];
      let suma = 0;
      for (let i = 0; i < 8; i++) {
        suma += parseInt(doc.charAt(i), 10) * coeficientes[i];
      }
      const residuo = suma % 11;
      const verificador = parseInt(doc.charAt(8), 10);

      let digitoEsperado = residuo === 0 ? 0 : 11 - residuo;
      if (digitoEsperado === 10) {
        digitoEsperado = 0;
      }

      return digitoEsperado === verificador;
    }
  }

  return false;
}

function validateModulo10(cedula: string): boolean {
  // Algoritmo de Luhn / Módulo 10 con coeficientes 2, 1, 2, 1, 2, 1, 2, 1, 2
  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let val = parseInt(cedula.charAt(i), 10) * coeficientes[i];
    if (val >= 10) {
      val -= 9;
    }
    suma += val;
  }

  const verificador = parseInt(cedula.charAt(9), 10);
  const residuo = suma % 10;
  const digitoEsperado = residuo === 0 ? 0 : 10 - residuo;

  return digitoEsperado === verificador;
}
