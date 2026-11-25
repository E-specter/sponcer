// Marcas diacríticas combinantes tras normalizar a NFD. Coincide con la tilde suelta de "e" + U+0301;
// no coincide con "e". Probar: https://regex101.com/?regex=%5B%5Cu0300-%5Cu036f%5D&flags=g&testString=cafe&flavor=javascript
const DIACRITICS = /[̀-ͯ]/g;

// Separador de palabras: todo lo que no sea letra ni dígito. Coincide con " " y "#" en "hola #moda";
// no coincide con las letras de "moda". Probar: https://regex101.com/?regex=%5B%5E%5Cp%7BL%7D%5Cp%7BN%7D%5D%2B&flags=gu&testString=hola%20%23moda&flavor=javascript
const NON_WORD = /[^\p{L}\p{N}]+/u;

export const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();

export const tokenize = (s: string): string[] => normalizeText(s).split(NON_WORD).filter(Boolean);
