// =====================================================================
// confirmation.js - order confirmation page (confirmation.html)
// Reads the saved order back from Supabase to prove it was stored.
// =====================================================================

// Builds the table of products for one order. Also used on account.html.
function orderItemsTable(order) {
  const rows = order.order_items.map((item) => `
    <tr>
      <td>${esc(item.product ? item.product.name : "Product")}</td>
      <td>${item.quantity}</td>
      <td>${money(item.unit_price)}</td>
      <td>${money(item.unit_price * item.quantity)}</td>
    </tr>`).join("");

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const box = document.getElementById("confirmation");
  if (!box) return;   // this file is also loaded by account.html

  const user = await requireLogin();
  if (!user) return;

  const orderId = Number(getParam("order"));

  // SELECT the order with its items and product names.
  // RLS makes sure a customer can only open their own order.
  const { data: order, error } = await supabaseClient
    .from("orders")
    .select("*, order_items(quantity, unit_price, product(name))")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    if (error) console.error(error);
    box.innerHTML = '<p class="message error">Order not found.</p><a class="btn" href="account.html">My orders</a>';
    return;
  }

  box.innerHTML = `
    <div class="message success">Thank you. Your order has been placed.</div>
    <h1>Order #${order.id}</h1>
    <p class="muted">${formatDate(order.order_date)} · <span class="badge status">${esc(order.status)}</span></p>
    ${orderItemsTable(order)}
    <div class="summary-row"><span class="muted small">Includes 5% VAT</span><span class="muted small">${money(order.total * 5 / 105)}</span></div>
    <div class="summary-row total"><span>Total</span><span>${money(order.total)}</span></div>
    <h3 style="margin-top:20px">Delivery</h3>
    <p>${esc(order.shipping_address)}<br>${esc(order.phone)}<br>Payment: cash on delivery</p>
    <a class="btn" href="products.html">Continue shopping</a>
    <a class="btn btn-outline" href="account.html">My orders</a>`;
});
