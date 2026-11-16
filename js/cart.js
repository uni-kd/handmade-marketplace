// =====================================================================
// cart.js - cart page (cart.html)
// The cart lives in localStorage (see getCart / saveCart in app.js).
// This page shows it and lets the customer change it.
// =====================================================================

// The cart may be days old. Before showing it, ask Supabase for the
// current price and stock of each product and correct the cart.
async function refreshCartFromDatabase() {
  const cart = getCart();
  if (cart.length === 0) return [];

  const ids = cart.map((item) => item.id);

  // SELECT id, name, price, stock, image_url FROM product WHERE id IN (...)
  const { data: products, error } = await supabaseClient
    .from("product")
    .select("id, name, price, stock, image_url")
    .in("id", ids);

  if (error) {
    console.error(error);
    return [];
  }

  const notes = [];
  const updated = [];

  cart.forEach((item) => {
    const product = products.find((p) => p.id === item.id);

    if (!product || product.stock <= 0) {
      notes.push(item.name + " is no longer available and was removed.");
      return;
    }
    if (item.quantity > product.stock) {
      notes.push("Only " + product.stock + " of " + product.name + " left. Quantity was reduced.");
      item.quantity = product.stock;
    }
    item.name = product.name;
    item.price = Number(product.price);
    item.image_url = product.image_url;
    item.stock = product.stock;
    updated.push(item);
  });

  saveCart(updated);
  return notes;
}

function renderCart() {
  const cart = getCart();
  const box = document.getElementById("cart-items");
  const summary = document.getElementById("cart-summary");

  if (cart.length === 0) {
    box.innerHTML = '<div class="empty"><p>Your cart is empty.</p><a class="btn" href="products.html">Go to shop</a></div>';
    summary.classList.add("hidden");
    return;
  }
  summary.classList.remove("hidden");

  box.innerHTML = cart.map((item) => `
    <div class="cart-item">
      <img src="${esc(item.image_url)}" alt="">
      <div>
        <a href="product-detail.html?id=${item.id}"><strong>${esc(item.name)}</strong></a>
        <div class="muted small">${money(item.price)} each</div>
      </div>
      <div class="controls">
        <input type="number" class="quantity" data-id="${item.id}" value="${item.quantity}"
               min="1" max="${item.stock || 99}" aria-label="Quantity of ${esc(item.name)}">
        <strong>${money(item.price * item.quantity)}</strong>
        <button class="btn btn-outline btn-small remove" data-id="${item.id}">Remove</button>
      </div>
    </div>`).join("");

  // Summary. Prices already include 5% VAT, so the VAT part of a
  // total is total x 5 / 105.
  const total = cartTotal();
  document.getElementById("summary-count").textContent = cartCount();
  document.getElementById("summary-vat").textContent = money(total * 5 / 105);
  document.getElementById("summary-total").textContent = money(total);

  // Change quantity
  box.querySelectorAll(".quantity").forEach((input) => {
    input.addEventListener("change", () => {
      const items = getCart();
      const item = items.find((i) => i.id === Number(input.dataset.id));
      let quantity = Math.floor(Number(input.value));
      if (!quantity || quantity < 1) quantity = 1;
      if (item.stock && quantity > item.stock) quantity = item.stock;
      item.quantity = quantity;
      saveCart(items);
      renderCart();
    });
  });

  // Remove one product
  box.querySelectorAll(".remove").forEach((button) => {
    button.addEventListener("click", () => {
      saveCart(getCart().filter((i) => i.id !== Number(button.dataset.id)));
      renderCart();
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const notes = await refreshCartFromDatabase();
  if (notes.length > 0) {
    showMessage(document.getElementById("message"), notes.join(" "), "info");
  }
  renderCart();

  document.getElementById("clear-cart").addEventListener("click", () => {
    if (confirm("Remove everything from your cart?")) {
      saveCart([]);
      renderCart();
    }
  });
});
