// O que fica guardado neste navegador: os ajustes salvos e o que foi tirado do mapa.
const PREFIX = "founders-os:";

export function load<T>(key: string, fallback: T): T {
  try {
    const text = localStorage.getItem(PREFIX + key);
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Sem armazenamento (janela privada): o ajuste vale só nesta sessão.
  }
}
