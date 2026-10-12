/**
 * Política mínima de contraseñas (SEC-015).
 * Se aplica al crear/actualizar usuarios desde la administración. La longitud
 * mínima es 12 caracteres (antes 6, considerada débil).
 */
export const MIN_PASSWORD_LENGTH = 12;

export const MIN_PASSWORD_MESSAGE = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
