// Heurística de detecção de página de checkout (Nuvemshop e afins).
const CHECKOUT_RE = /(checkout|carrinho|\/cart|finalizar-compra|pagamento)/i;

export function isCheckoutPage(): boolean {
  try {
    return CHECKOUT_RE.test(window.location.pathname);
  } catch {
    return false;
  }
}
