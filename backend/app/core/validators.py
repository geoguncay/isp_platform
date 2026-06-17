"""
Validaciones personalizadas para la plataforma (cédula ecuatoriana, etc.).
"""

def validate_ecuadorian_cedula(cedula: str) -> bool:
    """
    Valida una cédula ecuatoriana (10 dígitos) o un RUC (13 dígitos) utilizando los algoritmos oficiales.
    """
    if not cedula or not cedula.isdigit():
        return False

    length = len(cedula)
    if length not in (10, 13):
        return False

    # Validar código de provincia (primeros dos dígitos entre 01 y 24, o 30)
    provincia = int(cedula[:2])
    if not (1 <= provincia <= 24 or provincia == 30):
        return False

    tercer_digito = int(cedula[2])

    if length == 10:
        # El tercer dígito debe ser menor a 6 para personas naturales en cédula
        if tercer_digito >= 6:
            return False
        return _validate_modulo10_cedula(cedula)
    else:
        # RUC (13 dígitos)
        # El establecimiento (últimos dígitos) no puede ser 000
        if cedula[10:] == "000":
            return False

        if tercer_digito < 6:
            # Persona natural: los primeros 10 dígitos deben ser una cédula válida
            return _validate_modulo10_cedula(cedula[:10])
        elif tercer_digito == 9:
            # Persona jurídica / Sociedad privada: módulo 11
            # Coeficientes: 4, 3, 2, 7, 6, 5, 4, 3, 2
            coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2]
            suma = sum(int(cedula[i]) * coeficientes[i] for i in range(9))
            residuo = suma % 11
            verificador = int(cedula[9])

            digito_esperado = 0 if residuo == 0 else 11 - residuo
            if digito_esperado == 10:
                digito_esperado = 0

            return digito_esperado == verificador
        elif tercer_digito == 6:
            # Entidad pública: módulo 11
            # Coeficientes: 3, 2, 7, 6, 5, 4, 3, 2
            if cedula[9:] == "0000":
                return False
            coeficientes = [3, 2, 7, 6, 5, 4, 3, 2]
            suma = sum(int(cedula[i]) * coeficientes[i] for i in range(8))
            residuo = suma % 11
            verificador = int(cedula[8])

            digito_esperado = 0 if residuo == 0 else 11 - residuo
            if digito_esperado == 10:
                digito_esperado = 0

            return digito_esperado == verificador

    return False


def _validate_modulo10_cedula(cedula: str) -> bool:
    # Algoritmo de Luhn / Módulo 10 con coeficientes 2, 1, 2, 1, 2, 1, 2, 1, 2
    coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2]
    suma = 0
    for i in range(9):
        val = int(cedula[i]) * coeficientes[i]
        if val >= 10:
            val -= 9
        suma += val

    verificador = int(cedula[9])

    # Obtener el residuo y el dígito esperado
    residuo = suma % 10
    if residuo == 0:
        digito_esperado = 0
    else:
        digito_esperado = 10 - residuo

    return digito_esperado == verificador

